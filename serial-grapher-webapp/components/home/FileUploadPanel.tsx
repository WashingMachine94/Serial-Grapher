'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { UploadSimpleIcon } from '@phosphor-icons/react';
import { Button } from '../ui/button';
import {
    getFileUploadManager,
    type FileUploadManager,
} from '@/utils/fileUpload';

const MAX_DISPLAY_LINES = 50;

export default function FileUploadPanel() {
    const [lines, setLines] = useState<string[]>(() =>
        getFileUploadManager().getLines().slice(-MAX_DISPLAY_LINES),
    );
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const managerRef = useRef<FileUploadManager | null>(null);

    useEffect(() => {
        const manager = getFileUploadManager();
        managerRef.current = manager;

        return manager.registerCallbacks({
            onData: (newLines) =>
                setLines((currentLines) =>
                    [...currentLines, ...newLines].slice(-MAX_DISPLAY_LINES),
                ),
            onError: (error) =>
                toast.error(
                    error.message || 'Failed to process the uploaded file.',
                ),
            onFileProcessed: (fileName, fileLineCount) => {
                toast.success(`Imported ${fileName}`, {
                    description: `${fileLineCount} line${fileLineCount === 1 ? '' : 's'} processed.`,
                    duration: 3000,
                });
            },
        });
    }, []);

    const handleFiles = async (fileList: FileList | File[]) => {
        const files = Array.from(fileList);
        if (files.length === 0) return;

        const manager = managerRef.current ?? getFileUploadManager();
        managerRef.current = manager;

        try {
            await manager.injectFiles(files);
        } catch {
            // Error handling is provided by the manager callback.
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div
                className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-3 text-center transition-colors ${
                    isDragging
                        ? 'border-primary bg-primary/5'
                        : 'border-muted-foreground/30 bg-muted/20 hover:border-primary/60'
                }`}
                onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    void handleFiles(event.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        fileInputRef.current?.click();
                    }
                }}
            >
                <UploadSimpleIcon size={36} className="text-muted-foreground" />
                <Button variant="outline" type="button">
                    Choose files
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                        if (event.target.files) {
                            void handleFiles(event.target.files);
                            event.target.value = '';
                        }
                    }}
                />
            </div>

            <div className="flex-1 min-h-0 overflow-auto bg-black font-mono text-xs border rounded-lg p-3 text-muted-foreground">
                {lines.map((line, index) => (
                    <div key={`${line}-${index}`}>{line}</div>
                ))}
                {lines.length === 0 && <div>Waiting for data...</div>}
            </div>
        </div>
    );
}
