export interface BluetoothServiceInfo {
    uuid: string;
    characteristics: Array<{ uuid: string; properties: string[] }>;
}

export interface BluetoothCallbacks {
    onData?: (lines: string[]) => void;
    onError?: (error: Error) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onServices?: (services: BluetoothServiceInfo[]) => void;
}

interface BluetoothCharacteristicEvent extends Event {
    target: EventTarget & { value?: DataView };
    currentTarget: EventTarget & { value?: DataView };
}

interface BluetoothCharacteristicLike extends EventTarget {
    uuid: string;
    properties: {
        notify?: boolean;
        indicate?: boolean;
        write?: boolean;
        writeWithoutResponse?: boolean;
    };
    startNotifications(): Promise<BluetoothCharacteristicLike>;
    stopNotifications(): Promise<BluetoothCharacteristicLike>;
    writeValueWithResponse?(value: BufferSource): Promise<void>;
    writeValueWithoutResponse?(value: BufferSource): Promise<void>;
    writeValue?(value: BufferSource): Promise<void>;
}

interface BluetoothServiceLike {
    uuid: string;
    getCharacteristics(): Promise<BluetoothCharacteristicLike[]>;
}

interface BluetoothServerLike {
    getPrimaryServices(): Promise<BluetoothServiceLike[]>;
}

interface BluetoothDeviceLike extends EventTarget {
    name?: string;
    gatt?: {
        connected: boolean;
        connect(): Promise<BluetoothServerLike>;
        disconnect(): void;
    };
}

interface BluetoothLike {
    requestDevice(options: {
        acceptAllDevices: true;
        optionalServices: string[];
    }): Promise<BluetoothDeviceLike>;
}

const DISCOVERY_SERVICES = [
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000ffe1-0000-1000-8000-00805f9b34fb',
];
const DISCOVERED_SERVICES_KEY = 'serial-grapher.bluetooth.services';

function getAuthorizedServices(): string[] {
    try {
        const stored = JSON.parse(
            localStorage.getItem(DISCOVERED_SERVICES_KEY) ?? '[]',
        );
        return Array.isArray(stored)
            ? stored.filter(
                  (service): service is string => typeof service === 'string',
              )
            : [];
    } catch {
        return [];
    }
}

function rememberServices(services: BluetoothServiceInfo[]): void {
    const serviceUuids = [
        ...new Set([
            ...DISCOVERY_SERVICES,
            ...getAuthorizedServices(),
            ...services.map((service) => service.uuid),
        ]),
    ];
    localStorage.setItem(DISCOVERED_SERVICES_KEY, JSON.stringify(serviceUuids));
}

function readServices(): string[] {
    return [...new Set([...DISCOVERY_SERVICES, ...getAuthorizedServices()])];
}

export class BluetoothManager {
    private device: BluetoothDeviceLike | null = null;
    private rxCharacteristics: BluetoothCharacteristicLike[] = [];
    private txCharacteristic: BluetoothCharacteristicLike | null = null;
    private connected = false;
    private deviceName = '';
    private services: BluetoothServiceInfo[] = [];
    private optionalServices: string[] = readServices();
    private lines: string[] = [];
    private decoder = new TextDecoder();
    private callbacks: BluetoothCallbacks[] = [];

    constructor(callbacks: BluetoothCallbacks = {}) {
        this.registerCallbacks(callbacks);
    }

    registerCallbacks(callbacks: BluetoothCallbacks = {}): () => void {
        this.callbacks.push(callbacks);
        return () => {
            this.callbacks = this.callbacks.filter(
                (entry) => entry !== callbacks,
            );
        };
    }

    async connect(): Promise<void> {
        if (this.connected) throw new Error('Already connected');

        const bluetooth = (
            navigator as Navigator & { bluetooth?: BluetoothLike }
        ).bluetooth;
        if (!bluetooth) {
            throw new Error('Web Bluetooth is not supported in this browser.');
        }

        try {
            const device = await bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: this.optionalServices,
            });
            this.device = device;
            if (!device.gatt) {
                throw new Error('The selected device has no GATT server.');
            }

            const server = await device.gatt.connect();
            const discoveredServices = await server.getPrimaryServices();
            const discovered = await Promise.all(
                discoveredServices.map(async (service) => {
                    const characteristics = await service.getCharacteristics();
                    return {
                        characteristics,
                        info: {
                            uuid: service.uuid,
                            characteristics: characteristics.map(
                                (characteristic) => ({
                                    uuid: characteristic.uuid,
                                    properties:
                                        this.getProperties(characteristic),
                                }),
                            ),
                        },
                    };
                }),
            );

            const notifyCharacteristics = discovered
                .flatMap((entry) => entry.characteristics)
                .filter(
                    (characteristic) =>
                        characteristic.properties.notify ||
                        characteristic.properties.indicate,
                );
            const tx = discovered
                .flatMap((entry) => entry.characteristics)
                .find(
                    (characteristic) =>
                        characteristic.properties.write ||
                        characteristic.properties.writeWithoutResponse,
                );

            if (notifyCharacteristics.length === 0 || !tx) {
                throw new Error(
                    'The selected device has no compatible notify and writable characteristics.',
                );
            }

            this.rxCharacteristics = [];
            this.txCharacteristic = tx;
            this.services = discovered.map((entry) => entry.info);
            rememberServices(this.services);
            this.optionalServices = readServices();
            this.deviceName = device.name || 'Bluetooth device';
            this.callbacks.forEach((callback) =>
                callback.onServices?.(this.services),
            );

            for (const characteristic of notifyCharacteristics) {
                characteristic.addEventListener(
                    'characteristicvaluechanged',
                    this.handleCharacteristicValue,
                );
                try {
                    await characteristic.startNotifications();
                    this.rxCharacteristics.push(characteristic);
                } catch {
                    characteristic.removeEventListener(
                        'characteristicvaluechanged',
                        this.handleCharacteristicValue,
                    );
                }
            }

            if (this.rxCharacteristics.length === 0) {
                throw new Error(
                    'The selected device could not start notifications on any characteristic.',
                );
            }
            device.addEventListener(
                'gattserverdisconnected',
                this.handleDisconnect,
            );
            this.connected = true;
            this.emitConnect();
        } catch (error) {
            await this.cleanup();
            const err =
                error instanceof Error ? error : new Error(String(error));
            this.emitError(err);
            throw err;
        }
    }

    async disconnect(): Promise<void> {
        if (!this.connected && !this.device) return;
        await this.cleanup();
        this.emitDisconnect();
    }

    async send(data: string): Promise<void> {
        if (!this.connected || !this.txCharacteristic) {
            throw new Error('Not connected');
        }
        if (!data.trim()) return;

        const encoded = new TextEncoder().encode(data + '\n');
        if (this.txCharacteristic.writeValueWithResponse) {
            await this.txCharacteristic.writeValueWithResponse(encoded);
        } else if (this.txCharacteristic.writeValueWithoutResponse) {
            await this.txCharacteristic.writeValueWithoutResponse(encoded);
        } else if (this.txCharacteristic.writeValue) {
            await this.txCharacteristic.writeValue(encoded);
        } else {
            throw new Error('The selected characteristic cannot send data.');
        }
    }

    getLines(): string[] {
        return [...this.lines];
    }

    isConnected(): boolean {
        return this.connected;
    }

    getDeviceName(): string {
        return this.deviceName;
    }

    getServices(): BluetoothServiceInfo[] {
        return this.services.map((service) => ({
            ...service,
            characteristics: service.characteristics.map((characteristic) => ({
                ...characteristic,
                properties: [...characteristic.properties],
            })),
        }));
    }

    getOptionalServices(): string[] {
        return [...this.optionalServices];
    }

    setOptionalServices(services: string[]): void {
        this.optionalServices = [
            ...new Set(
                services.map((service) => service.trim()).filter(Boolean),
            ),
        ];
        localStorage.setItem(
            DISCOVERED_SERVICES_KEY,
            JSON.stringify(this.optionalServices),
        );
    }

    clearBuffer(): void {
        this.lines = [];
        this.decoder = new TextDecoder();
        this.emitData([]);
    }

    private getProperties(
        characteristic: BluetoothCharacteristicLike,
    ): string[] {
        return Object.entries(characteristic.properties)
            .filter(([, supported]) => supported)
            .map(([property]) => property);
    }

    private handleCharacteristicValue = (event: Event): void => {
        const characteristicEvent = event as BluetoothCharacteristicEvent;
        const value =
            characteristicEvent.target?.value ??
            characteristicEvent.currentTarget?.value;
        if (!value) return;
        const bytes = new Uint8Array(
            value.buffer,
            value.byteOffset,
            value.byteLength,
        );
        this.handleData(this.decoder.decode(bytes, { stream: true }));
    };

    private handleDisconnect = (): void => {
        if (!this.connected) return;
        void this.cleanup();
        this.emitDisconnect();
    };

    private handleData(data: string): void {
        if (!data) return;

        const packetEntries = data
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n');

        // A terminator closes the final entry; it does not create an extra line.
        if (packetEntries.at(-1) === '') packetEntries.pop();
        if (packetEntries.length === 0) return;

        this.lines.push(...packetEntries);
        if (this.lines.length > 1000) this.lines = this.lines.slice(-1000);
        this.emitData(packetEntries);
    }

    private async cleanup(): Promise<void> {
        for (const characteristic of this.rxCharacteristics) {
            characteristic.removeEventListener(
                'characteristicvaluechanged',
                this.handleCharacteristicValue,
            );
            try {
                await characteristic.stopNotifications();
            } catch {
                // The device may already be disconnected.
            }
        }
        if (this.device) {
            this.device.removeEventListener(
                'gattserverdisconnected',
                this.handleDisconnect,
            );
            if (this.device.gatt?.connected) this.device.gatt.disconnect();
        }
        this.rxCharacteristics = [];
        this.txCharacteristic = null;
        this.device = null;
        this.connected = false;
        this.deviceName = '';
        this.services = [];
        this.decoder = new TextDecoder();
        this.decoder = new TextDecoder();
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

let bluetoothManager: BluetoothManager | null = null;

export function getBluetoothManager(): BluetoothManager {
    if (!bluetoothManager) bluetoothManager = new BluetoothManager();
    return bluetoothManager;
}
