import { getSerialManager } from './state';
import { highlightColors } from './translation';
import { getFileUploadManager } from './fileUpload';

export type ParserTrigger = 'includes' | 'startsWith';

export interface NodeData {
    id: string;
    parserId: string;
    parserName: string;
    name: string;
    isTimestamp: boolean;
    color: string;
    buffer: Array<{ timestamp: number; value: number | string }>;
}

export interface ParserData {
    id: string;
    name: string;
    triggerType: ParserTrigger;
    triggerValue: string;
    regexPattern: string;
    testLine: string;
    nodes: NodeData[];
}

type DataCallback = (
    nodeId: string,
    dataPoint: { timestamp: number; value: number | string },
) => void;
type NodesChangeCallback = () => void;

const STORAGE_KEY = 'serial-grapher.parsers.v1';

class DataBufferManager {
    private parsers: ParserData[] = [];
    private maxBufferSize: number = 5000;
    private dataCallbacks: DataCallback[] = [];
    private nodeChangeCallbacks: NodesChangeCallback[] = [];

    private static instance: DataBufferManager;
    static getInstance(): DataBufferManager {
        if (!this.instance) this.instance = new DataBufferManager();
        return this.instance;
    }

    constructor() {
        this.parsers = this.loadPersistedParsers();
    }

    private loadPersistedParsers(): ParserData[] {
        if (typeof window === 'undefined') return [];

        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];

            return parsed.filter(
                (parser): parser is ParserData =>
                    !!parser &&
                    typeof parser.id === 'string' &&
                    typeof parser.name === 'string' &&
                    Array.isArray(parser.nodes),
            );
        } catch {
            return [];
        }
    }

    private persistParsers() {
        if (typeof window === 'undefined') return;

        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(this.parsers),
            );
        } catch {
            // Ignore quota or storage issues.
        }
    }

    getParsers(): ParserData[] {
        return this.parsers;
    }

    getNodes(): NodeData[] {
        return this.parsers.flatMap((parser) => parser.nodes);
    }

    addParser(name: string): string {
        const id = this.createId();
        this.parsers = [
            ...this.parsers,
            {
                id,
                name,
                triggerType: 'includes',
                triggerValue: '',
                regexPattern: '',
                testLine: '',
                nodes: [],
            },
        ];
        this.emitNodesChanged();
        return id;
    }

    removeParser(id: string) {
        this.parsers = this.parsers.filter((parser) => parser.id !== id);
        this.emitNodesChanged();
    }

    updateParser(
        id: string,
        updates: Partial<Omit<ParserData, 'id' | 'nodes'>>,
    ) {
        this.parsers = this.parsers.map((parser) =>
            parser.id === id
                ? {
                      ...parser,
                      ...updates,
                      nodes: updates.name
                          ? parser.nodes.map((node) => ({
                                ...node,
                                parserName: updates.name!,
                            }))
                          : parser.nodes,
                  }
                : parser,
        );
        this.emitNodesChanged();
    }

    addNode(parserId: string, name: string, isTimestamp = false): string {
        const parser = this.parsers.find((item) => item.id === parserId);
        if (!parser) return '';

        const id = this.createId();
        const colorIndex = this.getNodes().length % highlightColors.length;
        const node = {
            id,
            parserId,
            parserName: parser.name,
            name,
            isTimestamp,
            color: highlightColors[colorIndex],
            buffer: [],
        } satisfies NodeData;
        this.parsers = this.parsers.map((item) =>
            item.id === parserId
                ? { ...item, nodes: [...item.nodes, node] }
                : item,
        );
        this.emitNodesChanged();
        return id;
    }

    removeNode(id: string) {
        this.parsers = this.parsers.map((parser) => ({
            ...parser,
            nodes: parser.nodes.filter((node) => node.id !== id),
        }));
        this.emitNodesChanged();
    }

    updateNode(
        id: string,
        updates: Partial<Pick<NodeData, 'name' | 'isTimestamp'>>,
    ) {
        this.parsers = this.parsers.map((parser) => {
            if (!parser.nodes.some((node) => node.id === id)) return parser;
            return {
                ...parser,
                nodes: parser.nodes.map((node) => ({
                    ...node,
                    ...(updates.isTimestamp === true
                        ? { isTimestamp: node.id === id }
                        : {}),
                    ...(node.id === id ? updates : {}),
                })),
            };
        });
        this.emitNodesChanged();
    }

    clearBuffers() {
        this.parsers = this.parsers.map((parser) => ({
            ...parser,
            nodes: parser.nodes.map((node) => ({ ...node, buffer: [] })),
        }));
        this.persistParsers();
        this.emitNodesChanged();
    }

    /** Process the most recent line from the serial manager (for manual trigger) */
    processLatestLine() {
        const sources = [
            getSerialManager(),
            getFileUploadManager(),
        ];

        const latestLine = sources
            .flatMap((manager) => manager.getLines())
            .at(-1);

        if (latestLine) {
            this.processLine(latestLine);
        }
    }

    setMaxBufferSize(size: number) {
        if (size < 1) return;
        this.maxBufferSize = size;
        this.parsers = this.parsers.map((parser) => ({
            ...parser,
            nodes: parser.nodes.map((node) =>
                node.buffer.length > size
                    ? { ...node, buffer: node.buffer.slice(-size) }
                    : node,
            ),
        }));
    }

    processLine(line: string) {
        if (!line) return;

        this.parsers = this.parsers.map((parser) => {
            const triggered =
                parser.triggerType === 'includes'
                    ? line.includes(parser.triggerValue)
                    : line.startsWith(parser.triggerValue);
            if (!triggered || !parser.regexPattern || parser.nodes.length === 0)
                return parser;

            const matches = this.extractMatches(line, parser.regexPattern);
            if (matches.length === 0) return parser;

            const timestampNode = parser.nodes.find((node) => node.isTimestamp);
            const timestampIndex = timestampNode
                ? parser.nodes.indexOf(timestampNode)
                : -1;
            const parsedTimestamp = parseFloat(matches[timestampIndex] ?? '');
            const commonTimestamp = !isNaN(parsedTimestamp)
                ? parsedTimestamp
                : Date.now();

            const nodes = parser.nodes.map((node, index) => {
                const raw = matches[index] ?? '';
                const parsed = parseFloat(raw);
                const value: number | string =
                    raw !== '' && !isNaN(parsed) ? parsed : raw;
                const buffer = [
                    ...node.buffer,
                    { timestamp: commonTimestamp, value },
                ].slice(-this.maxBufferSize);

                if (!node.isTimestamp) {
                    this.dataCallbacks.forEach((callback) =>
                        callback(node.id, {
                            timestamp: commonTimestamp,
                            value,
                        }),
                    );
                }
                return { ...node, buffer };
            });
            return { ...parser, nodes };
        });
        this.emitNodesChanged();
    }

    private extractMatches(line: string, pattern: string): string[] {
        try {
            const regex = new RegExp(pattern, 'g');
            const matches: string[] = [];
            let match: RegExpExecArray | null;
            while ((match = regex.exec(line)) !== null) matches.push(match[0]);
            return matches;
        } catch {
            return [];
        }
    }

    subscribeData(callback: DataCallback): () => void {
        this.dataCallbacks.push(callback);
        return () => {
            this.dataCallbacks = this.dataCallbacks.filter(
                (cb) => cb !== callback,
            );
        };
    }

    subscribeNodesChanged(callback: NodesChangeCallback): () => void {
        this.nodeChangeCallbacks.push(callback);
        return () => {
            this.nodeChangeCallbacks = this.nodeChangeCallbacks.filter(
                (cb) => cb !== callback,
            );
        };
    }

    private emitNodesChanged() {
        this.nodeChangeCallbacks.forEach((cb) => cb());
    }

    private createId() {
        return (
            crypto.randomUUID?.() || Math.random().toString(36).substring(2, 9)
        );
    }
}

export const dataBufferManager = DataBufferManager.getInstance();
