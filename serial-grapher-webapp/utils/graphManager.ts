export type GraphType = 'line' | 'area' | 'bar' | 'scatter';

export interface GraphDefinition {
    id: string;
    name: string;
    type: GraphType;
    nodeIds: string[];
}

const STORAGE_KEY = 'serial-grapher.graphs.v1';
const DEFAULT_GRAPH: GraphDefinition = {
    id: 'graph-1',
    name: 'Graph 1',
    type: 'line',
    nodeIds: [],
};

type GraphsChangeCallback = () => void;

function normalizeNodeIds(nodeIds: string[] | undefined) {
    return [...new Set((nodeIds ?? []).filter(Boolean))];
}

class GraphManager {
    private graphs: GraphDefinition[] = [DEFAULT_GRAPH];
    private listeners = new Set<GraphsChangeCallback>();

    constructor() {
        this.graphs = this.loadPersistedGraphs();
    }

    subscribe(callback: GraphsChangeCallback) {
        this.listeners.add(callback);
        return () => {
            this.listeners.delete(callback);
        };
    }

    getGraphs(): GraphDefinition[] {
        return this.graphs;
    }

    setGraphs(graphs: GraphDefinition[]) {
        this.graphs = graphs.map((graph) => ({
            ...graph,
            nodeIds: normalizeNodeIds(graph.nodeIds),
        }));
        this.persistGraphs();
        this.emit();
    }

    updateGraph(
        graphId: string,
        updates: Partial<Pick<GraphDefinition, 'name' | 'type' | 'nodeIds'>>,
    ) {
        this.graphs = this.graphs.map((graph) =>
            graph.id === graphId
                ? {
                      ...graph,
                      ...updates,
                      nodeIds: updates.nodeIds
                          ? normalizeNodeIds(updates.nodeIds)
                          : graph.nodeIds,
                  }
                : graph,
        );
        this.persistGraphs();
        this.emit();
    }

    addGraph() {
        const nextNumber = this.graphs.length + 1;
        this.graphs = [
            ...this.graphs,
            {
                id: `graph-${Date.now()}-${nextNumber}`,
                name: `Graph ${nextNumber}`,
                type: 'line',
                nodeIds: [],
            },
        ];
        this.persistGraphs();
        this.emit();
    }

    removeGraph(graphId: string) {
        if (this.graphs.length <= 1) return;
        this.graphs = this.graphs.filter((graph) => graph.id !== graphId);
        this.persistGraphs();
        this.emit();
    }

    assignNodeToGraph(graphId: string, nodeId: string) {
        this.graphs = this.graphs.map((graph) => {
            if (graph.id !== graphId) return graph;
            const nodeIds = normalizeNodeIds([...graph.nodeIds, nodeId]);
            return { ...graph, nodeIds };
        });
        this.persistGraphs();
        this.emit();
    }

    removeNodeFromGraph(graphId: string, nodeId: string) {
        this.graphs = this.graphs.map((graph) =>
            graph.id !== graphId
                ? graph
                : {
                      ...graph,
                      nodeIds: graph.nodeIds.filter(
                          (assignedNodeId) => assignedNodeId !== nodeId,
                      ),
                  },
        );
        this.persistGraphs();
        this.emit();
    }

    private emit() {
        this.listeners.forEach((callback) => callback());
    }

    private loadPersistedGraphs(): GraphDefinition[] {
        if (typeof window === 'undefined') return [DEFAULT_GRAPH];

        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return [DEFAULT_GRAPH];

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) {
                return [DEFAULT_GRAPH];
            }

            const graphs = parsed.filter(
                (item): item is GraphDefinition =>
                    !!item &&
                    typeof item.id === 'string' &&
                    typeof item.name === 'string' &&
                    typeof item.type === 'string' &&
                    Array.isArray(item.nodeIds),
            );

            return graphs.length > 0
                ? graphs.map((graph) => ({
                      ...graph,
                      nodeIds: normalizeNodeIds(graph.nodeIds),
                  }))
                : [DEFAULT_GRAPH];
        } catch {
            return [DEFAULT_GRAPH];
        }
    }

    private persistGraphs() {
        if (typeof window === 'undefined') return;

        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(this.graphs),
            );
        } catch {
            // Ignore quota or storage issues.
        }
    }
}

export const graphManager = new GraphManager();
