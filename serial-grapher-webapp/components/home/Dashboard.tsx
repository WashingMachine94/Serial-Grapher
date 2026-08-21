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
import { dataBufferManager, NodeData } from '@/utils/dataBufferManager';

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

function getYScaleRange(datasets: Array<{ data: Array<number | string> }>) {
    const numericValues = datasets
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

export default function Dashboard() {
    const [nodes, setNodes] = useState<NodeData[]>([]);
    const [isReady, setIsReady] = useState(false);
    const [visiblePoints, setVisiblePoints] = useState(DEFAULT_VISIBLE_POINTS);
    const [chartData, setChartData] = useState<{
        labels: string[];
        datasets: any[];
    }>({ labels: [], datasets: [] });

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
                label: `${node.parserName}: ${node.name}`,
                data: nodeValues,
                borderColor: color,
                backgroundColor: color.replace('0.4', '0.2'),
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.1,
                fill: false,
            };
        });

        const labels = visibleTimestamps.map((timestamp) =>
            formatAxisTimestamp(timestamp),
        );

        setChartData({ labels, datasets });
    }, []);

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
        setNodes(initialNodes);

        initialNodes.forEach((node) => {
            if (!node.isTimestamp && node.buffer.length > 0) {
                dataMap.current.set(node.id, {
                    timestamps: node.buffer.map((dp) => dp.timestamp),
                    values: node.buffer.map((dp) => dp.value),
                });
            }
        });

        setIsReady(true);
        renderChartData();

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
            setNodes(updatedNodes);

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
            setVisiblePoints(nextCount);
            renderChartData();
        },
        [renderChartData],
    );

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
            },
            tooltip: {
                mode: 'index' as const,
                intersect: false,
                callbacks: {
                    label: (ctx: any) => {
                        const label = ctx.dataset.label || '';
                        const value = ctx.parsed.y;
                        return `${label}: ${typeof value === 'number' ? value.toFixed(3) : value}`;
                    },
                },
            },
        },
    };

    if (!isReady)
        return (
            <div className="p-4 text-center text-muted-foreground">
                Loading dashboard…
            </div>
        );

    const hasData = chartData.datasets.some((ds) => ds.data.length > 0);

    return (
        <div className="p-4 h-full">
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
