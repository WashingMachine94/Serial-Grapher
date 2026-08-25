'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Highcharts from 'highcharts/highstock.src';
import HighchartsReact from 'highcharts-react-official';
import { ArrowLineDownIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { dataBufferManager } from '@/utils/dataBufferManager';

const MAX_POINTS = 2000;
const DEFAULT_VISIBLE_POINTS = 600;
const MIN_VISIBLE_POINTS = 20;
const VISIBLE_STEP = 20;

export const LAST_DRAWN_INDEX: Record<string, number> = {};
export const ADD_POINT_LIMIT: number = 1000;
export const ZOOM_LIMIT: number = 5;
export const ZOOM_FACTOR: number = 0.15;
export const ZOOM_FACTOR_Y: number = 0.5;

function formatAxisTimestamp(timestamp: number): string {
    const magnitude = Math.abs(timestamp);

    if (magnitude >= 1_000_000_000_000) {
        return new Date(timestamp).toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3,
        });
    }

    if (magnitude >= 1_000_000_000) {
        return new Date(timestamp * 1000).toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3,
        });
    }

    return Number.isInteger(timestamp)
        ? timestamp.toString()
        : timestamp.toFixed(3);
}

function getYScaleRange(
    datasets: Array<{ data: Array<number | string>; hidden?: boolean }>,
) {
    const visibleDatasets = datasets.filter((dataset) => !dataset.hidden);
    const numericValues = visibleDatasets
        .flatMap((dataset) => dataset.data)
        .filter((value): value is number => typeof value === 'number');

    if (numericValues.length === 0) {
        return { min: -1, max: 1 };
    }

    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    const padding = Math.max((max - min) * 0.2, 1);

    return {
        min: Math.min(min - padding, 0),
        max: Math.max(max + padding, 0),
    };
}

type ChartDataset = {
    id: string;
    label: string;
    data: Array<number | string>;
    borderColor: string;
    backgroundColor: string;
    borderWidth: number;
    pointRadius: number;
    tension: number;
    fill: boolean;
    hidden?: boolean;
};

type ChartDataState = {
    labels: string[];
    datasets: ChartDataset[];
};

export default function Dashboard() {
    const [chartData, setChartData] = useState<ChartDataState>({
        labels: [],
        datasets: [],
    });

    // Tool states
    const [autoScroll, setAutoScroll] = useState(false);
    const [snapping, setSnapping] = useState(true);
    const [autoscale, setAutoscale] = useState(true);
    const [measuring, setMeasuring] = useState(false);
    const measureStartRef = useRef<number | null>(null);
    const [scrollRange, setScrollRange] = useState<number>(30_000); // milliseconds
    const scrollRangeRef = useRef<number>(scrollRange);

    const dataMap = useRef<
        Map<string, { timestamps: number[]; values: (number | string)[] }>
    >(new Map());
    const pendingPointsRef = useRef<
        Map<string, Array<{ timestamp: number; value: number | string }>>
    >(new Map());
    const visiblePointsRef = useRef(DEFAULT_VISIBLE_POINTS);

    const renderChartData = useCallback(() => {
        const currentNodes = dataBufferManager.getNodes();
        const nodeList = currentNodes.filter((n) => !n.isTimestamp);

        const previousHidden = new Map(
            chartData.datasets.map((dataset) => [dataset.id, !!dataset.hidden]),
        );

        if (nodeList.length === 0) {
            setChartData({ labels: [], datasets: [] });
            return;
        }

        const firstNode = nodeList[0];
        const firstEntry = firstNode
            ? dataMap.current.get(firstNode.id)
            : undefined;
        const allTimestamps = firstEntry ? firstEntry.timestamps : [];
        const startIndex = Math.max(
            0,
            allTimestamps.length - visiblePointsRef.current,
        );
        const visibleTimestamps = allTimestamps.slice(startIndex);

        const datasets = nodeList.map((node) => {
            const entry = dataMap.current.get(node.id) ?? {
                timestamps: [],
                values: [],
            };
            const nodeTimestamps = entry.timestamps;
            const nodeStartIndex = Math.max(
                0,
                nodeTimestamps.length - visiblePointsRef.current,
            );
            const nodeValues = entry.values.slice(nodeStartIndex);
            const color = node.color || 'rgba(0,0,0,0.4)';

            return {
                id: node.id,
                label: `${node.parserName}: ${node.name}`,
                data: nodeValues,
                borderColor: color,
                backgroundColor: color.replace('0.4', '0.2'),
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.1,
                fill: false,
                hidden: previousHidden.get(node.id) ?? false,
            } satisfies ChartDataset;
        });

        const labels = visibleTimestamps.map((timestamp) =>
            formatAxisTimestamp(timestamp),
        );

        setChartData({ labels, datasets });
    }, [chartData.datasets]);

    const flushPendingPoints = useCallback(() => {
        if (pendingPointsRef.current.size === 0) return;

        const pendingEntries = pendingPointsRef.current;
        pendingPointsRef.current = new Map();

        pendingEntries.forEach((points, nodeId) => {
            const node = dataBufferManager
                .getNodes()
                .find((item) => item.id === nodeId);
            if (!node || node.isTimestamp) return;

            let entry = dataMap.current.get(nodeId);
            if (!entry) {
                entry = { timestamps: [], values: [] };
                dataMap.current.set(nodeId, entry);
            }

            for (const point of points) {
                entry.timestamps.push(point.timestamp);
                entry.values.push(point.value);
            }

            if (entry.timestamps.length > MAX_POINTS) {
                const overflow = entry.timestamps.length - MAX_POINTS;
                entry.timestamps.splice(0, overflow);
                entry.values.splice(0, overflow);
            }
        });

        renderChartData();
    }, [renderChartData]);

    useEffect(() => {
        const initialNodes = dataBufferManager.getNodes();

        initialNodes.forEach((node) => {
            if (!node.isTimestamp && node.buffer.length > 0) {
                dataMap.current.set(node.id, {
                    timestamps: node.buffer.map((dp) => dp.timestamp),
                    values: node.buffer.map((dp) => dp.value),
                });
            }
        });

        requestAnimationFrame(() => {
            renderChartData();
        });

        const unsubData = dataBufferManager.subscribeData(
            (nodeId, dataPoint) => {
                const node = dataBufferManager
                    .getNodes()
                    .find((item) => item.id === nodeId);
                if (!node || node.isTimestamp) return;

                const pending = pendingPointsRef.current.get(nodeId) ?? [];
                pending.push(dataPoint);
                pendingPointsRef.current.set(nodeId, pending);
            },
        );

        const unsubNodes = dataBufferManager.subscribeNodesChanged(() => {
            const updatedNodes = dataBufferManager.getNodes();

            pendingPointsRef.current.clear();
            dataMap.current.clear();

            updatedNodes.forEach((node) => {
                if (!node.isTimestamp && node.buffer.length > 0) {
                    dataMap.current.set(node.id, {
                        timestamps: node.buffer.map((dp) => dp.timestamp),
                        values: node.buffer.map((dp) => dp.value),
                    });
                }
            });

            renderChartData();
        });

        const intervalId = window.setInterval(flushPendingPoints, 1000 / 30);

        return () => {
            unsubData();
            unsubNodes();
            window.clearInterval(intervalId);
        };
    }, [flushPendingPoints, renderChartData]);

    const handleWheel = useCallback(
        (event: React.WheelEvent<HTMLDivElement>) => {
            // Non-shift wheel: adjust horizontal zoom (time range)
            if (event.shiftKey) {
                // let chart container handle Y-scaling
                return;
            }

            event.preventDefault();
            const delta = event.deltaY;

            let nextRange =
                delta < 0
                    ? scrollRangeRef.current * (1 - ZOOM_FACTOR)
                    : scrollRangeRef.current * (1 + ZOOM_FACTOR);

            if (nextRange < 50) nextRange = 50; // 50 ms minimum
            if (nextRange > 1000 * 60 * 60 * 24)
                nextRange = 1000 * 60 * 60 * 24; // 24h max

            scrollRangeRef.current = nextRange;
            setScrollRange(nextRange);

            const chart = chartRef.current?.chart;
            if (!chart) return;

            const nodes = dataBufferManager
                .getNodes()
                .filter((n: any) => !n.isTimestamp);
            const latest = Math.max(
                ...nodes.map(
                    (n: any) => n.buffer[n.buffer.length - 1]?.timestamp ?? 0,
                ),
            );

            if (autoScroll) {
                // anchor to right
                if (latest > 0)
                    chart.xAxis[0].setExtremes(
                        latest - nextRange,
                        latest,
                        true,
                        false,
                    );
            } else {
                // center on middle of current view
                const axis = chart.xAxis[0];
                const min = axis.min as number | undefined;
                const max = axis.max as number | undefined;
                const center =
                    typeof min === 'number' && typeof max === 'number'
                        ? (min + max) / 2
                        : latest;
                chart.xAxis[0].setExtremes(
                    center - nextRange / 2,
                    center + nextRange / 2,
                    true,
                    false,
                );
            }
        },
        [autoScroll],
    );

    const formatCsvCell = (value: number | string | null | undefined) => {
        const text = value == null ? '' : String(value);
        const trimmed = text.trim();

        if (
            trimmed === '' ||
            /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed) ||
            /^-?\.\d+([eE][+-]?\d+)?$/.test(trimmed)
        ) {
            return trimmed;
        }

        return `"${trimmed.replace(/"/g, '""')}"`;
    };

    const exportCsv = () => {
        const blocks: string[] = [];

        for (const parser of dataBufferManager.getParsers()) {
            if (parser.nodes.length === 0) continue;

            const rows: string[] = [];
            rows.push(`Parser: ${parser.name}`);

            const header = parser.nodes.map((node) => node.name);
            rows.push(header.map((cell) => formatCsvCell(cell)).join(','));

            const timestampNode = parser.nodes.find((node) => node.isTimestamp);

            if (timestampNode) {
                const timestampValues = timestampNode.buffer;
                for (const timestampPoint of timestampValues) {
                    const row: string[] = [formatCsvCell(timestampPoint.value)];
                    for (const node of parser.nodes.filter(
                        (candidate) => candidate.id !== timestampNode.id,
                    )) {
                        const match = node.buffer.find(
                            (point) =>
                                point.timestamp === timestampPoint.timestamp,
                        );
                        row.push(formatCsvCell(match?.value ?? ''));
                    }
                    rows.push(row.join(','));
                }
            } else {
                const longestLength = Math.max(
                    ...parser.nodes.map((node) => node.buffer.length),
                    0,
                );
                for (let index = 0; index < longestLength; index += 1) {
                    const row = parser.nodes.map((node) =>
                        formatCsvCell(node.buffer[index]?.value ?? ''),
                    );
                    rows.push(row.join(','));
                }
            }

            blocks.push(rows.join('\n'));
        }

        const csv = blocks.join('\n\n');
        if (!csv) return;

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'serial-grapher-export.csv';
        link.click();
        URL.revokeObjectURL(url);
    };

    const chartRef = useRef<HighchartsReact.RefObject | null>(null);

    const nodeList = useMemo(
        () => dataBufferManager.getNodes().filter((n: any) => !n.isTimestamp),
        [chartData],
    );

    const visibleMapRef = useRef<Record<string, boolean>>({});

    const optionsNumeric = useMemo<Highcharts.Options>(() => {
        return {
            chart: {
                animation: false,
                panning: { enabled: true, type: 'x' },
            },
            title: { text: 'Numeric', align: 'left' },
            navigator: { enabled: false },
            scrollbar: { enabled: false },
            rangeSelector: { enabled: false },
            boost: { enabled: true, useGPUTranslations: true },
            tooltip: { split: true, shared: false },
            mapNavigation: { enabled: true, enableMouseWheelZoom: true },
            xAxis: {
                plotBands: [],
                type: 'datetime',
                dateTimeLabelFormats: {
                    millisecond: '%M:%S.%L',
                    second: '%H:%M:%S',
                    minute: '%H:%M',
                    hour: '%H:%M',
                    day: '%e %b',
                    week: '%e %b',
                    month: '%b %Y',
                    year: '%Y',
                },
            },
            yAxis: {
                title: {
                    text: '',
                },
            },
            plotOptions: {
                line: {
                    marker: {
                        enabled: false,
                    },
                },
            },

            // Manage series imperatively to avoid React-driven resets
            series: [],
        };
    }, []);

    const hasData = nodeList.some((n: any) => (n.buffer || []).length > 0);

    useEffect(() => {
        // Simple update loop: push new points into chart series when chart exists.
        const interval = setInterval(() => {
            const chart = chartRef.current?.chart;
            if (!chart) return;

            const nodes = dataBufferManager
                .getNodes()
                .filter((n: any) => !n.isTimestamp);
            for (const node of nodes) {
                const id = node.id;
                const buffer = node.buffer || [];
                let series = chart.get(id) as Highcharts.Series | undefined;
                if (!series) {
                    const latest = buffer.length
                        ? buffer[buffer.length - 1].timestamp
                        : 0;
                    const initialData = buffer
                        .filter(
                            (p: any) =>
                                p.timestamp >= latest - scrollRangeRef.current,
                        )
                        .map((p: any) => [p.timestamp, p.value]);
                    const vis = visibleMapRef.current[id] ?? true;
                    series = chart.addSeries(
                        {
                            id,
                            name: `${node.parserName}: ${node.name}`,
                            data: initialData,
                            visible: vis,
                            showInLegend: true,
                            turboThreshold: 1,
                            boostThreshold: 1,
                            events: {
                                legendItemClick: function () {
                                    const that = this as any;
                                    setTimeout(() => {
                                        visibleMapRef.current[id] =
                                            !!that.visible;
                                    }, 0);
                                    return true;
                                },
                            },
                        } as any,
                        false,
                        false,
                    ) as Highcharts.Series;
                    LAST_DRAWN_INDEX[id] = buffer.length;
                }

                if (LAST_DRAWN_INDEX[id] == null) LAST_DRAWN_INDEX[id] = 0;

                if (buffer.length - LAST_DRAWN_INDEX[id] > ADD_POINT_LIMIT) {
                    const data = buffer.map((p: any) => [p.timestamp, p.value]);
                    series.setData(data, false, false);
                } else {
                    for (let i = LAST_DRAWN_INDEX[id]; i < buffer.length; i++) {
                        const p = buffer[i];
                        if (!p) continue;
                        series.addPoint([p.timestamp, p.value], false, false);
                    }
                }

                LAST_DRAWN_INDEX[id] = buffer.length;
            }

            // Auto-scroll to latest range (if enabled)
            if (autoScroll) {
                const nodes = dataBufferManager
                    .getNodes()
                    .filter((n: any) => !n.isTimestamp);
                const latest = Math.max(
                    ...nodes.map(
                        (n: any) =>
                            n.buffer[n.buffer.length - 1]?.timestamp ?? 0,
                    ),
                );
                const range = scrollRangeRef.current;
                if (typeof latest === 'number' && latest > 0) {
                    chart.xAxis[0].setExtremes(
                        latest - range,
                        latest,
                        false,
                        false,
                    );
                }
            }

            chart.redraw();
        }, 30);

        return () => clearInterval(interval);
    }, [autoScroll]);

    // Interaction helpers
    function findClosestPoint(series: any[], x: number): any | null {
        let bestPoint: any | null = null;
        let bestDist = Infinity;
        for (const s of series) {
            if (!s.points) continue;
            for (const p of s.points) {
                if (!p || typeof p.x !== 'number') continue;
                const dist = Math.abs(p.x - x);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPoint = p;
                }
            }
        }
        return bestPoint;
    }

    function formatXAxisValue(x: number, range: number) {
        if (range < 2000) return Highcharts.dateFormat('%M:%S.%L', x);
        if (range < 60000) return Highcharts.dateFormat('%H:%M:%S', x);
        if (range < 3600000) return Highcharts.dateFormat('%H:%M:%S', x);
        return Highcharts.dateFormat('%e %b %H:%M', x);
    }

    function drawMeasurement(
        axis: Highcharts.Axis,
        start: number,
        end: number,
    ) {
        const dt = Math.abs(end - start) as number;
        const seriesLines: string[] = [];
        axis.chart.series.forEach((series) => {
            if (!series.visible) return;
            const startPoint = findClosestPoint([series], start as any);
            const endPoint = findClosestPoint([series], end as any);
            if (!startPoint || !endPoint) return;
            if (startPoint.y == null || endPoint.y == null) return;
            const color = (series.color as string) || '#fff';
            const startVal = (startPoint.y as number).toFixed(2);
            const endVal = (endPoint.y as number).toFixed(2);
            seriesLines.push(
                `<span style="color:${color}">${series.name}: ${startVal} → ${endVal}</span>`,
            );
        });

        const combinedText = `Duration: ${dt}ms<br/>${seriesLines.join('<br/>')}`;

        axis.addPlotBand({
            id: 'measure-band',
            from: start,
            to: end,
            color: 'rgba(68, 170, 213, 0.15)',
            label: {
                useHTML: true,
                text: combinedText,
                align: 'center',
                verticalAlign: 'top',
                y: 10,
                style: {
                    color: '#ddd',
                    fontSize: '11px',
                    textOutline: 'none',
                    opacity: 0.9,
                    lineHeight: '14px',
                } as any,
            },
        } as any);

        axis.addPlotLine({
            id: 'measure-end',
            value: end,
            color: '#44aad5',
            width: 1,
            zIndex: 5,
            label: {
                text: 'End',
                rotation: 0,
                y: -5,
                style: { color: '#44aad5', fontSize: '10px' },
            } as any,
        } as any);
    }

    function clearMeasurement(axis: any) {
        try {
            axis.removePlotBand('measure-band');
        } catch {}
        try {
            axis.removePlotLine('measure-start' as any);
        } catch {}
        try {
            axis.removePlotLine('measure-end' as any);
        } catch {}
    }

    // function handleYAxisScaling(chart: any, e: WheelEvent) {
    //     const axis = chart.yAxis[0];
    //     if (autoscale) {
    //         axis.setExtremes(undefined, undefined, false, false);
    //         return;
    //     }
    //     if (!e.shiftKey) return;
    //     e.preventDefault();
    //     const min = axis.min as number | undefined;
    //     const max = axis.max as number | undefined;
    //     if (min == null || max == null) return;
    //     const range = max - min;
    //     let newRange =
    //         e.deltaY < 0
    //             ? range * (1 - ZOOM_FACTOR_Y)
    //             : range * (1 + ZOOM_FACTOR_Y);
    //     const half = newRange / 2;
    //     const center = (min + max) / 2;
    //     axis.setExtremes(center - half, center + half, true, false);
    // }

    function applySnapping(chart: any, x: number, y: number) {
        if (!snapping) return { x, y };
        const nearest = findClosestPoint(chart.series, x);
        if (nearest && nearest.y != null) {
            return { x: nearest.x as number, y: nearest.y as number };
        }
        return { x, y };
    }

    function renderCrosshairs(
        chart: any,
        x: number,
        y: number,
        scrollRange: number,
    ) {
        chart.xAxis[0].removePlotLine('x-cursor');
        chart.xAxis[0].addPlotLine({
            id: 'x-cursor',
            value: x,
            color: '#888',
            width: 1,
            zIndex: 10,
            label: {
                align: 'left',
                text: formatXAxisValue(x, scrollRange),
                rotation: 0,
                y: -5,
                style: { color: '#ddd', fontSize: '11px', textOutline: 'none' },
            } as any,
        } as any);

        chart.yAxis[0].removePlotLine('y-cursor');
        chart.yAxis[0].addPlotLine({
            id: 'y-cursor',
            value: y,
            color: '#888',
            width: 1,
            zIndex: 10,
            label: {
                text: (y as number).toFixed(2),
                align: 'left',
                x: -5,
                style: { color: '#ddd', fontSize: '11px', textOutline: 'none' },
            } as any,
        } as any);
    }

    function handleMeasurementClick(chart: any, e: MouseEvent) {
        if (!measuring) return;
        const pointer = chart.pointer.normalize(e as any);
        const x = chart.xAxis[0].toValue(pointer.chartX);
        const nearest = findClosestPoint(chart.series, x as number);
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
            } as any);
            measureStartRef.current = nearest.x as number;
            return;
        }
        drawMeasurement(
            chart.xAxis[0],
            measureStartRef.current,
            nearest.x as number,
        );
        measureStartRef.current = null;
    }

    // Attach event listeners to chart container for interactions
    useEffect(() => {
        const chart = chartRef.current?.chart;
        if (!chart) return;
        const container = chart.container as HTMLElement | null;
        if (!container) return;

        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;

        const onMouseDown = (e: MouseEvent) => {
            isDragging = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
        };

        const onMouseMoveDragCheck = (e: MouseEvent) => {
            const dx = Math.abs(e.clientX - dragStartX);
            const dy = Math.abs(e.clientY - dragStartY);
            if (dx > 3 || dy > 3) isDragging = true;
        };

        const onWheel = (e: WheelEvent) => {
            // If holding Shift, handle Y-axis scaling and stop outer wheel handling
            if (e.shiftKey) {
                e.stopPropagation();
                // handleYAxisScaling(chart, e);
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            const pointer = chart.pointer.normalize(e as any);
            let x = chart.xAxis[0].toValue(pointer.chartX);
            let y = chart.yAxis[0].toValue(pointer.chartY);
            const nodes = dataBufferManager
                .getNodes()
                .filter((n: any) => !n.isTimestamp);
            const latest = Math.max(
                ...nodes.map(
                    (n: any) => n.buffer[n.buffer.length - 1]?.timestamp ?? 0,
                ),
            );
            const mins = nodes.map(
                (n: any) =>
                    n.buffer[
                        Math.max(
                            0,
                            (n.buffer.length || 1) - visiblePointsRef.current,
                        )
                    ]?.timestamp ?? latest - 1000,
            );
            const range = Math.max(1, latest - Math.min(...mins));
            const snapped = applySnapping(chart, x as number, y as number);
            x = snapped.x;
            y = snapped.y;
            renderCrosshairs(chart, x as number, y as number, range);
        };

        const onClick = (e: MouseEvent) => {
            if (isDragging) return;
            handleMeasurementClick(chart, e);
        };

        container.addEventListener('mousedown', onMouseDown);
        container.addEventListener('mousemove', onMouseMoveDragCheck);
        container.addEventListener('wheel', onWheel, { passive: false });
        container.addEventListener('mousemove', onMouseMove);
        container.addEventListener('click', onClick);

        return () => {
            container.removeEventListener('mousedown', onMouseDown);
            container.removeEventListener('mousemove', onMouseMoveDragCheck);
            container.removeEventListener('wheel', onWheel as any);
            container.removeEventListener('mousemove', onMouseMove);
            container.removeEventListener('click', onClick);
        };
    }, [chartRef.current, snapping, autoscale, measuring]);

    // Clear measurement when measuring is turned off
    useEffect(() => {
        if (!measuring) {
            const chart = chartRef.current?.chart;
            if (chart) clearMeasurement(chart.xAxis[0]);
            measureStartRef.current = null;
        }
    }, [measuring]);

    return (
        <div className="flex h-full flex-col gap-3 p-4">
            <div className="flex justify-end items-center gap-2">
                <Button
                    variant={autoScroll ? 'default' : 'outline'}
                    onClick={() => setAutoScroll((v) => !v)}
                    title="Autoscroll (shift+space)"
                >
                    A
                </Button>

                <Button
                    variant={snapping ? 'default' : 'outline'}
                    onClick={() => setSnapping((v) => !v)}
                    title="Snap to nearest point"
                >
                    S
                </Button>

                <Button
                    variant={autoscale ? 'default' : 'outline'}
                    onClick={() => setAutoscale((v) => !v)}
                    title="Autoscale Y axis"
                >
                    Y
                </Button>

                <Button
                    variant={measuring ? 'default' : 'outline'}
                    onClick={() => setMeasuring((v) => !v)}
                    title="Measure on chart"
                >
                    M
                </Button>

                <Button variant="outline" onClick={exportCsv} className="gap-2">
                    <ArrowLineDownIcon size={32} />
                    CSV
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
