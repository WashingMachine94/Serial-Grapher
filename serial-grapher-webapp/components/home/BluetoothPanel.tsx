'use client';

import { useEffect, useRef, useState } from 'react';
import { BluetoothManager, getBluetoothManager } from '@/utils/bluetooth';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { BluetoothIcon } from '@phosphor-icons/react';

export default function BluetoothPanel() {
    const [connected, setConnected] = useState(() =>
        getBluetoothManager().isConnected(),
    );
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

    return (
        <div className="flex flex-col gap-3 min-h-0 h-full">
            <div className="flex flex-row flex-wrap items-center gap-3">
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
