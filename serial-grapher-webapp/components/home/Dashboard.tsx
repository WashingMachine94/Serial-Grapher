'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Highcharts from 'highcharts/highstock.src';
import HighchartsReact from 'highcharts-react-official';
import { ArrowLineDownIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { dataBufferManager } from '@/utils/dataBufferManager';
import {
    ADD_POINT_LIMIT,
    LAST_DRAWN_INDEX,
    ZOOM_FACTOR,
    DEFAULT_SCROLL_RANGE,
    applySnapping,
    buildCsvExportContent,
    clearMeasurement,
    drawMeasurement,
    findClosestPoint,
    getLatestTimestamp,
    getNonTimestampNodes,
    getVisibleWindowRange,
    numericChartOptions,
    renderCrosshairs,
    useDashboardChartData,
} from './dashboard/dashboard';

export default function Dashboard() {
    const { chartData } = useDashboardChartData();

    const [autoScroll, setAutoScroll] = useState(false);
    const [snapping] = useState(true);
    const [measuring, setMeasuring] = useState(false);
    const measureStartRef = useRef<number | null>(null);
    const [scrollRange, setScrollRange] =
        useState<number>(DEFAULT_SCROLL_RANGE);
    const scrollRangeRef = useRef<number>(scrollRange);

    const chartRef = useRef<HighchartsReact.RefObject | null>(null);
    const visibleMapRef = useRef<Record<string, boolean>>({});
    const isPanningRef = useRef(false);

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

    useEffect(() => {
        scrollRangeRef.current = scrollRange;
    }, [scrollRange]);

    const exportCsv = useCallback(() => {
        const csv = buildCsvExportContent(dataBufferManager.getParsers());
        if (!csv) return;

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        triggerDownload(blob, `Measurement - ${getTimestampLabel()}.csv`);
    }, [getTimestampLabel, triggerDownload]);

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
                    `Measurement - ${getTimestampLabel()}.png`,
                );
            }, 'image/png');
        };

        image.onerror = () => {
            URL.revokeObjectURL(svgUrl);
        };

        image.src = svgUrl;
    }, [getTimestampLabel, triggerDownload]);

    const hasData = chartData.datasets.some(
        (dataset) => dataset.data.length > 0,
    );

    const optionsNumeric = useMemo(() => numericChartOptions, []);

    const handleWheel = useCallback(
        (event: React.WheelEvent<HTMLDivElement>) => {
            if (event.shiftKey) return;

            event.preventDefault();
            const delta = event.deltaY;

            let nextRange =
                delta < 0
                    ? scrollRangeRef.current * (1 - ZOOM_FACTOR)
                    : scrollRangeRef.current * (1 + ZOOM_FACTOR);

            if (nextRange < 50) nextRange = 50;
            if (nextRange > 1000 * 60 * 60 * 24)
                nextRange = 1000 * 60 * 60 * 24;

            scrollRangeRef.current = nextRange;
            setScrollRange(nextRange);

            const chart = chartRef.current?.chart;
            if (!chart) return;

            const nodes = getNonTimestampNodes();
            const latest = getLatestTimestamp(nodes);

            if (autoScroll) {
                if (latest > 0) {
                    chart.xAxis[0].setExtremes(
                        latest - nextRange,
                        latest,
                        true,
                        false,
                    );
                }
                return;
            }

            const axis = chart.xAxis[0];
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
        },
        [autoScroll],
    );

    // Interval for chart interaction and updates.
    useEffect(() => {
        const interval = setInterval(() => {
            const chart = chartRef.current?.chart;
            if (!chart || isPanningRef.current) return;

            const nodes = getNonTimestampNodes();
            const activeNodeIds = new Set(nodes.map((node) => node.id));
            let didUpdateSeries = false;
            let didUpdateAxis = false;

            Object.keys(LAST_DRAWN_INDEX).forEach((id) => {
                if (activeNodeIds.has(id)) return;
                const staleSeries = chart.get(id) as
                    | Highcharts.Series
                    | undefined;
                if (staleSeries) {
                    visibleMapRef.current[id] = !!staleSeries.visible;
                    staleSeries.remove(false);
                    didUpdateSeries = true;
                }
                delete LAST_DRAWN_INDEX[id];
            });

            for (const node of nodes) {
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
                            type: 'line',
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
                    LAST_DRAWN_INDEX[id] = buffer.length;
                    didUpdateSeries = true;
                }

                if (LAST_DRAWN_INDEX[id] == null) LAST_DRAWN_INDEX[id] = 0;

                if (buffer.length - LAST_DRAWN_INDEX[id] > ADD_POINT_LIMIT) {
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
                        let index = LAST_DRAWN_INDEX[id];
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

                LAST_DRAWN_INDEX[id] = buffer.length;
            }

            if (autoScroll && !isPanningRef.current) {
                const latest = getLatestTimestamp(nodes);
                const range = scrollRangeRef.current;
                if (latest > 0) {
                    const axis = chart.xAxis[0];
                    const nextMin = latest - range;
                    const nextMax = latest;
                    const min = axis.min as number | undefined;
                    const max = axis.max as number | undefined;
                    if (min !== nextMin || max !== nextMax) {
                        axis.setExtremes(nextMin, nextMax, false, false);
                        didUpdateAxis = true;
                    }
                }
            }

            if ((didUpdateSeries || didUpdateAxis) && !isPanningRef.current) {
                chart.redraw();
            }
        }, 30);

        return () => clearInterval(interval);
    }, [autoScroll]);

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
            dragStartX = event.clientX;
            dragStartY = event.clientY;
        };

        const onMouseMoveDragCheck = (event: MouseEvent) => {
            if (!isPanningRef.current) return;

            const dx = Math.abs(event.clientX - dragStartX);
            const dy = Math.abs(event.clientY - dragStartY);
            if (dx > 3 || dy > 3) isDragging = true;
        };

        const onWheel = (event: WheelEvent) => {
            if (event.shiftKey) event.stopPropagation();
        };

        const onMouseMove = (event: MouseEvent) => {
            if (isPanningRef.current || isDragging) return;

            const pointer = chart.pointer.normalize(event);
            if (isPanningRef.current || isDragging) return;

            let x = chart.xAxis[0].toValue(pointer.chartX);
            let y = chart.yAxis[0].toValue(pointer.chartY);
            const range = getVisibleWindowRange(getNonTimestampNodes());
            const snapped = applySnapping(chart, x, y, snapping);
            x = snapped.x;
            y = snapped.y;
            renderCrosshairs(chart, x, y, range);
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
            isDragging = false;
            isPanningRef.current = false;
        };

        container.addEventListener('mousedown', onMouseDown);
        container.addEventListener('mousemove', onMouseMoveDragCheck);
        container.addEventListener('wheel', onWheel, { passive: false });
        container.addEventListener('mousemove', onMouseMove);
        container.addEventListener('click', onClick);
        container.addEventListener('mouseup', onMouseUp);
        container.addEventListener('mouseleave', onMouseUp);

        return () => {
            container.removeEventListener('mousedown', onMouseDown);
            container.removeEventListener('mousemove', onMouseMoveDragCheck);
            container.removeEventListener('wheel', onWheel);
            container.removeEventListener('mousemove', onMouseMove);
            container.removeEventListener('click', onClick);
            container.removeEventListener('mouseup', onMouseUp);
            container.removeEventListener('mouseleave', onMouseUp);
        };
    }, [measuring, snapping]);

    useEffect(() => {
        if (!measuring) {
            const chart = chartRef.current?.chart;
            if (chart) clearMeasurement(chart.xAxis[0]);
            measureStartRef.current = null;
        }
    }, [measuring]);

    useEffect(() => {
        if (!autoScroll) return;

        const chart = chartRef.current?.chart;
        if (!chart) return;

        const nodes = getNonTimestampNodes();
        const latest = getLatestTimestamp(nodes);
        if (latest <= 0) return;

        const range = scrollRangeRef.current;
        chart.xAxis[0].setExtremes(latest - range, latest, true, false);
    }, [autoScroll]);

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
                setAutoScroll((value) => !value);
            }

            if (key === 's') {
                event.preventDefault();
                setMeasuring((value) => !value);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, []);

    return (
        <div className="flex h-full flex-col gap-3 p-4">
            <div className="flex justify-end items-center gap-2">
                <Button
                    variant={autoScroll ? 'default' : 'outline'}
                    onClick={() => setAutoScroll((value) => !value)}
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
                    <ArrowLineDownIcon size={32} />
                    CSV
                </Button>

                <Button
                    variant="outline"
                    onClick={exportImage}
                    className="gap-2"
                >
                    <ArrowLineDownIcon size={32} />
                    Image
                </Button>
            </div>
            {!hasData ? (
                <div className="h-100 flex items-center justify-center text-muted-foreground">
                    No data yet. Configure nodes, regex, and press Subscribe.
                </div>
            ) : (
                <div className="h-100" onWheel={handleWheel}>
                    <HighchartsReact
                        highcharts={Highcharts}
                        options={optionsNumeric}
                        ref={chartRef}
                    />
                </div>
            )}
        </div>
    );
}
