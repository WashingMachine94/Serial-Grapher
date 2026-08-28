'use client';

import { useEffect, useRef, useState } from 'react';
import { BluetoothManager, getBluetoothManager } from '@/utils/bluetooth';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import {
    BluetoothIcon,
    GearIcon,
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

export default function BluetoothPanel() {
    const [connected, setConnected] = useState(() =>
        getBluetoothManager().isConnected(),
    );
    const [optionalServices, setOptionalServices] = useState<string[]>(() =>
        getBluetoothManager().getOptionalServices(),
    );
    const [newService, setNewService] = useState('');
    const managerRef = useRef<BluetoothManager | null>(null);

    // Bluetooth state tracking
    useEffect(() => {
        const manager = getBluetoothManager();
        managerRef.current = manager;
        return manager.registerCallbacks({
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
            // Reported through callback.
        }
    };

    const disconnect = async () => {
        await (managerRef.current ?? getBluetoothManager()).disconnect();
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
                    <BluetoothIcon size={18} />
                    {connected ? 'Disconnect' : 'Connect BLE'}
                </Button>
            </div>
        </div>
    );
}
