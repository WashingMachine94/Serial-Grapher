import { getSerialManager } from './state';
import { highlightColors } from './translation';
import { getFileUploadManager } from './fileUpload';

export type ParserTrigger = 'includes' | 'startsWith';

export interface NodeData {
    id: string;
    parserId: string;
    parserName: string;
    name: string;
    enabled: boolean;
    isTimestamp: boolean;
    color: string;
    buffer: Array<{ timestamp: number; value: number | string }>;
}

export interface ParserData {
    id: string;
    name: string;
    enabled: boolean;
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
type SubscriptionChangeCallback = () => void;

const STORAGE_KEY = 'serial-grapher.parsers.v1';
const VALID_TRIGGER_TYPES: ParserTrigger[] = ['includes', 'startsWith'];

function isValidTriggerType(value: unknown): value is ParserTrigger {
    return (
        typeof value === 'string' &&
        VALID_TRIGGER_TYPES.includes(value as ParserTrigger)
    );
}

class DataBufferManager {
    private parsers: ParserData[] = [];
    private nodesCache: NodeData[] = [];
    private enabledNodesCache: NodeData[] = [];
    private lastFallbackTimestamp = 0;
    private dataCallbacks: DataCallback[] = [];
    private nodeChangeCallbacks: NodesChangeCallback[] = [];
    private subscriptionChangeCallbacks: SubscriptionChangeCallback[] = [];
    private subscribed = false;

    private static instance: DataBufferManager;
    static getInstance(): DataBufferManager {
        if (!this.instance) this.instance = new DataBufferManager();
        return this.instance;
    }

    constructor() {
        this.parsers = this.loadPersistedParsers();
        this.refreshDerivedCaches();
    }

    private refreshDerivedCaches() {
        this.nodesCache = this.parsers.flatMap((parser) => parser.nodes);
        this.enabledNodesCache = this.getEnabledParsers().flatMap((parser) =>
            parser.nodes.filter((node) => node.enabled),
        );
    }

    private toPersistedParsers(): ParserData[] {
        return this.parsers.map((parser) => ({
            ...parser,
            nodes: parser.nodes.map((node) => ({
                ...node,
                // Buffers are runtime-only and can exceed localStorage limits.
                buffer: [],
            })),
        }));
    }

    private loadPersistedParsers(): ParserData[] {
        if (typeof window === 'undefined') return [];

        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];

            return this.sanitizeParsers(parsed);
        } catch {
            return [];
        }
    }

    private sanitizeParsers(parsers: unknown[]): ParserData[] {
        return parsers
            .filter(
                (
                    parser,
                ): parser is {
                    id: string;
                    name: string;
                    enabled?: boolean;
                    triggerType?: ParserTrigger;
                    triggerValue?: string;
                    regexPattern?: string;
                    testLine?: string;
                    nodes: unknown[];
                } =>
                    !!parser &&
                    typeof parser === 'object' &&
                    typeof (parser as { id?: unknown }).id === 'string' &&
                    typeof (parser as { name?: unknown }).name === 'string' &&
                    Array.isArray((parser as { nodes?: unknown[] }).nodes),
            )
            .map((parser) => {
                let hasTimestampNode = false;

                const nodes = parser.nodes
                    .filter(
                        (
                            node,
                        ): node is {
                            id?: string;
                            parserId?: string;
                            parserName?: string;
                            name?: string;
                            enabled?: boolean;
                            isTimestamp?: boolean;
                            color?: string;
                            buffer?: Array<{
                                timestamp: number;
                                value: number | string;
                            }>;
                        } => !!node && typeof node === 'object',
                    )
                    .map((node, nodeIndex) => {
                        const isTimestamp =
                            !hasTimestampNode && node.isTimestamp === true;
                        if (isTimestamp) {
                            hasTimestampNode = true;
                        }

                        return {
                            id:
                                typeof node.id === 'string' && node.id.length
                                    ? node.id
                                    : this.createId(),
                            parserId:
                                typeof node.parserId === 'string' &&
                                node.parserId.length
                                    ? node.parserId
                                    : parser.id,
                            parserName:
                                typeof node.parserName === 'string' &&
                                node.parserName.length
                                    ? node.parserName
                                    : parser.name,
                            name:
                                typeof node.name === 'string' &&
                                node.name.length
                                    ? node.name
                                    : `Node ${nodeIndex + 1}`,
                            enabled: node.enabled ?? true,
                            isTimestamp,
                            color:
                                typeof node.color === 'string' &&
                                node.color.length
                                    ? node.color
                                    : highlightColors[
                                          nodeIndex % highlightColors.length
                                      ],
                            buffer: Array.isArray(node.buffer)
                                ? node.buffer
                                      .filter(
                                          (point) =>
                                              !!point &&
                                              Number.isFinite(
                                                  point.timestamp,
                                              ) &&
                                              (typeof point.value ===
                                                  'number' ||
                                                  typeof point.value ===
                                                      'string'),
                                      )
                                      .map((point) => ({
                                          timestamp: point.timestamp,
                                          value: point.value,
                                      }))
                                : [],
                        } satisfies NodeData;
                    });

                return {
                    id: parser.id,
                    name: parser.name,
                    enabled: parser.enabled ?? true,
                    triggerType: isValidTriggerType(parser.triggerType)
                        ? parser.triggerType
                        : 'includes',
                    triggerValue:
                        typeof parser.triggerValue === 'string'
                            ? parser.triggerValue
                            : '',
                    regexPattern:
                        typeof parser.regexPattern === 'string'
                            ? parser.regexPattern
                            : '',
                    testLine:
                        typeof parser.testLine === 'string'
                            ? parser.testLine
                            : '',
                    nodes,
                } satisfies ParserData;
            });
    }

    private persistParsers() {
        if (typeof window === 'undefined') return;

        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(this.toPersistedParsers()),
            );
        } catch {
            // Ignore quota or storage issues.
        }
    }

    getParsers(): ParserData[] {
        return this.parsers;
    }

    getPersistableParsers(): ParserData[] {
        return this.toPersistedParsers();
    }

    setParsers(parsers: ParserData[]) {
        this.parsers = this.sanitizeParsers(parsers);
        this.refreshDerivedCaches();
        this.persistParsers();
        this.emitNodesChanged();
    }

    getEnabledParsers(): ParserData[] {
        return this.parsers.filter((parser) => parser.enabled);
    }

    getNodes(): NodeData[] {
        return this.nodesCache;
    }

    getEnabledNodes(): NodeData[] {
        return this.enabledNodesCache;
    }

    isSubscribed() {
        return this.subscribed;
    }

    setSubscribed(value: boolean) {
        if (this.subscribed === value) return;
        this.subscribed = value;
        this.subscriptionChangeCallbacks.forEach((callback) => callback());
    }

    addParser(name: string): string {
        const id = this.createId();
        this.parsers = [
            ...this.parsers,
            {
                id,
                name,
                enabled: true,
                triggerType: 'includes',
                triggerValue: '',
                regexPattern: '',
                testLine: '',
                nodes: [],
            },
        ];
        this.refreshDerivedCaches();
        this.persistParsers();
        this.emitNodesChanged();
        return id;
    }

    removeParser(id: string) {
        this.parsers = this.parsers.filter((parser) => parser.id !== id);
        this.refreshDerivedCaches();
        this.persistParsers();
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
        this.refreshDerivedCaches();
        this.persistParsers();
        this.emitNodesChanged();
    }

    private usesDefaultNodeNames(nodes: NodeData[]) {
        return nodes.every((node) => /^Node \d+$/.test(node.name));
    }

    syncParserNodesFromMatches(parserId: string, matchCount: number) {
        if (matchCount < 1) return;

        const parser = this.parsers.find((item) => item.id === parserId);
        if (!parser) return;

        const canOverwriteDefaultNodes =
            parser.nodes.length === 0 ||
            this.usesDefaultNodeNames(parser.nodes);
        if (!canOverwriteDefaultNodes) return;

        const nodes: NodeData[] = Array.from(
            { length: matchCount },
            (_, i) => ({
                id: this.createId(),
                parserId,
                parserName: parser.name,
                name: `Node ${i + 1}`,
                enabled: true,
                isTimestamp: false,
                color: highlightColors[i % highlightColors.length],
                buffer: [],
            }),
        );

        this.parsers = this.parsers.map((item) =>
            item.id === parserId ? { ...item, nodes } : item,
        );
        this.refreshDerivedCaches();
        this.persistParsers();
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
            enabled: true,
            isTimestamp,
            color: highlightColors[colorIndex],
            buffer: [],
        } satisfies NodeData;
        this.parsers = this.parsers.map((item) =>
            item.id === parserId
                ? { ...item, nodes: [...item.nodes, node] }
                : item,
        );
        this.refreshDerivedCaches();
        this.persistParsers();
        this.emitNodesChanged();
        return id;
    }

    removeNode(id: string) {
        this.parsers = this.parsers.map((parser) => ({
            ...parser,
            nodes: parser.nodes.filter((node) => node.id !== id),
        }));
        this.refreshDerivedCaches();
        this.persistParsers();
        this.emitNodesChanged();
    }

    updateNode(
        id: string,
        updates: Partial<Pick<NodeData, 'name' | 'enabled' | 'isTimestamp'>>,
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
        this.refreshDerivedCaches();
        this.persistParsers();
        this.emitNodesChanged();
    }

    clearBuffers() {
        this.parsers = this.parsers.map((parser) => ({
            ...parser,
            nodes: parser.nodes.map((node) => ({ ...node, buffer: [] })),
        }));
        this.refreshDerivedCaches();
        this.persistParsers();
        this.emitNodesChanged();
    }

    /** Process the most recent line from the active sources (for manual trigger) */
    processLatestLine() {
        const sources = [getSerialManager(), getFileUploadManager()];

        const latestLine = sources
            .map((manager) => manager.getLatestLine())
            .filter(
                (line): line is string =>
                    typeof line === 'string' && line.length > 0,
            )
            .at(-1);

        if (latestLine) {
            this.processLine(latestLine, Date.now());
        }
    }

    setMaxBufferSize(size: number) {
        void size;
    }

    private getFallbackTimestamp(receivedAt: number) {
        const base = Number.isFinite(receivedAt) ? receivedAt : Date.now();
        const FALLBACK_TIMESTAMP_STEP_MS = 0.001;
        const nextTimestamp =
            base <= this.lastFallbackTimestamp
                ? this.lastFallbackTimestamp + FALLBACK_TIMESTAMP_STEP_MS
                : base;
        this.lastFallbackTimestamp = nextTimestamp;
        return nextTimestamp;
    }

    processLine(line: string, receivedAt = Date.now()) {
        if (!line) return;

        for (const parser of this.parsers) {
            const triggered =
                parser.triggerType === 'includes'
                    ? line.includes(parser.triggerValue)
                    : line.startsWith(parser.triggerValue);
            if (
                !parser.enabled ||
                !triggered ||
                !parser.regexPattern ||
                parser.nodes.length === 0
            )
                continue;

            const enabledNodes = parser.nodes.filter((node) => node.enabled);
            if (enabledNodes.length === 0) continue;

            const matches = this.extractMatches(line, parser.regexPattern);
            if (matches.length === 0) continue;

            const timestampNode = enabledNodes.find((node) => node.isTimestamp);
            const timestampIndex = timestampNode
                ? parser.nodes.indexOf(timestampNode)
                : -1;
            const parsedTimestamp = parseFloat(matches[timestampIndex] ?? '');
            const commonTimestamp = !isNaN(parsedTimestamp)
                ? parsedTimestamp
                : this.getFallbackTimestamp(receivedAt);

            for (let index = 0; index < parser.nodes.length; index += 1) {
                const node = parser.nodes[index];
                if (!node) continue;
                if (!node.enabled) continue;
                const raw = matches[index] ?? '';
                const parsed = parseFloat(raw);
                const value: number | string =
                    raw !== '' && !isNaN(parsed) ? parsed : raw;
                node.buffer.push({ timestamp: commonTimestamp, value });

                if (!node.isTimestamp) {
                    this.dataCallbacks.forEach((callback) =>
                        callback(node.id, {
                            timestamp: commonTimestamp,
                            value,
                        }),
                    );
                }
            }
        }
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

    subscribeSubscriptionChanged(
        callback: SubscriptionChangeCallback,
    ): () => void {
        this.subscriptionChangeCallbacks.push(callback);
        return () => {
            this.subscriptionChangeCallbacks =
                this.subscriptionChangeCallbacks.filter(
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
