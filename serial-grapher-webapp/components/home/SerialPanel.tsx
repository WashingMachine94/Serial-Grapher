'use client';

import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from '@/components/ui/combobox';
import {
    Popover,
    PopoverContent,
    PopoverDescription,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '../ui/button';
import { useState, useEffect, useRef } from 'react';
import { GearIcon, PaperPlaneRightIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import {
    SerialManager,
    SerialOptions,
    ParityType,
    FlowControlType,
} from '@/utils/serial';
import { getSerialManager } from '@/utils/state';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 921600];

const DEFAULT_OPTIONS: SerialOptions = {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    flowControl: 'none',
    bufferSize: 18,
};
const MAX_DISPLAY_LINES = 9;

export default function SerialPanel() {
    const [lines, setLines] = useState<string[]>(() =>
        getSerialManager().getLines().slice(-MAX_DISPLAY_LINES),
    );
    const [connected, setConnected] = useState(() =>
        getSerialManager().isConnected(),
    );
    const [inputText, setInputText] = useState('');

    const [baudRate, setBaudRate] = useState(DEFAULT_OPTIONS.baudRate!);
    const [dataBits, setDataBits] = useState(DEFAULT_OPTIONS.dataBits!);
    const [stopBits, setStopBits] = useState(DEFAULT_OPTIONS.stopBits!);
    const [parity, setParity] = useState<ParityType>(DEFAULT_OPTIONS.parity!);
    const [flowControl, setFlowControl] = useState<FlowControlType>(
        DEFAULT_OPTIONS.flowControl!,
    );
    const [bufferSize, setBufferSize] = useState(DEFAULT_OPTIONS.bufferSize!);

    const terminalRef = useRef<HTMLDivElement>(null);
    const serialManagerRef = useRef<SerialManager | null>(null);
    const toastIdRef = useRef<string | number | null>(null);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const manager = getSerialManager();
        serialManagerRef.current = manager;

        const unsubscribe = manager.registerCallbacks({
            onData: (newLines) =>
                setLines((currentLines) =>
                    [...currentLines, ...newLines].slice(-MAX_DISPLAY_LINES),
                ),
            onConnect: () => {
                setConnected(true);
                if (toastIdRef.current) {
                    toast.dismiss(toastIdRef.current);
                    toastIdRef.current = null;
                }
                toast.success('Connected to device', {
                    duration: 3000,
                });
            },
            onDisconnect: () => {
                setConnected(false);
                if (toastIdRef.current) {
                    toast.dismiss(toastIdRef.current);
                    toastIdRef.current = null;
                }
                toast.info('Disconnected', {
                    description: 'Serial connection has been closed.',
                    duration: 3000,
                });
            },
            onError: (error) => {
                console.error('Serial error:', error);
                if (toastIdRef.current) {
                    toast.dismiss(toastIdRef.current);
                    toastIdRef.current = null;
                }
                toast.error(error.message || 'An error occurred.', {
                    description:
                        'An error occurred with the serial connection.',
                    duration: 4000,
                });
            },
        });
        unsubscribeRef.current = unsubscribe;

        return () => {
            unsubscribe();
            unsubscribeRef.current = null;
            if (toastIdRef.current) {
                toast.dismiss(toastIdRef.current);
            }
        };
    }, []);

    const connect = async () => {
        const manager = serialManagerRef.current;
        if (!manager) return;

        const options: SerialOptions = {
            baudRate,
            dataBits,
            stopBits,
            parity,
            flowControl,
            bufferSize,
        };

        // Show loading toast and store its ID
        toastIdRef.current = toast.loading('Connecting to device...');

        try {
            await manager.connect(options);
            // Success is handled by onConnect callback
        } catch (error) {
            // Error is handled by onError callback
            // But if the error isn't caught by the callback, handle it here
            if (toastIdRef.current) {
                toast.dismiss(toastIdRef.current);
                toastIdRef.current = null;
            }
            toast.error(
                'Failed to connect. Please check your connection and try again.',
            );
        }
    };

    const disconnect = async () => {
        const manager = serialManagerRef.current;
        if (!manager) return;

        try {
            await manager.disconnect();
            // Disconnect is handled by onDisconnect callback
        } catch (error) {
            // Error handled by onError callback
            console.error('Disconnect error:', error);
        }
    };

    const sendData = async () => {
        const manager = serialManagerRef.current ?? getSerialManager();
        if (!manager || !manager.isConnected()) {
            toast.warning('Not Connected', {
                description: 'Please connect to a serial device first.',
                duration: 3000,
            });
            return;
        }
        if (!inputText.trim()) return;

        try {
            await manager.send(inputText);
            setInputText('');
        } catch (error) {
            // error handled by onError callback
            console.error('Send error:', error);
        }
    };

    const resetSettings = () => {
        setBaudRate(DEFAULT_OPTIONS.baudRate!);
        setDataBits(DEFAULT_OPTIONS.dataBits!);
        setStopBits(DEFAULT_OPTIONS.stopBits!);
        setParity(DEFAULT_OPTIONS.parity!);
        setFlowControl(DEFAULT_OPTIONS.flowControl!);
        setBufferSize(DEFAULT_OPTIONS.bufferSize!);
        (serialManagerRef.current ?? getSerialManager()).setBufferSize(
            DEFAULT_OPTIONS.bufferSize!,
        );
        toast.info('Settings Reset', {
            description: 'Serial settings have been restored to defaults.',
            duration: 3000,
        });
    };

    useEffect(() => {
        if (bufferSize > 0) {
            (serialManagerRef.current ?? getSerialManager()).setBufferSize(
                bufferSize,
            );
        }
    }, [bufferSize]);

    return (
        <div className="flex flex-col gap-3 min-h-0 h-full">
            <div
                ref={terminalRef}
                className="flex-1 min-h-0 overflow-auto bg-black font-mono text-xs border rounded-lg p-3 text-muted-foreground"
            >
                {lines.map((line, index) => (
                    <div key={index}>{line}</div>
                ))}
                {lines.length === 0 && <div>Waiting for data...</div>}
            </div>

            <div className="gap-3 flex flex-row flex-wrap items-center">
                {/* Baud Rate */}
                <Combobox
                    items={BAUD_RATES}
                    value={baudRate}
                    onValueChange={(val) => setBaudRate(val as number)}
                >
                    <ComboboxInput placeholder="Select baudrate" />
                    <ComboboxContent>
                        <ComboboxEmpty>No items found.</ComboboxEmpty>
                        <ComboboxList>
                            {(item) => (
                                <ComboboxItem key={item} value={item}>
                                    {item}
                                </ComboboxItem>
                            )}
                        </ComboboxList>
                    </ComboboxContent>
                </Combobox>

                <Popover>
                    <PopoverTrigger render={<Button variant="outline" />}>
                        <GearIcon />
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                        <PopoverHeader>
                            <PopoverTitle className="flex flex-row items-center">
                                Serial Settings
                                <div className="flex-1" />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={resetSettings}
                                >
                                    Reset
                                </Button>
                            </PopoverTitle>
                            <PopoverDescription>
                                Additional serial communication settings.
                            </PopoverDescription>
                        </PopoverHeader>
                        <FieldGroup className="gap-4">
                            {/* Data Bits */}
                            <Field orientation="horizontal">
                                <FieldLabel className="w-1/2">
                                    Data bits
                                </FieldLabel>
                                <Combobox
                                    items={[5, 6, 7, 8]}
                                    value={dataBits}
                                    onValueChange={(val) =>
                                        setDataBits(val as 7 | 8)
                                    }
                                >
                                    <ComboboxInput placeholder="Select data bits" />
                                    <ComboboxContent>
                                        <ComboboxEmpty>
                                            No options found.
                                        </ComboboxEmpty>
                                        <ComboboxList>
                                            {(item) => (
                                                <ComboboxItem
                                                    key={item}
                                                    value={item}
                                                >
                                                    {item}
                                                </ComboboxItem>
                                            )}
                                        </ComboboxList>
                                    </ComboboxContent>
                                </Combobox>
                            </Field>

                            {/* Stop Bits */}
                            <Field orientation="horizontal">
                                <FieldLabel className="w-1/2">
                                    Stop bits
                                </FieldLabel>
                                <Combobox
                                    items={[1, 1.5, 2]}
                                    value={stopBits}
                                    onValueChange={(val) =>
                                        setStopBits(val as 1 | 2)
                                    }
                                >
                                    <ComboboxInput placeholder="Select stop bits" />
                                    <ComboboxContent>
                                        <ComboboxEmpty>
                                            No options found.
                                        </ComboboxEmpty>
                                        <ComboboxList>
                                            {(item) => (
                                                <ComboboxItem
                                                    key={item}
                                                    value={item}
                                                >
                                                    {item}
                                                </ComboboxItem>
                                            )}
                                        </ComboboxList>
                                    </ComboboxContent>
                                </Combobox>
                            </Field>

                            {/* Parity */}
                            <Field orientation="horizontal">
                                <FieldLabel className="w-1/2">
                                    Parity
                                </FieldLabel>
                                <Combobox
                                    items={['none', 'even', 'odd']}
                                    value={parity}
                                    onValueChange={(val) =>
                                        setParity(val as ParityType)
                                    }
                                >
                                    <ComboboxInput placeholder="Select parity" />
                                    <ComboboxContent>
                                        <ComboboxEmpty>
                                            No options found.
                                        </ComboboxEmpty>
                                        <ComboboxList>
                                            {(item) => (
                                                <ComboboxItem
                                                    key={item}
                                                    value={item}
                                                >
                                                    {item
                                                        .charAt(0)
                                                        .toUpperCase() +
                                                        item.slice(1)}
                                                </ComboboxItem>
                                            )}
                                        </ComboboxList>
                                    </ComboboxContent>
                                </Combobox>
                            </Field>

                            {/* Flow Control */}
                            <Field orientation="horizontal">
                                <FieldLabel className="w-1/2">
                                    Flow control
                                </FieldLabel>
                                <Combobox
                                    items={['none', 'hardware']}
                                    value={flowControl}
                                    onValueChange={(val) =>
                                        setFlowControl(val as FlowControlType)
                                    }
                                >
                                    <ComboboxInput placeholder="Select flow control" />
                                    <ComboboxContent>
                                        <ComboboxEmpty>
                                            No options found.
                                        </ComboboxEmpty>
                                        <ComboboxList>
                                            {(item) => (
                                                <ComboboxItem
                                                    key={item}
                                                    value={item}
                                                >
                                                    {item
                                                        .charAt(0)
                                                        .toUpperCase() +
                                                        item.slice(1)}
                                                </ComboboxItem>
                                            )}
                                        </ComboboxList>
                                    </ComboboxContent>
                                </Combobox>
                            </Field>
                        </FieldGroup>
                    </PopoverContent>
                </Popover>

                {connected ? (
                    <Button variant="destructive" onClick={disconnect}>
                        Disconnect
                    </Button>
                ) : (
                    <Button onClick={connect}>Connect</Button>
                )}
            </div>

            <div className="flex flex-row gap-3">
                <Input
                    placeholder="Type a message..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            sendData();
                        }
                    }}
                    disabled={!connected}
                    className="flex-1"
                />
                <Button
                    onClick={sendData}
                    disabled={!connected || !inputText.trim()}
                >
                    <PaperPlaneRightIcon />
                </Button>
            </div>
        </div>
    );
}
