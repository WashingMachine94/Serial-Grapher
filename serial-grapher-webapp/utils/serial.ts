import { SERIAL_SETTINGS } from '@/config';

export type ParityType = 'none' | 'even' | 'odd';
export type FlowControlType = 'none' | 'hardware';

export interface SerialOptions {
    baudRate: number;
    dataBits?: 7 | 8;
    stopBits?: 1 | 2; // Web Serial also allows 1.5, but we restrict to common values
    parity?: ParityType;
    flowControl?: FlowControlType;
}

const DEFAULT_OPTIONS: Required<SerialOptions> = {
    baudRate: SERIAL_SETTINGS.DEFAULT_BAUD_RATE,
    dataBits: SERIAL_SETTINGS.DEFAULT_DATA_BITS,
    stopBits: SERIAL_SETTINGS.DEFAULT_STOP_BITS,
    parity: SERIAL_SETTINGS.DEFAULT_PARITY,
    flowControl: SERIAL_SETTINGS.DEFAULT_FLOW_CONTROL,
};

export interface SerialCallbacks {
    onData?: (lines: string[], timestamps?: number[]) => void; // newly completed lines and receive timestamps from the latest read
    onError?: (error: Error) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
}

export class SerialManager {
    private port: SerialPort | null = null;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    private connected = false;
    private options: Required<SerialOptions>;
    private lineBuffer = ''; // partial line from previous chunk
    private callbacks: SerialCallbacks[] = [];
    private readAbortController: AbortController | null = null;
    private latestLine: string | null = null;
    private latestLineTimestamp = 0;
    private lastReceiveTimestamp = 0;
    private lastChunkTimestamp = 0;
    private estimatedLineIntervalMs: number =
        SERIAL_SETTINGS.DEFAULT_ESTIMATED_LINE_INTERVAL_MS;

    constructor(callbacks: SerialCallbacks = {}) {
        this.options = { ...DEFAULT_OPTIONS };
        this.registerCallbacks(callbacks);
    }

    registerCallbacks(callbacks: SerialCallbacks = {}): () => void {
        this.callbacks.push(callbacks);

        return () => {
            this.callbacks = this.callbacks.filter(
                (entry) => entry !== callbacks,
            );
        };
    }

    // --- Public API ---

    /** Connect to a serial port selected by the user. */
    async connect(options: Partial<SerialOptions> = {}): Promise<void> {
        if (this.connected) {
            throw new Error('Already connected');
        }

        // Merge options
        this.options = { ...this.options, ...options };

        try {
            const port = await navigator.serial.requestPort();
            this.port = port;

            const serialOptions: SerialOptions = {
                baudRate: this.options.baudRate,
                dataBits: this.options.dataBits,
                stopBits: this.options.stopBits,
                parity: this.options.parity,
                flowControl: this.options.flowControl,
            };
            await port.open(serialOptions);

            // Set up writer
            if (port.writable) {
                this.writer = port.writable.getWriter();
            }

            this.connected = true;
            this.emitConnect();

            // Start reading loop
            this.readAbortController = new AbortController();
            await this.readLoop(this.readAbortController.signal);
        } catch (error) {
            await this.cleanupConnection(false);
            const err =
                error instanceof Error ? error : new Error(String(error));
            this.emitError(err);
            throw err;
        }
    }

    /** Disconnect and clean up resources. */
    async disconnect(): Promise<void> {
        if (!this.connected && !this.reader && !this.writer && !this.port) {
            return;
        }

        await this.cleanupConnection(true);
    }

    /** Send a line of text (appends newline automatically). */
    async send(data: string): Promise<void> {
        if (!this.connected || !this.writer) {
            throw new Error('Not connected');
        }
        if (!data.trim()) return;

        const encoded = new TextEncoder().encode(data + '\n');
        try {
            await this.writer.write(encoded);
        } catch (error) {
            await this.cleanupConnection(true);
            const err =
                error instanceof Error ? error : new Error(String(error));
            throw err;
        }
    }

    getLatestLine(): string | null {
        return this.latestLine;
    }

    getLatestLineTimestamp(): number {
        return this.latestLineTimestamp;
    }

    /** Get connection status. */
    isConnected(): boolean {
        return this.connected;
    }

    /** Get current options. */
    getOptions(): Required<SerialOptions> {
        return { ...this.options };
    }

    clearBuffer(): void {
        this.lineBuffer = '';
        this.latestLine = null;
        this.latestLineTimestamp = 0;
        this.emitData([]);
    }

    // --- Private methods ---

    private async readLoop(signal: AbortSignal): Promise<void> {
        if (!this.port || !this.port.readable) return;

        this.reader = this.port.readable.getReader();

        try {
            while (true) {
                if (signal.aborted) break;
                const { value, done } = await this.reader.read();
                if (done) break;
                const text = new TextDecoder().decode(value);
                this.handleData(text);
            }
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                // normal cancellation
            } else {
                const err =
                    error instanceof Error ? error : new Error(String(error));
                this.emitError(err);
                await this.cleanupConnection(true);
            }
        } finally {
            if (this.reader) {
                this.reader.releaseLock();
                this.reader = null;
            }
        }
    }

    private handleData(data: string): void {
        // Normalize CRLF to LF
        const combined = this.lineBuffer + data.replace(/\r\n/g, '\n');
        const parts = combined.split('\n');

        // Determine if the incoming chunk ends with a newline
        const endsWithNewline = data.endsWith('\n') || data.endsWith('\r\n');

        let completeLines: string[];
        let remainder: string;

        if (endsWithNewline) {
            completeLines = parts.filter((part) => part !== '');
            remainder = '';
        } else {
            completeLines = parts.slice(0, -1);
            remainder = parts[parts.length - 1];
        }

        this.lineBuffer = remainder;

        if (completeLines.length > 0) {
            const timestamps = this.createReceiveTimestamps(
                completeLines.length,
            );
            this.latestLine = completeLines.at(-1) ?? null;
            this.latestLineTimestamp = timestamps.at(-1) ?? Date.now();
            this.emitData(completeLines, timestamps);
        }
    }

    private createReceiveTimestamps(count: number): number[] {
        const now = performance.timeOrigin + performance.now();
        const minimumStepMs = SERIAL_SETTINGS.TIMESTAMP_STEP_MS;
        const previousLineTimestamp = this.lastReceiveTimestamp;

        if (this.lastChunkTimestamp > 0) {
            const chunkDelta = now - this.lastChunkTimestamp;
            const observedInterval = Math.max(
                minimumStepMs,
                chunkDelta / Math.max(1, count),
            );
            // Keep the interval stable across jittery chunk sizes.
            this.estimatedLineIntervalMs =
                this.estimatedLineIntervalMs * 0.8 + observedInterval * 0.2;
        }

        const step = Math.max(this.estimatedLineIntervalMs, minimumStepMs);

        let next =
            previousLineTimestamp > 0
                ? previousLineTimestamp + step
                : now - step * (count - 1);

        const projectedTail = next + step * (count - 1);
        // After a long idle gap, re-anchor to current time.
        if (now - projectedTail > step * 8) {
            next = now - step * (count - 1);
        }

        const timestamps: number[] = [];
        for (let index = 0; index < count; index += 1) {
            timestamps.push(next);
            next += step;
        }

        this.lastReceiveTimestamp =
            timestamps.at(-1) ?? this.lastReceiveTimestamp;
        this.lastChunkTimestamp = now;
        return timestamps;
    }

    private emitData(lines: string[], timestamps?: number[]): void {
        this.callbacks.forEach((callback) =>
            callback.onData?.(lines, timestamps),
        );
    }

    private emitConnect(): void {
        this.callbacks.forEach((callback) => callback.onConnect?.());
    }

    private emitDisconnect(): void {
        this.callbacks.forEach((callback) => callback.onDisconnect?.());
    }

    private emitError(error: Error): void {
        this.callbacks.forEach((callback) => callback.onError?.(error));
    }

    private async cleanupConnection(emitDisconnect: boolean): Promise<void> {
        const reader = this.reader;
        const writer = this.writer;
        const port = this.port;

        this.connected = false;

        if (this.readAbortController) {
            this.readAbortController.abort();
            this.readAbortController = null;
        }

        try {
            if (reader) {
                await reader.cancel();
                reader.releaseLock();
            }
        } catch {
            // The port may already be gone.
        }

        try {
            if (writer) {
                await writer.close();
            }
        } catch {
            // The port may already be gone.
        }

        try {
            if (port) {
                await port.close();
            }
        } catch {
            // The port may already be gone.
        }

        this.reader = null;
        this.writer = null;
        this.port = null;

        if (emitDisconnect) {
            this.emitDisconnect();
        }
    }
}
