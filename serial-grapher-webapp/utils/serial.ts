export type ParityType = 'none' | 'even' | 'odd';
export type FlowControlType = 'none' | 'hardware';

export interface SerialOptions {
    baudRate: number;
    dataBits?: 7 | 8;
    stopBits?: 1 | 2; // Web Serial also allows 1.5, but we restrict to common values
    parity?: ParityType;
    flowControl?: FlowControlType;
    bufferSize?: number; // number of lines to keep in ring buffer
}

const DEFAULT_OPTIONS: Required<SerialOptions> = {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
    bufferSize: 1000,
};

export interface SerialCallbacks {
    onData?: (lines: string[]) => void; // newly completed lines from the latest read
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
    private lines: string[] = [];
    private lineBuffer = ''; // partial line from previous chunk
    private callbacks: SerialCallbacks[] = [];
    private readAbortController: AbortController | null = null;

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
            this.connected = false;
            const err =
                error instanceof Error ? error : new Error(String(error));
            this.emitError(err);
            throw err;
        }
    }

    /** Disconnect and clean up resources. */
    async disconnect(): Promise<void> {
        if (!this.connected) return;

        try {
            // Cancel reader
            if (this.reader) {
                await this.reader.cancel();
            }
            if (this.readAbortController) {
                this.readAbortController.abort();
                this.readAbortController = null;
            }

            // Close writer
            if (this.writer) {
                await this.writer.close();
                this.writer = null;
            }

            // Close port
            if (this.port) {
                await this.port.close();
                this.port = null;
            }

            this.connected = false;
            this.emitDisconnect();
        } catch (error) {
            const err =
                error instanceof Error ? error : new Error(String(error));
            this.emitError(err);
            throw err;
        }
        this.reader = null;
    }

    /** Send a line of text (appends newline automatically). */
    async send(data: string): Promise<void> {
        if (!this.connected || !this.writer) {
            throw new Error('Not connected');
        }
        if (!data.trim()) return;

        const encoded = new TextEncoder().encode(data + '\n');
        await this.writer.write(encoded);
    }

    /** Get the current ring buffer of lines. */
    getLines(): string[] {
        return [...this.lines];
    }

    /** Get connection status. */
    isConnected(): boolean {
        return this.connected;
    }

    /** Get current options. */
    getOptions(): Required<SerialOptions> {
        return { ...this.options };
    }

    /** Set a new buffer size (trims lines if needed). */
    setBufferSize(size: number): void {
        if (size < 1) throw new Error('Buffer size must be at least 1');
        this.options.bufferSize = size;
        if (this.lines.length > size) {
            this.lines = this.lines.slice(-size);
        }
    }

    /** Clear the line buffer. */
    clearBuffer(): void {
        this.lines = [];
        this.lineBuffer = '';
        this.emitData(this.lines);
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
            // Append new lines and trim to buffer size
            this.lines.push(...completeLines);
            const bufferSize = this.options.bufferSize;
            if (this.lines.length > bufferSize) {
                this.lines = this.lines.slice(-bufferSize);
            }
            // Notify listeners with only the lines completed by this read.
            this.emitData(completeLines);
        }
    }

    private emitData(lines: string[]): void {
        this.callbacks.forEach((callback) => callback.onData?.(lines));
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
}
