import { useCallback, useEffect, useRef, useState } from 'react';
import Highcharts from 'highcharts/highstock.src';
import {
    dataBufferManager,
    type NodeData,
    type ParserData,
} from '@/utils/dataBufferManager';

export const DEFAULT_SCROLL_RANGE = 30_000;
export const ADD_POINT_LIMIT = 1000;
export const ZOOM_FACTOR = 0.15;

export const LAST_DRAWN_INDEX: Record<string, number> = {};

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

export type ChartDataState = {
    labels: string[];
    datasets: ChartDataset[];
};

type DataEntry = {
    timestamps: number[];
    values: Array<number | string>;
};

type PointLike = { x: number; y?: number | null };
type SeriesLike = {
    visible: boolean;
    color?: unknown;
    name?: string;
    points?: PointLike[];
};
type AxisLike = {
    chart: { series: SeriesLike[] };
    removePlotBand(...args: unknown[]): unknown;
    removePlotLine(...args: unknown[]): unknown;
    addPlotBand(...args: unknown[]): unknown;
    addPlotLine(...args: unknown[]): unknown;
};
type AxisWithCrosshair = {
    removePlotLine(...args: unknown[]): unknown;
    addPlotLine(...args: unknown[]): unknown;
};
type ChartLike = {
    series: SeriesLike[];
    xAxis: Array<AxisWithCrosshair>;
    yAxis: Array<AxisWithCrosshair>;
};

export const numericChartOptions = {
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
        title: { text: '' },
    },
    plotOptions: {
        line: {
            marker: { enabled: false },
        },
    },
    // Manage series imperatively to avoid React-driven resets
    series: [],
};

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

function formatCsvCell(value: number | string | null | undefined) {
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
}

function getNodeLatestTimestamp(node: NodeData): number {
    return node.buffer[node.buffer.length - 1]?.timestamp ?? 0;
}

export function getNonTimestampNodes() {
    return dataBufferManager
        .getEnabledNodes()
        .filter((node) => !node.isTimestamp);
}

export function getLatestTimestamp(nodes: NodeData[]) {
    if (nodes.length === 0) return 0;
    return Math.max(...nodes.map((node) => getNodeLatestTimestamp(node)));
}

export function getVisibleWindowRange(nodes: NodeData[]) {
    const latest = getLatestTimestamp(nodes);
    const mins = nodes.map(
        (node) => node.buffer[0]?.timestamp ?? latest - 1000,
    );
    return Math.max(1, latest - Math.min(...mins));
}

export function buildCsvExportContent(parsers: ParserData[]) {
    const blocks: string[] = [];

    for (const parser of parsers) {
        if (!parser.enabled) continue;

        const activeNodes = parser.nodes.filter((node) => node.enabled);
        if (activeNodes.length === 0) continue;

        const rows: string[] = [];
        rows.push(`Parser: ${parser.name}`);

        const header = activeNodes.map((node) => node.name);
        rows.push(header.map((cell) => formatCsvCell(cell)).join(','));

        const timestampNode = activeNodes.find((node) => node.isTimestamp);

        if (timestampNode) {
            const timestampValues = timestampNode.buffer;
            for (const timestampPoint of timestampValues) {
                const row: string[] = [formatCsvCell(timestampPoint.value)];
                for (const node of activeNodes.filter(
                    (candidate) => candidate.id !== timestampNode.id,
                )) {
                    const match = node.buffer.find(
                        (point) => point.timestamp === timestampPoint.timestamp,
                    );
                    row.push(formatCsvCell(match?.value ?? ''));
                }
                rows.push(row.join(','));
            }
        } else {
            const longestLength = Math.max(
                ...activeNodes.map((node) => node.buffer.length),
                0,
            );
            for (let index = 0; index < longestLength; index += 1) {
                const row = activeNodes.map((node) =>
                    formatCsvCell(node.buffer[index]?.value ?? ''),
                );
                rows.push(row.join(','));
            }
        }

        blocks.push(rows.join('\n'));
    }

    return blocks.join('\n\n');
}

export function findClosestPoint(
    series: SeriesLike[],
    x: number,
): PointLike | null {
    let bestPoint: PointLike | null = null;
    let bestDist = Infinity;
    for (const currentSeries of series) {
        for (const point of currentSeries.points ?? []) {
            if (typeof point.x !== 'number') continue;
            const dist = Math.abs(point.x - x);
            if (dist < bestDist) {
                bestDist = dist;
                bestPoint = point;
            }
        }
    }
    return bestPoint;
}

function formatXAxisValue(x: number, range: number) {
    if (range < 2000) return Highcharts.dateFormat('%M:%S.%L', x);
    if (range < 3_600_000) return Highcharts.dateFormat('%H:%M:%S', x);
    return Highcharts.dateFormat('%e %b %H:%M', x);
}

function formatMeasurementDuration(durationMs: number) {
    if (durationMs < 1000) return `${durationMs.toFixed(0)}ms`;

    if (durationMs < 60_000) {
        const seconds = durationMs / 1000;
        return `${seconds.toFixed(seconds < 10 ? 3 : 2)}s`;
    }

    if (durationMs < 3_600_000) {
        const minutes = Math.floor(durationMs / 60_000);
        const seconds = (durationMs % 60_000) / 1000;
        return `${minutes}m ${seconds.toFixed(3).padStart(6, '0')}s`;
    }

    const hours = Math.floor(durationMs / 3_600_000);
    const remainingAfterHours = durationMs % 3_600_000;
    const minutes = Math.floor(remainingAfterHours / 60_000);
    const seconds = (remainingAfterHours % 60_000) / 1000;
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds
        .toFixed(3)
        .padStart(6, '0')}s`;
}

export function clearMeasurement(axis: AxisLike) {
    axis.removePlotBand('measure-band');
    axis.removePlotLine('measure-start');
    axis.removePlotLine('measure-end');
}

export function drawMeasurement(axis: AxisLike, start: number, end: number) {
    const duration = Math.abs(end - start);
    const formattedDuration = formatMeasurementDuration(duration);
    const seriesLines: string[] = [];

    axis.chart.series.forEach((series) => {
        if (!series.visible) return;
        const startPoint = findClosestPoint([series], start);
        const endPoint = findClosestPoint([series], end);
        if (!startPoint || !endPoint) return;
        if (startPoint.y == null || endPoint.y == null) return;
        const color = (series.color as string) || '#fff';
        const startVal = startPoint.y.toFixed(2);
        const endVal = endPoint.y.toFixed(2);
        seriesLines.push(
            `<span style="color:${color}">${series.name}: ${startVal} → ${endVal}</span>`,
        );
    });

    axis.addPlotBand({
        id: 'measure-band',
        from: start,
        to: end,
        color: 'rgba(68, 170, 213, 0.15)',
        label: {
            useHTML: true,
            text: `Duration: ${formattedDuration}<br/>${seriesLines.join('<br/>')}`,
            align: 'center',
            verticalAlign: 'top',
            y: 10,
            style: {
                color: '#ddd',
                fontSize: '11px',
                textOutline: 'none',
                opacity: 0.9,
                lineHeight: '14px',
            },
        },
    });

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
        },
    });
}

export function applySnapping(
    chart: ChartLike,
    x: number,
    y: number,
    snapping: boolean,
) {
    if (!snapping) return { x, y };
    const nearest = findClosestPoint(chart.series, x);
    if (nearest && nearest.y != null) {
        return { x: nearest.x, y: nearest.y };
    }
    return { x, y };
}

export function renderCrosshairs(
    chart: ChartLike,
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
        },
    });

    chart.yAxis[0].removePlotLine('y-cursor');
    chart.yAxis[0].addPlotLine({
        id: 'y-cursor',
        value: y,
        color: '#888',
        width: 1,
        zIndex: 10,
        label: {
            text: y.toFixed(2),
            align: 'left',
            x: -5,
            style: { color: '#ddd', fontSize: '11px', textOutline: 'none' },
        },
    });
}

export function useDashboardChartData() {
    const [chartData, setChartData] = useState<ChartDataState>({
        labels: [],
        datasets: [],
    });

    const dataMapRef = useRef<Map<string, DataEntry>>(new Map());
    const pendingPointsRef = useRef<
        Map<string, Array<{ timestamp: number; value: number | string }>>
    >(new Map());

    const renderChartData = useCallback(() => {
        const nodeList = getNonTimestampNodes();

        if (nodeList.length === 0) {
            setChartData({ labels: [], datasets: [] });
            return;
        }

        setChartData((previousState) => {
            const previousHidden = new Map(
                previousState.datasets.map((dataset) => [
                    dataset.id,
                    !!dataset.hidden,
                ]),
            );

            const firstNode = nodeList[0];
            const firstEntry = firstNode
                ? dataMapRef.current.get(firstNode.id)
                : undefined;
            const allTimestamps = firstEntry?.timestamps ?? [];

            const datasets = nodeList.map((node) => {
                const entry = dataMapRef.current.get(node.id) ?? {
                    timestamps: [],
                    values: [],
                };
                const color = node.color || 'rgba(0,0,0,0.4)';

                return {
                    id: node.id,
                    label: `${node.parserName}: ${node.name}`,
                    data: entry.values,
                    borderColor: color,
                    backgroundColor: color.replace('0.4', '0.2'),
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.1,
                    fill: false,
                    hidden: previousHidden.get(node.id) ?? false,
                } satisfies ChartDataset;
            });

            const labels = allTimestamps.map((timestamp) =>
                formatAxisTimestamp(timestamp),
            );

            return { labels, datasets };
        });
    }, []);

    const flushPendingPoints = useCallback(() => {
        if (pendingPointsRef.current.size === 0) return;

        const pendingEntries = pendingPointsRef.current;
        pendingPointsRef.current = new Map();

        pendingEntries.forEach((points, nodeId) => {
            const node = dataBufferManager
                .getEnabledNodes()
                .find((item) => item.id === nodeId);
            if (!node || node.isTimestamp) return;

            let entry = dataMapRef.current.get(nodeId);
            if (!entry) {
                entry = { timestamps: [], values: [] };
                dataMapRef.current.set(nodeId, entry);
            }

            for (const point of points) {
                entry.timestamps.push(point.timestamp);
                entry.values.push(point.value);
            }
        });

        renderChartData();
    }, [renderChartData]);

    useEffect(() => {
        const initialNodes = dataBufferManager.getEnabledNodes();

        initialNodes.forEach((node) => {
            if (!node.isTimestamp && node.buffer.length > 0) {
                dataMapRef.current.set(node.id, {
                    timestamps: node.buffer.map((point) => point.timestamp),
                    values: node.buffer.map((point) => point.value),
                });
            }
        });

        requestAnimationFrame(() => {
            renderChartData();
        });

        const unsubData = dataBufferManager.subscribeData(
            (nodeId, dataPoint) => {
                const node = dataBufferManager
                    .getEnabledNodes()
                    .find((item) => item.id === nodeId);
                if (!node || node.isTimestamp) return;

                const pending = pendingPointsRef.current.get(nodeId) ?? [];
                pending.push(dataPoint);
                pendingPointsRef.current.set(nodeId, pending);
            },
        );

        const unsubNodes = dataBufferManager.subscribeNodesChanged(() => {
            const updatedNodes = dataBufferManager.getEnabledNodes();

            pendingPointsRef.current.clear();
            dataMapRef.current.clear();

            updatedNodes.forEach((node) => {
                if (!node.isTimestamp && node.buffer.length > 0) {
                    dataMapRef.current.set(node.id, {
                        timestamps: node.buffer.map((point) => point.timestamp),
                        values: node.buffer.map((point) => point.value),
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

    return { chartData };
}
