'use client';

import { useEffect, useRef, useState } from 'react';
import { getSerialManager } from '@/utils/state';
import { getBluetoothManager } from '@/utils/bluetooth';
import { getFileUploadManager } from '@/utils/fileUpload';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { PaperPlaneRightIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { CONSOLE_SETTINGS } from '@/config';

type SendTarget = 'Serial' | 'Bluetooth';

export default function InputConsolePanel() {
    const pendingLinesRef = useRef<string[]>([]);
    const frameRef = useRef<number | null>(null);
    const consoleRef = useRef<HTMLDivElement | null>(null);
    const [sendTarget, setSendTarget] = useState<SendTarget>('Serial');
    const [message, setMessage] = useState('');
    const [autoScroll, setAutoScroll] = useState(true);
    const [serialConnected, setSerialConnected] = useState(() =>
        getSerialManager().isConnected(),
    );
    const [bluetoothConnected, setBluetoothConnected] = useState(() =>
        getBluetoothManager().isConnected(),
    );
    const [lines, setLines] = useState<string[]>([]);

    useEffect(() => {
        const flushPendingLines = () => {
            frameRef.current = null;
            if (pendingLinesRef.current.length === 0) return;

            const incomingLines = pendingLinesRef.current;
            pendingLinesRef.current = [];
            setLines((currentLines) =>
                [...currentLines, ...incomingLines].slice(
                    -CONSOLE_SETTINGS.MAX_LINES,
                ),
            );
        };

        const scheduleFlush = () => {
            if (frameRef.current != null) return;
            frameRef.current = requestAnimationFrame(flushPendingLines);
        };

        const append =
            (source: 'Serial' | 'Bluetooth' | 'File') =>
            (newLines: string[]) => {
                if (newLines.length === 0) return;
                pendingLinesRef.current.push(
                    ...newLines.map((line) => `[${source}] ${line}`),
                );
                scheduleFlush();
            };

        const serialManager = getSerialManager();
        const bluetoothManager = getBluetoothManager();
        const fileUploadManager = getFileUploadManager();

        const unsubscribeSerial = serialManager.registerCallbacks({
            onData: append('Serial'),
            onConnect: () => setSerialConnected(true),
            onDisconnect: () => setSerialConnected(false),
        });
        const unsubscribeBluetooth = bluetoothManager.registerCallbacks({
            onData: append('Bluetooth'),
            onConnect: () => setBluetoothConnected(true),
            onDisconnect: () => setBluetoothConnected(false),
        });
        const unsubscribeFileUpload = fileUploadManager.registerCallbacks({
            onData: append('File'),
        });

        return () => {
            if (frameRef.current != null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
            unsubscribeSerial();
            unsubscribeBluetooth();
            unsubscribeFileUpload();
        };
    }, []);

    useEffect(() => {
        if (!autoScroll) return;
        const container = consoleRef.current;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
    }, [autoScroll, lines]);

    const sendData = async () => {
        const trimmedMessage = message.trim();
        if (!trimmedMessage) return;

        if (sendTarget === 'Serial') {
            const manager = getSerialManager();
            if (!manager.isConnected()) {
                toast.warning('Serial is not connected.');
                return;
            }
            try {
                await manager.send(trimmedMessage);
                setMessage('');
            } catch (error) {
                toast.error(
                    error instanceof Error ? error.message : String(error),
                );
            }
            return;
        }

        const manager = getBluetoothManager();
        if (!manager.isConnected()) {
            toast.warning('Bluetooth is not connected.');
            return;
        }
        try {
            await manager.send(trimmedMessage);
            setMessage('');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    const targetConnected =
        sendTarget === 'Serial' ? serialConnected : bluetoothConnected;

    return (
        <div className="flex h-full min-h-0 flex-col gap-2 p-3 pt-2">
            <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground">
                    Received data
                </div>
                <div className="flex-1" />
            </div>
            <div
                ref={consoleRef}
                className="flex-1 min-h-0 overflow-auto rounded-lg border bg-black p-3 font-mono text-xs text-muted-foreground"
            >
                {lines.length > 0 ? (
                    lines.map((line, index) => (
                        <div key={`${index}-${line}`}>{line}</div>
                    ))
                ) : (
                    <div>Waiting for data...</div>
                )}
            </div>
            <div className="flex items-center gap-2">
                <Button
                    variant={autoScroll ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAutoScroll((current) => !current)}
                    title="Auto-scroll"
                >
                    Auto-scroll
                </Button>
                <Select
                    value={sendTarget}
                    onValueChange={(value) =>
                        setSendTarget(value as SendTarget)
                    }
                >
                    <SelectTrigger className="w-28">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Serial">Serial</SelectItem>
                        <SelectItem value="Bluetooth">Bluetooth</SelectItem>
                    </SelectContent>
                </Select>
                <Input
                    placeholder="Type a message..."
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void sendData();
                        }
                    }}
                    disabled={!targetConnected}
                    className="flex-1"
                />
                <Button
                    onClick={() => void sendData()}
                    disabled={!targetConnected || !message.trim()}
                >
                    <PaperPlaneRightIcon />
                </Button>
            </div>
        </div>
    );
}
