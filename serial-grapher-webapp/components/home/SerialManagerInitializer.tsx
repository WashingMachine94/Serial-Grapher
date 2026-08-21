'use client';

import { useEffect } from 'react';
import { getSerialManager } from '@/utils/state';

export default function SerialManagerInitializer() {
    useEffect(() => {
        getSerialManager();
    }, []);

    return null;
}
