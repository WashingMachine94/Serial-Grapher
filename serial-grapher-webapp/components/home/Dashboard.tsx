'use client';

import {
    type CSSProperties,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import Highcharts from 'highcharts/highstock.src';
import HighchartsReact from 'highcharts-react-official';
import { ArrowLineDownIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { dataBufferManager, type NodeData } from '@/utils/dataBufferManager';
import { graphManager, type GraphType } from '@/utils/graphManager';
import {
    ADD_POINT_LIMIT,
    ZOOM_FACTOR,
    DEFAULT_SCROLL_RANGE,
    applySnapping,
    buildCsvExportContent,
    clearMeasurement,
    drawMeasurement,
    findClosestPoint,
    getLatestTimestamp,
    getVisibleWindowRange,
    numericChartOptions,
    renderCrosshairs,
} from './dashboard/dashboard';

const EMPTY_GRAPHS: Array<{
    id: string;
    name: string;
    type: GraphType;
    nodeIds: string[];
}> = [];
const EMPTY_NODES: NodeData[] = [];
const MANUAL_INTERACTION_LOCK_MS = 140;

function uniqueNodesById(nodes: NodeData[]) {
    return Array.from(
        new Map(nodes.map((node) => [node.id, node] as const)).values(),
    );
}

function buildGraphSeries(graphType: GraphType, nodes: NodeData[]) {
    return uniqueNodesById(nodes)
        .filter((node) => node.enabled)
        .filter((node) => !node.isTimestamp)
        .map((node) => ({
            id: node.id,
            type:
                graphType === 'area'
                    ? 'area'
                    : graphType === 'bar'
                      ? 'column'
                      : graphType === 'scatter'
                        ? 'scatter'
                        : 'line',
            name: `${node.parserName}: ${node.name}`,
            color: node.color,
            fillOpacity: graphType === 'area' ? 0.18 : undefined,
            data: (node.buffer ?? [])
                .filter((point) => typeof point.value === 'number')
                .map((point) => [point.timestamp, point.value]),
            marker: { enabled: false },
        }));
}

function buildGraphChartOptions(
    title: string,
    graphType: GraphType,
    nodes: NodeData[],
) {
    const series = buildGraphSeries(graphType, nodes);

    return {
        ...numericChartOptions,
        chart: {
            ...numericChartOptions.chart,
            height: null,
            spacingTop: 8,
            spacingBottom: 8,
        },
        title: {
            text: title,
            align: 'left',
            style: { fontSize: '12px', fontWeight: '600' },
        },
        credits: { enabled: false },
        legend: {
            enabled: series.length > 1,
            itemStyle: { fontSize: '10px' },
        },
        xAxis: {
            ...numericChartOptions.xAxis,
            type: 'datetime',
            labels: { style: { fontSize: '9px' } },
        },
        yAxis: {
            ...numericChartOptions.yAxis,
            title: { text: '' },
            labels: { style: { fontSize: '9px' } },
        },
        tooltip: { shared: false },
        series,
        navigator: { enabled: false },
        scrollbar: { enabled: false },
        rangeSelector: { enabled: false },
        mapNavigation: { enabled: false },
        exporting: { enabled: false },
    };
}

type GraphChartCardProps = {
    graphId: string;
    title: string;
    graphType: GraphType;
    nodes: NodeData[];
    className?: string;
    style?: CSSProperties;
    autoScroll: boolean;
    scrollRange: number;
    onAutoScrollChange: (next: boolean) => void;
    onScrollRangeChange: (next: number) => void;
    timestampSyncKeys: string[];
    onBoundsChanged: (
        timestampSyncKeys: string[],
        min: number,
        max: number,
        sourceGraphId: string,
    ) => void;
    onRegisterSyncTarget: (
        graphId: string,
        timestampSyncKeys: string[],
        applyBounds: (min: number, max: number, sourceGraphId: string) => void,
    ) => void;
    onUnregisterSyncTarget: (graphId: string) => void;
};

function GraphChartCard({
    graphId,
    title,
    graphType,
    nodes,
    className,
    style,
    autoScroll,
    scrollRange,
    onAutoScrollChange,
    onScrollRangeChange,
    timestampSyncKeys,
    onBoundsChanged,
    onRegisterSyncTarget,
    onUnregisterSyncTarget,
}: GraphChartCardProps) {
    const [snapping] = useState(true);
    const [measuring, setMeasuring] = useState(false);
    const measureStartRef = useRef<number | null>(null);
    const chartRef = useRef<HighchartsReact.RefObject | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);
    const chartHostRef = useRef<HTMLDivElement | null>(null);
    const visibleMapRef = useRef<Record<string, boolean>>({});
    const lastDrawnIndexRef = useRef<Record<string, number>>({});
    const isPanningRef = useRef(false);
    const scrollRangeRef = useRef<number>(scrollRange);
    const hasSeenDataRef = useRef(false);
    const manualInteractionUntilRef = useRef(0);
    const suppressBoundsPublishRef = useRef(false);
    const lastPublishedBoundsRef = useRef<{ min: number; max: number } | null>(
        null,
    );

    const getTimestampLabel = useCallback(() => {
        const now = new Date();
        const pad = (value: number) => value.toString().padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
            now.getDate(),
        )} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(
            now.getSeconds(),
        )}`;
    }, []);

    const triggerDownload = useCallback((blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }, []);

    const exportCsv = useCallback(() => {
        const csv = buildCsvExportContent(dataBufferManager.getParsers());
        if (!csv) return;

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        triggerDownload(blob, `Graph - ${title} - ${getTimestampLabel()}.csv`);
    }, [getTimestampLabel, title, triggerDownload]);

    const exportImage = useCallback(() => {
        const chart = chartRef.current?.chart;
        if (!chart) return;

        chart.tooltip?.hide(0);

        const svgElement = chart.container.querySelector('svg');
        if (!svgElement) return;

        const svgClone = svgElement.cloneNode(true) as SVGElement;
        svgClone
            .querySelectorAll(
                '.highcharts-tooltip, .highcharts-label.highcharts-tooltip',
            )
            .forEach((element) => element.remove());
        svgClone
            .querySelectorAll('.highcharts-legend-item-hidden')
            .forEach((element) => element.remove());

        const svgText = new XMLSerializer().serializeToString(svgClone);
        const svgBlob = new Blob([svgText], {
            type: 'image/svg+xml;charset=utf-8',
        });
        const svgUrl = URL.createObjectURL(svgBlob);
        const image = new Image();

        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = chart.chartWidth;
            canvas.height = chart.chartHeight;
            const context = canvas.getContext('2d');
            if (!context) {
                URL.revokeObjectURL(svgUrl);
                return;
            }

            context.drawImage(image, 0, 0);
            URL.revokeObjectURL(svgUrl);

            canvas.toBlob((blob) => {
                if (!blob) return;
                triggerDownload(
                    blob,
                    `Graph - ${title} - ${getTimestampLabel()}.png`,
                );
            }, 'image/png');
        };

        image.onerror = () => {
            URL.revokeObjectURL(svgUrl);
        };

        image.src = svgUrl;
    }, [getTimestampLabel, title, triggerDownload]);

    useEffect(() => {
        scrollRangeRef.current = scrollRange;
    }, [scrollRange]);

    useEffect(() => {
        const card = cardRef.current;
        const chartHost = chartHostRef.current;
        if (!card || !chartHost) return;

        const resizeChart = () => {
            const chart = chartRef.current?.chart;
            if (!chart) return;

            const width = chartHost.clientWidth;
            const height = chartHost.clientHeight;
            if (width <= 0 || height <= 0) return;

            chart.setSize(width, height, false);
        };

        resizeChart();

        const observer = new ResizeObserver(() => {
            resizeChart();
        });

        observer.observe(card);
        observer.observe(chartHost);

        window.addEventListener('resize', resizeChart);

        return () => {
            window.removeEventListener('resize', resizeChart);
            observer.disconnect();
        };
    }, []);

    const publishBounds = useCallback(
        (min: number, max: number) => {
            if (suppressBoundsPublishRef.current) return;
            if (!timestampSyncKeys.length) return;

            const lastPublishedBounds = lastPublishedBoundsRef.current;
            if (
                lastPublishedBounds &&
                Math.abs(lastPublishedBounds.min - min) < 0.001 &&
                Math.abs(lastPublishedBounds.max - max) < 0.001
            ) {
                return;
            }

            lastPublishedBoundsRef.current = { min, max };
            onBoundsChanged(timestampSyncKeys, min, max, graphId);
        },
        [graphId, onBoundsChanged, timestampSyncKeys],
    );

    const publishCurrentAxisBounds = useCallback(() => {
        const chart = chartRef.current?.chart;
        if (!chart) return;

        const axis = chart.xAxis[0];
        const min = axis.min;
        const max = axis.max;
        if (typeof min !== 'number' || typeof max !== 'number') return;
        publishBounds(min, max);
    }, [publishBounds]);

    const lockManualInteractionWindow = useCallback(() => {
        manualInteractionUntilRef.current =
            Date.now() + MANUAL_INTERACTION_LOCK_MS;
    }, []);

    const applySyncedBounds = useCallback(
        (min: number, max: number, sourceGraphId: string) => {
            if (sourceGraphId === graphId) return;

            const chart = chartRef.current?.chart;
            if (!chart) return;

            const axis = chart.xAxis[0];
            const currentMin = axis.min as number | undefined;
            const currentMax = axis.max as number | undefined;
            if (
                typeof currentMin === 'number' &&
                typeof currentMax === 'number' &&
                Math.abs(currentMin - min) < 0.001 &&
                Math.abs(currentMax - max) < 0.001
            ) {
                return;
            }

            lockManualInteractionWindow();
            suppressBoundsPublishRef.current = true;
            axis.setExtremes(min, max, true, false);
            suppressBoundsPublishRef.current = false;
            lastPublishedBoundsRef.current = { min, max };
        },
        [graphId, lockManualInteractionWindow],
    );

    useEffect(() => {
        onRegisterSyncTarget(graphId, timestampSyncKeys, applySyncedBounds);
        return () => onUnregisterSyncTarget(graphId);
    }, [
        applySyncedBounds,
        graphId,
        onRegisterSyncTarget,
        onUnregisterSyncTarget,
        timestampSyncKeys,
    ]);

    useEffect(() => {
        const chart = chartRef.current?.chart;
        if (!chart) return;

        const graphNodes = nodes.filter(
            (node) => node.enabled && !node.isTimestamp,
        );
        const currentIds = new Set(graphNodes.map((node) => node.id));

        for (const existingSeries of chart.series) {
            const id =
                existingSeries.options && 'id' in existingSeries.options
                    ? String(existingSeries.options.id ?? '')
                    : '';
            if (!id || !currentIds.has(id)) {
                existingSeries.remove(false);
            }
        }

        const allTimestamps = graphNodes.flatMap((node) =>
            (node.buffer ?? [])
                .filter((point) => typeof point.value === 'number')
                .map((point) => point.timestamp),
        );

        const hasData = allTimestamps.length > 0;
        const firstTimestamp = hasData ? Math.min(...allTimestamps) : 0;

        if (!hasSeenDataRef.current && firstTimestamp > 0) {
            const axis = chart.xAxis[0];
            axis.setExtremes(
                firstTimestamp,
                firstTimestamp + scrollRangeRef.current,
                false,
                false,
            );
            hasSeenDataRef.current = true;
        }

        if (!hasData) {
            hasSeenDataRef.current = false;
        }

        for (const node of graphNodes) {
            const id = node.id;
            const buffer = node.buffer || [];
            const series = chart.get(id) as Highcharts.Series | undefined;
            if (series) {
                const nextData = buffer
                    .map((point) =>
                        typeof point.value === 'number'
                            ? ([point.timestamp, point.value] as [
                                  number,
                                  number,
                              ])
                            : null,
                    )
                    .filter(
                        (point): point is [number, number] => point != null,
                    );
                if (series.data.length !== nextData.length) {
                    series.setData(nextData, false, false);
                } else if (series.data.length === 0 && nextData.length === 0) {
                    series.setData([], false, false);
                }
            }
        }

        chart.redraw();
    }, [graphType, nodes]);

    useEffect(() => {
        const interval = setInterval(() => {
            const chart = chartRef.current?.chart;
            if (!chart || isPanningRef.current) return;
            const interactionLocked =
                Date.now() < manualInteractionUntilRef.current;

            const graphNodes = nodes.filter(
                (node) => node.enabled && !node.isTimestamp,
            );
            const activeNodeIds = new Set(graphNodes.map((node) => node.id));
            let didUpdateSeries = false;
            let didUpdateAxis = false;
            const lastDrawnIndex = lastDrawnIndexRef.current;

            Object.keys(lastDrawnIndex).forEach((id) => {
                if (activeNodeIds.has(id)) return;
                const staleSeries = chart.get(id) as
                    | Highcharts.Series
                    | undefined;
                if (staleSeries) {
                    visibleMapRef.current[id] = !!staleSeries.visible;
                    staleSeries.remove(false);
                    didUpdateSeries = true;
                }
                delete lastDrawnIndex[id];
            });

            for (const node of graphNodes) {
                const id = node.id;
                const buffer = node.buffer || [];
                let series = chart.get(id) as Highcharts.Series | undefined;
                if (!series) {
                    const initialData = buffer
                        .map((point) =>
                            typeof point.value === 'number'
                                ? ([point.timestamp, point.value] as [
                                      number,
                                      number,
                                  ])
                                : null,
                        )
                        .filter(
                            (point): point is [number, number] => point != null,
                        );
                    const vis = visibleMapRef.current[id] ?? true;
                    series = chart.addSeries(
                        {
                            type:
                                graphType === 'area'
                                    ? 'area'
                                    : graphType === 'bar'
                                      ? 'column'
                                      : graphType === 'scatter'
                                        ? 'scatter'
                                        : 'line',
                            id,
                            name: `${node.parserName}: ${node.name}`,
                            data: initialData,
                            visible: vis,
                            showInLegend: true,
                            turboThreshold: 1,
                            boostThreshold: 1,
                            events: {
                                legendItemClick: function () {
                                    const currentSeries =
                                        this as Highcharts.Series;
                                    setTimeout(() => {
                                        visibleMapRef.current[id] =
                                            !!currentSeries.visible;
                                    }, 0);
                                    return true;
                                },
                            },
                        },
                        false,
                        false,
                    ) as Highcharts.Series;
                    lastDrawnIndex[id] = buffer.length;
                    didUpdateSeries = true;
                }

                if (lastDrawnIndex[id] == null) lastDrawnIndex[id] = 0;

                if (buffer.length === 0) {
                    if (lastDrawnIndex[id] > 0 || series.data.length) {
                        series.setData([], false, false);
                        lastDrawnIndex[id] = 0;
                        didUpdateSeries = true;
                    }
                    continue;
                }

                if (buffer.length < lastDrawnIndex[id]) {
                    series.setData(
                        buffer
                            .map((point) =>
                                typeof point.value === 'number'
                                    ? ([point.timestamp, point.value] as [
                                          number,
                                          number,
                                      ])
                                    : null,
                            )
                            .filter(
                                (point): point is [number, number] =>
                                    point != null,
                            ),
                        false,
                        false,
                    );
                    lastDrawnIndex[id] = buffer.length;
                    didUpdateSeries = true;
                    continue;
                }

                if (buffer.length - lastDrawnIndex[id] > ADD_POINT_LIMIT) {
                    series.setData(
                        buffer
                            .map((point) =>
                                typeof point.value === 'number'
                                    ? ([point.timestamp, point.value] as [
                                          number,
                                          number,
                                      ])
                                    : null,
                            )
                            .filter(
                                (point): point is [number, number] =>
                                    point != null,
                            ),
                        false,
                        false,
                    );
                    didUpdateSeries = true;
                } else {
                    for (
                        let index = lastDrawnIndex[id];
                        index < buffer.length;
                        index += 1
                    ) {
                        const point = buffer[index];
                        if (!point) continue;
                        if (typeof point.value !== 'number') continue;
                        series.addPoint(
                            [point.timestamp, point.value],
                            false,
                            false,
                        );
                        didUpdateSeries = true;
                    }
                }
                lastDrawnIndex[id] = buffer.length;
            }

            if (!interactionLocked && autoScroll && !isPanningRef.current) {
                const latest = getLatestTimestamp(graphNodes);
                const range = scrollRangeRef.current;
                if (latest > 0) {
                    const axis = chart.xAxis[0];
                    const nextMin = latest - range;
                    const nextMax = latest;
                    const min = axis.min as number | undefined;
                    const max = axis.max as number | undefined;
                    if (min !== nextMin || max !== nextMax) {
                        // Avoid feedback/flicker by not publishing timer-driven
                        // autoscroll extremes as sync updates.
                        suppressBoundsPublishRef.current = true;
                        try {
                            axis.setExtremes(nextMin, nextMax, false, false);
                        } finally {
                            suppressBoundsPublishRef.current = false;
                        }
                        didUpdateAxis = true;
                    }
                }
            } else if (!interactionLocked) {
                const allTimestamps = graphNodes.flatMap((node) =>
                    (node.buffer ?? [])
                        .filter((point) => typeof point.value === 'number')
                        .map((point) => point.timestamp),
                );
                const firstTimestamp = allTimestamps.length
                    ? Math.min(...allTimestamps)
                    : 0;
                if (firstTimestamp > 0) {
                    const axis = chart.xAxis[0];
                    const min = axis.min as number | undefined;
                    const max = axis.max as number | undefined;
                    const hasUninitializedRange =
                        typeof min !== 'number' ||
                        typeof max !== 'number' ||
                        max - min <= 0;
                    if (hasUninitializedRange) {
                        axis.setExtremes(
                            firstTimestamp,
                            firstTimestamp + scrollRangeRef.current,
                            false,
                            false,
                        );
                        didUpdateAxis = true;
                    }
                }
            }

            if ((didUpdateSeries || didUpdateAxis) && !isPanningRef.current) {
                chart.redraw();
            }
        }, 30);

        return () => clearInterval(interval);
    }, [autoScroll, graphType, nodes]);

    useEffect(() => {
        const chart = chartRef.current?.chart;
        if (!chart) return;
        const container = chart.container;
        if (!container) return;

        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;

        const onMouseDown = (event: MouseEvent) => {
            if (event.button !== 0) return;
            if (measuring) return;
            isDragging = false;
            isPanningRef.current = true;
            lockManualInteractionWindow();
            dragStartX = event.clientX;
            dragStartY = event.clientY;
        };

        const onMouseMoveDragCheck = (event: MouseEvent) => {
            if (!isPanningRef.current) return;
            const dx = Math.abs(event.clientX - dragStartX);
            const dy = Math.abs(event.clientY - dragStartY);
            if (dx > 3 || dy > 3) isDragging = true;

            if (isDragging) {
                publishCurrentAxisBounds();
            }
        };

        const onWheel = (event: WheelEvent) => {
            if (event.shiftKey) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            if (event.cancelable) {
                event.preventDefault();
            }
            lockManualInteractionWindow();
            const delta = event.deltaY;
            let nextRange =
                delta < 0
                    ? scrollRangeRef.current * (1 - ZOOM_FACTOR)
                    : scrollRangeRef.current * (1 + ZOOM_FACTOR);

            if (nextRange < 50) nextRange = 50;
            if (nextRange > 1000 * 60 * 60 * 24)
                nextRange = 1000 * 60 * 60 * 24;

            scrollRangeRef.current = nextRange;
            onScrollRangeChange(nextRange);

            const latest = getLatestTimestamp(
                nodes.filter((node) => node.enabled && !node.isTimestamp),
            );
            const axis = chart.xAxis[0];
            if (autoScroll && latest > 0) {
                axis.setExtremes(latest - nextRange, latest, true, false);
                return;
            }
            const min = axis.min as number | undefined;
            const max = axis.max as number | undefined;
            const center =
                typeof min === 'number' && typeof max === 'number'
                    ? (min + max) / 2
                    : latest;
            axis.setExtremes(
                center - nextRange / 2,
                center + nextRange / 2,
                true,
                false,
            );
        };

        const clearCrosshairs = () => {
            chart.xAxis[0].removePlotLine('x-cursor');
            chart.yAxis[0].removePlotLine('y-cursor');
        };

        const onMouseMove = (event: MouseEvent) => {
            if (isPanningRef.current || isDragging) return;
            const pointer = chart.pointer.normalize(event);
            const x = chart.xAxis[0].toValue(pointer.chartX);
            const y = chart.yAxis[0].toValue(pointer.chartY);
            const range = getVisibleWindowRange(
                nodes.filter((node) => node.enabled && !node.isTimestamp),
            );
            const snapped = applySnapping(chart, x, y, snapping);
            renderCrosshairs(chart, snapped.x, snapped.y, range);
        };

        const onMouseLeave = () => {
            clearCrosshairs();
            publishCurrentAxisBounds();
            isDragging = false;
            isPanningRef.current = false;
        };

        const onMouseOut = (event: MouseEvent) => {
            const nextTarget = event.relatedTarget as Node | null;
            if (nextTarget && container.contains(nextTarget)) return;
            clearCrosshairs();
        };

        const onClick = (event: MouseEvent) => {
            if (isPanningRef.current || isDragging) return;
            if (!measuring) return;

            const pointer = chart.pointer.normalize(event);
            const x = chart.xAxis[0].toValue(pointer.chartX);
            const nearest = findClosestPoint(chart.series, x);
            if (!nearest) return;

            if (measureStartRef.current == null) {
                chart.xAxis[0].addPlotLine({
                    id: 'measure-start',
                    value: nearest.x,
                    color: '#44aad5',
                    width: 1,
                    zIndex: 5,
                    label: {
                        text: 'Start',
                        rotation: 0,
                        y: -5,
                        style: { color: '#44aad5', fontSize: '10px' },
                    },
                });
                measureStartRef.current = nearest.x;
                return;
            }

            drawMeasurement(chart.xAxis[0], measureStartRef.current, nearest.x);
            measureStartRef.current = null;
        };

        const onMouseUp = () => {
            publishCurrentAxisBounds();
            isDragging = false;
            isPanningRef.current = false;
        };

        container.addEventListener('mousedown', onMouseDown);
        container.addEventListener('mousemove', onMouseMoveDragCheck);
        container.addEventListener('wheel', onWheel, {
            passive: false,
            capture: true,
        });
        container.addEventListener('mousemove', onMouseMove);
        container.addEventListener('mouseout', onMouseOut);
        container.addEventListener('click', onClick);
        container.addEventListener('mouseup', onMouseUp);
        container.addEventListener('mouseleave', onMouseLeave);

        return () => {
            container.removeEventListener('mousedown', onMouseDown);
            container.removeEventListener('mousemove', onMouseMoveDragCheck);
            container.removeEventListener('wheel', onWheel, {
                capture: true,
            });
            container.removeEventListener('mousemove', onMouseMove);
            container.removeEventListener('mouseout', onMouseOut);
            container.removeEventListener('click', onClick);
            container.removeEventListener('mouseup', onMouseUp);
            container.removeEventListener('mouseleave', onMouseLeave);
        };
    }, [
        autoScroll,
        lockManualInteractionWindow,
        measuring,
        nodes,
        onScrollRangeChange,
        publishCurrentAxisBounds,
        snapping,
    ]);

    useEffect(() => {
        if (!measuring) {
            const chart = chartRef.current?.chart;
            if (chart) clearMeasurement(chart.xAxis[0]);
            measureStartRef.current = null;
        }
    }, [measuring]);

    useEffect(() => {
        if (!autoScroll) return;
        if (Date.now() < manualInteractionUntilRef.current) return;
        const chart = chartRef.current?.chart;
        if (!chart) return;

        const graphNodes = nodes.filter(
            (node) => node.enabled && !node.isTimestamp,
        );
        const latest = getLatestTimestamp(graphNodes);
        if (latest <= 0) return;

        const range = scrollRangeRef.current;
        // Same as interval updates: autoscroll alignment should not rebroadcast
        // and fight with active manual interactions.
        suppressBoundsPublishRef.current = true;
        try {
            chart.xAxis[0].setExtremes(latest - range, latest, true, false);
        } finally {
            suppressBoundsPublishRef.current = false;
        }
    }, [autoScroll, nodes]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!event.shiftKey || event.repeat) return;

            const target = event.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable)
            ) {
                return;
            }

            const key = event.key.toLowerCase();
            if (key === 'a') {
                event.preventDefault();
                onAutoScrollChange(!autoScroll);
            }

            if (key === 's') {
                event.preventDefault();
                setMeasuring((value) => !value);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [autoScroll, onAutoScrollChange]);

    const options = useMemo(
        () => ({
            ...buildGraphChartOptions(title, graphType, nodes),
            xAxis: {
                ...numericChartOptions.xAxis,
                type: 'datetime',
                labels: { style: { fontSize: '9px' } },
                events: {
                    afterSetExtremes: (
                        event: Highcharts.AxisSetExtremesEventObject,
                    ) => {
                        if (
                            typeof event.min !== 'number' ||
                            typeof event.max !== 'number'
                        ) {
                            return;
                        }
                        publishBounds(event.min, event.max);
                    },
                },
            },
        }),
        [graphType, nodes, publishBounds, title],
    );

    return (
        <div
            ref={cardRef}
            style={style}
            className={`relative overflow-hidden overscroll-contain rounded-md border bg-muted/20 ${className ?? ''}`}
        >
            <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
                <Button
                    variant={autoScroll ? 'default' : 'outline'}
                    onClick={() => onAutoScrollChange(!autoScroll)}
                    title="Autoscroll (Shift+A)"
                >
                    A
                </Button>
                <Button
                    variant={measuring ? 'default' : 'outline'}
                    onClick={() => setMeasuring((value) => !value)}
                    title="Measure on chart (Shift+S)"
                >
                    M
                </Button>
                <Button variant="outline" onClick={exportCsv} className="gap-2">
                    <ArrowLineDownIcon size={18} />
                    CSV
                </Button>
                <Button
                    variant="outline"
                    onClick={exportImage}
                    className="gap-2"
                >
                    <ArrowLineDownIcon size={18} />
                    Image
                </Button>
            </div>
            <div
                ref={chartHostRef}
                className="mt-1 h-full min-h-0 w-full overscroll-contain"
                onMouseLeave={() => {
                    const chart = chartRef.current?.chart;
                    if (!chart) return;
                    chart.xAxis[0].removePlotLine('x-cursor');
                    chart.yAxis[0].removePlotLine('y-cursor');
                }}
            >
                <HighchartsReact
                    highcharts={Highcharts}
                    options={options}
                    ref={chartRef}
                    containerProps={{ style: { height: '100%' } }}
                />
            </div>
        </div>
    );
}

export default function Dashboard() {
    const dashboardRef = useRef<HTMLDivElement | null>(null);
    const [dashboardHeight, setDashboardHeight] = useState(0);
    const [autoScrollByGraph, setAutoScrollByGraph] = useState<
        Record<string, boolean>
    >({});
    const [scrollRangeByGraph, setScrollRangeByGraph] = useState<
        Record<string, number>
    >({});
    const syncTargetsRef = useRef<
        Map<
            string,
            {
                timestampSyncKeys: Set<string>;
                applyBounds: (
                    min: number,
                    max: number,
                    sourceGraphId: string,
                ) => void;
            }
        >
    >(new Map());

    const graphs = useSyncExternalStore(
        (onChange) => graphManager.subscribe(onChange),
        () => graphManager.getGraphs(),
        () => EMPTY_GRAPHS,
    );

    const allNodes = useSyncExternalStore(
        (onChange) => dataBufferManager.subscribeNodesChanged(onChange),
        () => dataBufferManager.getNodes(),
        () => EMPTY_NODES,
    );

    const graphPanels = useMemo(() => {
        return graphs
            .map((graph) => ({
                ...graph,
                nodes: uniqueNodesById(
                    graph.nodeIds
                        .map((nodeId) =>
                            allNodes.find((node) => node.id === nodeId),
                        )
                        .filter((node): node is NodeData => Boolean(node)),
                ),
            }))
            .filter((graph) => graph.nodes.length > 0);
    }, [allNodes, graphs]);

    const graphCount = graphPanels.length;
    const graphCardClassName =
        graphCount === 1
            ? 'h-full min-h-0'
            : 'h-[calc(50%-0.375rem)] min-h-0 shrink-0';
    const graphCardStyle = useMemo<CSSProperties | undefined>(() => {
        if (dashboardHeight <= 0) return undefined;

        if (graphCount === 1) {
            return { height: `${dashboardHeight}px` };
        }

        const halfHeight = Math.max((dashboardHeight - 12) / 2, 240);
        return {
            height: `${halfHeight}px`,
            flex: '0 0 auto',
        };
    }, [dashboardHeight, graphCount]);

    useEffect(() => {
        const element = dashboardRef.current;
        if (!element) return;

        const updateHeight = () => {
            setDashboardHeight(element.clientHeight);
        };

        updateHeight();

        const observer = new ResizeObserver(() => {
            updateHeight();
        });

        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, []);

    const getTimestampSyncKeys = useCallback(
        (nodes: NodeData[]) => {
            const explicitTimestampNodeIds = nodes
                .filter((node) => node.isTimestamp)
                .map((node) => node.id);

            const parserTimestampNodeIds = Array.from(
                new Set(nodes.map((node) => node.parserId)),
            )
                .map(
                    (parserId) =>
                        allNodes.find(
                            (node) =>
                                node.parserId === parserId && node.isTimestamp,
                        )?.id,
                )
                .filter((id): id is string => typeof id === 'string');

            return Array.from(
                new Set([
                    ...explicitTimestampNodeIds,
                    ...parserTimestampNodeIds,
                ]),
            );
        },
        [allNodes],
    );

    const timestampSyncKeysByGraph = useMemo(
        () =>
            new Map(
                graphPanels.map((graph) => [
                    graph.id,
                    getTimestampSyncKeys(graph.nodes),
                ]),
            ),
        [getTimestampSyncKeys, graphPanels],
    );

    const getLinkedGraphIds = useCallback(
        (graphId: string) => {
            const sourceKeys = timestampSyncKeysByGraph.get(graphId) ?? [];
            if (sourceKeys.length === 0) return [graphId];

            const sourceKeySet = new Set(sourceKeys);
            const linked = [graphId];

            timestampSyncKeysByGraph.forEach((targetKeys, targetGraphId) => {
                if (targetGraphId === graphId) return;
                const sharesTimestamp = targetKeys.some((key) =>
                    sourceKeySet.has(key),
                );
                if (sharesTimestamp) {
                    linked.push(targetGraphId);
                }
            });

            return linked;
        },
        [timestampSyncKeysByGraph],
    );

    const setSharedAutoScroll = useCallback(
        (graphId: string, nextValue: boolean) => {
            const linkedGraphIds = getLinkedGraphIds(graphId);
            setAutoScrollByGraph((current) => {
                const next = { ...current };
                linkedGraphIds.forEach((id) => {
                    next[id] = nextValue;
                });
                return next;
            });
        },
        [getLinkedGraphIds],
    );

    const setSharedScrollRange = useCallback(
        (graphId: string, nextRange: number) => {
            const linkedGraphIds = getLinkedGraphIds(graphId);
            setScrollRangeByGraph((current) => {
                const next = { ...current };
                linkedGraphIds.forEach((id) => {
                    next[id] = nextRange;
                });
                return next;
            });
        },
        [getLinkedGraphIds],
    );

    const publishSyncedBounds = useCallback(
        (
            timestampSyncKeys: string[],
            min: number,
            max: number,
            sourceGraphId: string,
        ) => {
            if (timestampSyncKeys.length === 0) return;

            const sourceKeySet = new Set(timestampSyncKeys);
            syncTargetsRef.current.forEach((target, graphId) => {
                if (graphId === sourceGraphId) return;

                const sharesTimestamp = Array.from(
                    target.timestampSyncKeys,
                ).some((key) => sourceKeySet.has(key));
                if (!sharesTimestamp) return;

                target.applyBounds(min, max, sourceGraphId);
            });
        },
        [],
    );

    const registerSyncTarget = useCallback(
        (
            graphId: string,
            timestampSyncKeys: string[],
            applyBounds: (
                min: number,
                max: number,
                sourceGraphId: string,
            ) => void,
        ) => {
            syncTargetsRef.current.set(graphId, {
                timestampSyncKeys: new Set(timestampSyncKeys),
                applyBounds,
            });
        },
        [],
    );

    const unregisterSyncTarget = useCallback((graphId: string) => {
        syncTargetsRef.current.delete(graphId);
    }, []);

    if (graphPanels.length === 0) {
        return (
            <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
                No graphs configured yet. Add a graph and assign nodes in the
                Graphs panel.
            </div>
        );
    }

    return (
        <div
            ref={dashboardRef}
            className={`flex h-full min-h-0 flex-col gap-3 overscroll-contain p-4 ${
                graphCount > 2 ? 'overflow-y-auto' : 'overflow-y-hidden'
            }`}
        >
            {graphPanels.map((graph) => {
                const timestampSyncKeys = getTimestampSyncKeys(graph.nodes);
                const autoScroll = autoScrollByGraph[graph.id] ?? false;
                const scrollRange =
                    scrollRangeByGraph[graph.id] ?? DEFAULT_SCROLL_RANGE;

                return (
                    <GraphChartCard
                        key={graph.id}
                        graphId={graph.id}
                        title={graph.name}
                        graphType={graph.type}
                        nodes={graph.nodes}
                        className={graphCardClassName}
                        style={graphCardStyle}
                        autoScroll={autoScroll}
                        scrollRange={scrollRange}
                        onAutoScrollChange={(next) =>
                            setSharedAutoScroll(graph.id, next)
                        }
                        onScrollRangeChange={(next) =>
                            setSharedScrollRange(graph.id, next)
                        }
                        timestampSyncKeys={timestampSyncKeys}
                        onBoundsChanged={publishSyncedBounds}
                        onRegisterSyncTarget={registerSyncTarget}
                        onUnregisterSyncTarget={unregisterSyncTarget}
                    />
                );
            })}
        </div>
    );
}
