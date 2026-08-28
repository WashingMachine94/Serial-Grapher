'use client';

import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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
import { GearIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import {
    SerialManager,
    SerialOptions,
    ParityType,
    FlowControlType,
} from '@/utils/serial';
import { getSerialManager } from '@/utils/state';
import { SERIAL_SETTINGS } from '@/config';

const TOAST_DURATION_SHORT_MS = 3000;
const TOAST_DURATION_ERROR_MS = 4000;
const BAUD_RATES = SERIAL_SETTINGS.BAUD_RATES;

const DEFAULT_OPTIONS: SerialOptions = {
    baudRate: SERIAL_SETTINGS.DEFAULT_BAUD_RATE,
    dataBits: SERIAL_SETTINGS.DEFAULT_DATA_BITS,
    stopBits: SERIAL_SETTINGS.DEFAULT_STOP_BITS,
    parity: SERIAL_SETTINGS.DEFAULT_PARITY,
    flowControl: SERIAL_SETTINGS.DEFAULT_FLOW_CONTROL,
};

export default function SerialPanel() {
    const [connected, setConnected] = useState(() =>
        getSerialManager().isConnected(),
    );

    const [baudRate, setBaudRate] = useState(DEFAULT_OPTIONS.baudRate!);
    const [dataBits, setDataBits] = useState(DEFAULT_OPTIONS.dataBits!);
    const [stopBits, setStopBits] = useState(DEFAULT_OPTIONS.stopBits!);
    const [parity, setParity] = useState<ParityType>(DEFAULT_OPTIONS.parity!);
    const [flowControl, setFlowControl] = useState<FlowControlType>(
        DEFAULT_OPTIONS.flowControl!,
    );

    const serialManagerRef = useRef<SerialManager | null>(null);
    const toastIdRef = useRef<string | number | null>(null);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const manager = getSerialManager();
        serialManagerRef.current = manager;

        const unsubscribe = manager.registerCallbacks({
            onConnect: () => {
                setConnected(true);
                if (toastIdRef.current) {
                    toast.dismiss(toastIdRef.current);
                    toastIdRef.current = null;
                }
                toast.success('Connected to device', {
                    duration: TOAST_DURATION_SHORT_MS,
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
                    duration: TOAST_DURATION_SHORT_MS,
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
                    duration: TOAST_DURATION_ERROR_MS,
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
        };

        // Show loading toast and store its ID
        toastIdRef.current = toast.loading('Connecting to device...');

        try {
            await manager.connect(options);
            // Success is handled by onConnect callback
        } catch {
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

    const resetSettings = () => {
        setBaudRate(DEFAULT_OPTIONS.baudRate!);
        setDataBits(DEFAULT_OPTIONS.dataBits!);
        setStopBits(DEFAULT_OPTIONS.stopBits!);
        setParity(DEFAULT_OPTIONS.parity!);
        setFlowControl(DEFAULT_OPTIONS.flowControl!);
        toast.info('Settings Reset', {
            description: 'Serial settings have been restored to defaults.',
            duration: TOAST_DURATION_SHORT_MS,
        });
    };

    return (
        <div className="flex flex-col gap-3 min-h-0 h-full">
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
                    <Button onClick={connect}>Connect serial</Button>
                )}
            </div>
        </div>
    );
}
