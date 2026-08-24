export interface FileUploadCallbacks {
    onData?: (lines: string[]) => void;
    onError?: (error: Error) => void;
    onFileProcessed?: (fileName: string, lines: number) => void;
}

export class FileUploadManager {
    private lines: string[] = [];
    private bufferSize = 1000;
    private callbacks: FileUploadCallbacks[] = [];
    private latestLine: string | null = null;
    private latestLineTimestamp = 0;

    constructor(callbacks: FileUploadCallbacks = {}) {
        this.registerCallbacks(callbacks);
    }

    registerCallbacks(callbacks: FileUploadCallbacks = {}): () => void {
        this.callbacks.push(callbacks);

        return () => {
            this.callbacks = this.callbacks.filter((entry) => entry !== callbacks);
        };
    }

    setBufferSize(size: number): void {
        if (size < 1) throw new Error('Buffer size must be at least 1');
        this.bufferSize = size;
        if (this.lines.length > size) {
            this.lines = this.lines.slice(-size);
        }
    }

    getLines(): string[] {
        return [...this.lines];
    }

    getLatestLine(): string | null {
        return this.latestLine;
    }

    getLatestLineTimestamp(): number {
        return this.latestLineTimestamp;
    }

    clearBuffer(): void {
        this.lines = [];
        this.latestLine = null;
        this.latestLineTimestamp = 0;
        this.emitData([]);
    }

    async injectFile(file: File): Promise<number> {
        if (!file) return 0;

        try {
            const contents = await file.text();
            const normalized = contents.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const parsedLines = normalized
                .split('\n')
                .filter(
                    (line, index, array) =>
                        !(index === array.length - 1 && line === ''),
                );

            if (parsedLines.length === 0) return 0;

            for (const line of parsedLines) {
                this.lines.push(line);
                if (this.lines.length > this.bufferSize) {
                    this.lines = this.lines.slice(-this.bufferSize);
                }
                this.latestLine = line;
                this.latestLineTimestamp = Date.now();
                this.emitData([line]);
            }

            this.callbacks.forEach((callback) =>
                callback.onFileProcessed?.(file.name, parsedLines.length),
            );
            return parsedLines.length;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.emitError(err);
            throw err;
        }
    }

    async injectFiles(files: File[] | FileList): Promise<number> {
        let total = 0;
        for (const file of Array.from(files)) {
            total += await this.injectFile(file);
        }
        return total;
    }

    private emitData(lines: string[]): void {
        this.callbacks.forEach((callback) => callback.onData?.(lines));
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
