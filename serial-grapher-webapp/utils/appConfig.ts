import { dataBufferManager, type ParserData } from './dataBufferManager';
import {
    graphManager,
    type GraphDefinition,
    type GraphType,
} from './graphManager';

const VALID_GRAPH_TYPES: GraphType[] = ['line', 'area', 'bar', 'scatter'];

function isValidGraphType(value: unknown): value is GraphType {
    return (
        typeof value === 'string' &&
        VALID_GRAPH_TYPES.includes(value as GraphType)
    );
}

export interface SerialGrapherConfig {
    version: 1;
    savedAt: string;
    parsers: ParserData[];
    graphs: GraphDefinition[];
}

export function buildConfigSnapshot(): SerialGrapherConfig {
    return {
        version: 1,
        savedAt: new Date().toISOString(),
        parsers: dataBufferManager.getPersistableParsers(),
        graphs: graphManager.getGraphs().map((graph) => ({
            ...graph,
            nodeIds: [...new Set(graph.nodeIds.filter(Boolean))],
        })),
    };
}

export function parseConfigSnapshot(raw: unknown): {
    parsers: ParserData[];
    graphs: GraphDefinition[];
} {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Invalid config file: expected a JSON object.');
    }

    const payload = raw as {
        version?: unknown;
        parsers?: unknown;
        graphs?: unknown;
    };

    if (!Array.isArray(payload.parsers)) {
        throw new Error('Invalid config file: "parsers" must be an array.');
    }

    if (!Array.isArray(payload.graphs)) {
        throw new Error('Invalid config file: "graphs" must be an array.');
    }

    const graphs = payload.graphs
        .filter(
            (
                graph,
            ): graph is {
                id: string;
                name: string;
                type: GraphType;
                nodeIds: string[];
            } =>
                !!graph &&
                typeof graph === 'object' &&
                typeof (graph as { id?: unknown }).id === 'string' &&
                typeof (graph as { name?: unknown }).name === 'string' &&
                isValidGraphType((graph as { type?: unknown }).type) &&
                Array.isArray((graph as { nodeIds?: unknown[] }).nodeIds),
        )
        .map((graph) => ({
            ...graph,
            nodeIds: [
                ...new Set(
                    graph.nodeIds.filter(
                        (nodeId) =>
                            typeof nodeId === 'string' && nodeId.length > 0,
                    ),
                ),
            ],
        }));

    return {
        parsers: payload.parsers as ParserData[],
        graphs,
    };
}
