import { SERIAL_SETTINGS } from '@/config';

export interface FileUploadCallbacks {
    onData?: (lines: string[], timestamps?: number[]) => void;
    onError?: (error: Error) => void;
    onFileProcessed?: (fileName: string, lines: number) => void;
}

export class FileUploadManager {
    private callbacks: FileUploadCallbacks[] = [];
    private latestLine: string | null = null;
    private latestLineTimestamp = 0;
    private lastReceiveTimestamp = 0;

    constructor(callbacks: FileUploadCallbacks = {}) {
        this.registerCallbacks(callbacks);
    }

    registerCallbacks(callbacks: FileUploadCallbacks = {}): () => void {
        this.callbacks.push(callbacks);

        return () => {
            this.callbacks = this.callbacks.filter(
                (entry) => entry !== callbacks,
            );
        };
    }

    getLatestLine(): string | null {
        return this.latestLine;
    }

    getLatestLineTimestamp(): number {
        return this.latestLineTimestamp;
    }

    clearBuffer(): void {
        this.latestLine = null;
        this.latestLineTimestamp = 0;
        this.emitData([]);
    }

    async injectFile(file: File): Promise<number> {
        if (!file) return 0;

        try {
            const contents = await file.text();
            const normalized = contents
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n');
            const parsedLines = normalized
                .split('\n')
                .filter(
                    (line, index, array) =>
                        !(index === array.length - 1 && line === ''),
                );

            if (parsedLines.length === 0) return 0;

            const timestamps = this.createReceiveTimestamps(parsedLines.length);

            for (let index = 0; index < parsedLines.length; index += 1) {
                const line = parsedLines[index];
                const timestamp = timestamps[index] ?? Date.now();
                if (!line) continue;
                this.latestLine = line;
                this.latestLineTimestamp = timestamp;
                this.emitData([line], [timestamp]);
            }

            this.callbacks.forEach((callback) =>
                callback.onFileProcessed?.(file.name, parsedLines.length),
            );
            return parsedLines.length;
        } catch (error) {
            const err =
                error instanceof Error ? error : new Error(String(error));
            this.emitError(err);
            throw err;
        }
    }

    private createReceiveTimestamps(count: number): number[] {
        const base = performance.timeOrigin + performance.now();
        const timestamps: number[] = [];
        for (let index = 0; index < count; index += 1) {
            const candidate = base + index * SERIAL_SETTINGS.TIMESTAMP_STEP_MS;
            const next =
                candidate <= this.lastReceiveTimestamp
                    ? this.lastReceiveTimestamp +
                      SERIAL_SETTINGS.TIMESTAMP_STEP_MS
                    : candidate;
            timestamps.push(next);
            this.lastReceiveTimestamp = next;
        }
        return timestamps;
    }

    async injectFiles(files: File[] | FileList): Promise<number> {
        let total = 0;
        for (const file of Array.from(files)) {
            total += await this.injectFile(file);
        }
        return total;
    }

    private emitData(lines: string[], timestamps?: number[]): void {
        this.callbacks.forEach((callback) =>
            callback.onData?.(lines, timestamps),
        );
    }

    private emitError(error: Error): void {
        this.callbacks.forEach((callback) => callback.onError?.(error));
    }
}

let fileUploadManager: FileUploadManager | null = null;

export function getFileUploadManager(): FileUploadManager {
    if (!fileUploadManager) {
        fileUploadManager = new FileUploadManager();
    }

    return fileUploadManager;
}
