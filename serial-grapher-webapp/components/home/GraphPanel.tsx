'use client';

import { useSyncExternalStore } from 'react';
import Highcharts from 'highcharts/highstock.src';
import HighchartsReact from 'highcharts-react-official';
import { PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { dataBufferManager, type NodeData } from '@/utils/dataBufferManager';
import {
    graphManager,
    type GraphDefinition,
    type GraphType,
} from '@/utils/graphManager';
import { numericChartOptions } from './dashboard/dashboard';

const EMPTY_NODES: NodeData[] = [];
const EMPTY_GRAPHS: GraphDefinition[] = [];

function buildGraphSeries(graph: GraphDefinition, nodes: NodeData[]) {
    return nodes
        .filter((node) => node.enabled && !node.isTimestamp)
        .map((node) => ({
            name: `${node.parserName}: ${node.name}`,
            type:
                graph.type === 'area'
                    ? 'area'
                    : graph.type === 'bar'
                      ? 'column'
                      : graph.type === 'scatter'
                        ? 'scatter'
                        : 'line',
            color: node.color,
            fillOpacity: graph.type === 'area' ? 0.18 : undefined,
            data: (node.buffer ?? [])
                .filter((point) => typeof point.value === 'number')
                .map((point) => [point.timestamp, point.value]),
            marker: { enabled: false },
        }));
}

export default function GraphPanel() {
    const graphs = useSyncExternalStore(
        (onStoreChange) => graphManager.subscribe(onStoreChange),
        () => graphManager.getGraphs(),
        () => EMPTY_GRAPHS,
    );

    const enabledNodes = useSyncExternalStore(
        (onStoreChange) =>
            dataBufferManager.subscribeNodesChanged(onStoreChange),
        () => dataBufferManager.getEnabledNodes(),
        () => EMPTY_NODES,
    );

    const nodes = enabledNodes;

    const addGraph = () => graphManager.addGraph();

    const updateGraph = (
        graphId: string,
        updates: Partial<Pick<GraphDefinition, 'name' | 'type' | 'nodeIds'>>,
    ) => graphManager.updateGraph(graphId, updates);

    const assignNodeToGraph = (graphId: string, nodeId: string) =>
        graphManager.assignNodeToGraph(graphId, nodeId);

    const removeNodeFromGraph = (graphId: string, nodeId: string) =>
        graphManager.removeNodeFromGraph(graphId, nodeId);

    const removeGraph = (graphId: string) => graphManager.removeGraph(graphId);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Graphs</span>
                <Button variant="outline" size="sm" onClick={addGraph}>
                    <PlusIcon size={16} className="mr-1" /> Add Graph
                </Button>
            </div>

            <div className="rounded-md border p-2">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                    Available nodes
                </div>
                {nodes.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                        No parser nodes available yet.
                    </div>
                ) : (
                    <div className="flex max-h-32 flex-col gap-1 overflow-auto">
                        {nodes.map((node) => (
                            <div
                                key={node.id}
                                draggable
                                onDragStart={(event) => {
                                    event.dataTransfer.setData(
                                        'application/x-serial-grapher-node',
                                        node.id,
                                    );
                                    event.dataTransfer.effectAllowed = 'copy';
                                }}
                                className="flex cursor-grab items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs transition-colors hover:bg-muted/60 active:cursor-grabbing"
                            >
                                <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: node.color }}
                                />
                                <span className="truncate">
                                    {node.parserName}: {node.name}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-auto">
                {graphs.map((graph) => {
                    const assignedNodes = Array.from(
                        new Map(
                            [...new Set(graph.nodeIds)]
                                .map((nodeId) =>
                                    nodes.find((node) => node.id === nodeId),
                                )
                                .filter((node): node is NodeData =>
                                    Boolean(node),
                                )
                                .map((node) => [node.id, node] as const),
                        ).values(),
                    );

                    return (
                        <div
                            key={graph.id}
                            className="rounded-md border p-2"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                                event.preventDefault();
                                const nodeId = event.dataTransfer.getData(
                                    'application/x-serial-grapher-node',
                                );
                                if (nodeId) assignNodeToGraph(graph.id, nodeId);
                            }}
                        >
                            <div className="mb-2 flex items-center gap-2">
                                <input
                                    value={graph.name}
                                    onChange={(event) =>
                                        updateGraph(graph.id, {
                                            name: event.target.value,
                                        })
                                    }
                                    className="h-7 flex-1 rounded-md border border-input bg-input/20 px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                                />
                                <Select
                                    value={graph.type}
                                    onValueChange={(value) =>
                                        updateGraph(graph.id, {
                                            type: value as GraphType,
                                        })
                                    }
                                >
                                    <SelectTrigger className="w-24">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="line">
                                            Line
                                        </SelectItem>
                                        <SelectItem value="area">
                                            Area
                                        </SelectItem>
                                        <SelectItem value="bar">Bar</SelectItem>
                                        <SelectItem value="scatter">
                                            Scatter
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                {graphs.length > 1 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeGraph(graph.id)}
                                        title="Remove graph"
                                    >
                                        <TrashIcon size={16} />
                                    </Button>
                                )}
                            </div>

                            <div className="rounded-md border border-dashed bg-muted/10 p-2 text-xs text-muted-foreground">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className="font-medium text-foreground">
                                        {graph.type} graph
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                        {assignedNodes.length} node
                                        {assignedNodes.length === 1 ? '' : 's'}
                                    </span>
                                </div>

                                {assignedNodes.length === 0 ? (
                                    <div>Drop nodes here to plot them.</div>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {assignedNodes.map((node) => (
                                            <div
                                                key={node.id}
                                                className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1"
                                            >
                                                <span
                                                    className="h-2 w-2 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            node.color,
                                                    }}
                                                />
                                                <span>{node.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        removeNodeFromGraph(
                                                            graph.id,
                                                            node.id,
                                                        )
                                                    }
                                                    className="ml-1 text-muted-foreground hover:text-foreground"
                                                    aria-label={`Remove ${node.name}`}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
