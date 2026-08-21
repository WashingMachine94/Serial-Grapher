'use client';

import { useEffect, useRef, useState } from 'react';
import { BluetoothManager, getBluetoothManager } from '@/utils/bluetooth';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import {
    GearIcon,
    PaperPlaneRightIcon,
    PlusIcon,
    TrashIcon,
} from '@phosphor-icons/react';
import {
    Popover,
    PopoverContent,
    PopoverDescription,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from '../ui/popover';

const MAX_DISPLAY_LINES = 50;

export default function BluetoothPanel() {
    const [lines, setLines] = useState<string[]>(() =>
        getBluetoothManager().getLines().slice(-MAX_DISPLAY_LINES),
    );
    const [connected, setConnected] = useState(() =>
        getBluetoothManager().isConnected(),
    );
    const [optionalServices, setOptionalServices] = useState<string[]>(() =>
        getBluetoothManager().getOptionalServices(),
    );
    const [newService, setNewService] = useState('');
    const [inputText, setInputText] = useState('');
    const managerRef = useRef<BluetoothManager | null>(null);

    useEffect(() => {
        const manager = getBluetoothManager();
        managerRef.current = manager;
        return manager.registerCallbacks({
            onData: (newLines) =>
                setLines((currentLines) =>
                    [...currentLines, ...newLines].slice(-MAX_DISPLAY_LINES),
                ),
            onConnect: () => {
                setConnected(true);
                const servicesDescription = manager
                    .getServices()
                    .map(
                        (service) =>
                            `${service.uuid}: ${service.characteristics
                                .map(
                                    (characteristic) =>
                                        `${characteristic.uuid} (${characteristic.properties.join(', ')})`,
                                )
                                .join(', ')}`,
                    )
                    .join('\n');
                toast.success(`Connected to ${manager.getDeviceName()}`, {
                    description: servicesDescription || 'No services found.',
                    duration: 8000,
                });
            },
            onDisconnect: () => {
                setConnected(false);
                toast.info('Bluetooth disconnected');
            },
            onError: (error) => toast.error(error.message),
        });
    }, []);

    const connect = async () => {
        try {
            await (managerRef.current ?? getBluetoothManager()).connect();
        } catch {
            // The manager reports the detailed error through its callback.
        }
    };

    const disconnect = async () => {
        await (managerRef.current ?? getBluetoothManager()).disconnect();
    };

    const sendData = async () => {
        if (!inputText.trim()) return;
        try {
            await (managerRef.current ?? getBluetoothManager()).send(inputText);
            setInputText('');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    const addService = () => {
        const service = newService.trim();
        if (!service || optionalServices.includes(service)) return;

        const nextServices = [...optionalServices, service];
        setOptionalServices(nextServices);
        (managerRef.current ?? getBluetoothManager()).setOptionalServices(
            nextServices,
        );
        setNewService('');
    };

    const removeService = (service: string) => {
        const nextServices = optionalServices.filter(
            (entry) => entry !== service,
        );
        setOptionalServices(nextServices);
        (managerRef.current ?? getBluetoothManager()).setOptionalServices(
            nextServices,
        );
    };

    return (
        <div className="flex flex-col gap-3 min-h-0 h-full">
            <div className="flex-1 min-h-0 overflow-auto bg-black font-mono text-xs border rounded-lg p-3 text-muted-foreground">
                {lines.map((line, index) => (
                    <div key={index}>{line}</div>
                ))}
                {lines.length === 0 && <div>Waiting for data...</div>}
            </div>

            <div className="flex flex-row flex-wrap items-center gap-3">
                <Popover>
                    <PopoverTrigger render={<Button variant="outline" />}>
                        <GearIcon />
                    </PopoverTrigger>
                    <PopoverContent className="w-96">
                        <PopoverHeader>
                            <PopoverTitle>Bluetooth Services</PopoverTitle>
                            <PopoverDescription>
                                Services listed here are authorized for GATT
                                discovery.
                            </PopoverDescription>
                        </PopoverHeader>
                        <div className="flex gap-2">
                            <Input
                                value={newService}
                                onChange={(event) =>
                                    setNewService(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        addService();
                                    }
                                }}
                                placeholder="Service UUID"
                            />
                            <Button
                                variant="secondary"
                                onClick={addService}
                                disabled={!newService.trim()}
                            >
                                <PlusIcon />
                                Add
                            </Button>
                        </div>
                        <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                            {optionalServices.map((service) => (
                                <div
                                    key={service}
                                    className="flex items-center gap-2 rounded-md border p-2"
                                >
                                    <span className="min-w-0 flex-1 break-all font-mono text-xs">
                                        {service}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeService(service)}
                                        aria-label={`Remove ${service}`}
                                    >
                                        <TrashIcon />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>
                <Button
                    variant={connected ? 'destructive' : 'default'}
                    onClick={() => void (connected ? disconnect() : connect())}
                >
                    {connected ? 'Disconnect' : 'Connect'}
                </Button>
            </div>

            <div className="flex flex-row gap-3">
                <Input
                    placeholder="Type a message..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            void sendData();
                        }
                    }}
                    disabled={!connected}
                    className="flex-1"
                />
                <Button
                    onClick={() => void sendData()}
                    disabled={!connected || !inputText.trim()}
                >
                    <PaperPlaneRightIcon />
                </Button>
            </div>
        </div>
    );
}
