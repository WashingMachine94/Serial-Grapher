'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { ArrowLineDownIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { dataBufferManager } from '@/utils/dataBufferManager';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
);

const MAX_POINTS = 2000;
const DEFAULT_VISIBLE_POINTS = 600;
const MIN_VISIBLE_POINTS = 20;
const VISIBLE_STEP = 20;

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
            event.preventDefault();
            const delta = event.deltaY;
            const nextCount = Math.min(
                MAX_POINTS,
                Math.max(
                    MIN_VISIBLE_POINTS,
                    visiblePointsRef.current +
                        (delta > 0 ? -VISIBLE_STEP : VISIBLE_STEP),
                ),
            );

            if (nextCount === visiblePointsRef.current) return;

            visiblePointsRef.current = nextCount;
            renderChartData();
        },
        [renderChartData],
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
                    const row: string[] = [
                        formatCsvCell(timestampPoint.value),
                    ];
                    for (const node of parser.nodes.filter(
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

    const options = {
        animation: false as const,
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'nearest' as const,
            axis: 'x' as const,
            intersect: false,
        },
        scales: {
            x: {
                type: 'category' as const,
                grid: {
                    color: 'rgba(148, 163, 184, 0.15)',
                    drawBorder: false,
                },
                ticks: {
                    maxRotation: 45,
                    autoSkip: true,
                    maxTicksLimit: 20,
                    color: 'rgba(148, 163, 184, 0.9)',
                },
            },
            y: {
                beginAtZero: false,
                grid: {
                    color: 'rgba(148, 163, 184, 0.15)',
                    drawBorder: false,
                },
                ticks: {
                    maxTicksLimit: 10,
                    color: 'rgba(148, 163, 184, 0.9)',
                },
                ...getYScaleRange(chartData.datasets),
            },
        },
        plugins: {
            legend: {
                position: 'top' as const,
                labels: { usePointStyle: true, pointStyle: 'circle' },
                onClick: (
                    _event: unknown,
                    legendItem: { datasetIndex?: number },
                    legend: { chart: { data: { datasets: ChartDataset[] }; update: () => void } },
                ) => {
                    const datasetIndex = legendItem.datasetIndex;
                    if (datasetIndex == null) return;

                    const chart = legend.chart;
                    const dataset = chart.data.datasets[datasetIndex];
                    if (!dataset) return;

                    const nextHidden = !dataset.hidden;
                    dataset.hidden = nextHidden;
                    chart.update();

                    setChartData((previous) => ({
                        ...previous,
                        datasets: previous.datasets.map((currentDataset, index) =>
                            index === datasetIndex
                                ? { ...currentDataset, hidden: nextHidden }
                                : currentDataset,
                        ),
                    }));
                },
            },
            tooltip: {
                mode: 'index' as const,
                intersect: false,
                callbacks: {
                    label: (ctx: {
                        dataset: { label?: string };
                        parsed: { y?: number | string };
                    }) => {
                        const label = ctx.dataset.label || '';
                        const value = ctx.parsed.y;
                        return `${label}: ${typeof value === 'number' ? value.toFixed(3) : value}`;
                    },
                },
            },
        },
    };

    const hasData = chartData.datasets.some((ds) => ds.data.length > 0);

    return (
        <div className="flex h-full flex-col gap-3 p-4">
            <div className="flex justify-end">
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
                    <Line data={chartData} options={options} />
                </div>
            )}
        </div>
    );
}
