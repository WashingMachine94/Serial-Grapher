import { SerialManager, type SerialCallbacks } from '@/utils/serial';

let serialManager: SerialManager | null = null;

export function initializeSerialManager(callbacks?: SerialCallbacks): SerialManager {
    if (!serialManager) {
        serialManager = new SerialManager(callbacks);
    } else if (callbacks) {
        serialManager.registerCallbacks(callbacks);
    }

    return serialManager;
}

export function getSerialManager(): SerialManager {
    if (!serialManager) {
        serialManager = new SerialManager();
    }

    return serialManager;
}
