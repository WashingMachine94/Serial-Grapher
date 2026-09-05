'use client';

import { ChangeEvent, useRef, useSyncExternalStore } from 'react';
import Dashboard from '@/components/home/Dashboard';
import SerialPanel from '@/components/home/SerialPanel';
import BluetoothPanel from '@/components/home/BluetoothPanel';
import FileUploadPanel from '@/components/home/FileUploadPanel';
import TranslationPanel from '@/components/home/TranslationPanel';
import GraphPanel from '@/components/home/GraphPanel';
import InputConsolePanel from '@/components/home/InputConsolePanel';
import { Button } from '@/components/ui/button';
import { PauseIcon, PlayIcon } from '@phosphor-icons/react';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { APP_LAYOUT } from '@/config';
import { dataBufferManager } from '@/utils/dataBufferManager';
import { graphManager } from '@/utils/graphManager';
import { buildConfigSnapshot, parseConfigSnapshot } from '@/utils/appConfig';
import { toast } from 'sonner';

export default function Home() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const subscribed = useSyncExternalStore(
        (onStoreChange) =>
            dataBufferManager.subscribeSubscriptionChanged(onStoreChange),
        () => dataBufferManager.isSubscribed(),
        () => false,
    );

    const saveConfig = () => {
        try {
            const snapshot = buildConfigSnapshot();
            const fileContents = JSON.stringify(snapshot, null, 2);
            const blob = new Blob([fileContents], {
                type: 'application/json;charset=utf-8',
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `serial-grapher-config-${new Date().toISOString().replaceAll(':', '-')}.json`;
            link.rel = 'noopener';
            link.style.display = 'none';

            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);

            toast.success('Configuration saved.');
        } catch {
            toast.error('Failed to save configuration.');
        }
    };

    const loadConfigFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) return;

        try {
            const raw = await selectedFile.text();
            const parsed = JSON.parse(raw);
            const snapshot = parseConfigSnapshot(parsed);

            dataBufferManager.setParsers(snapshot.parsers);
            graphManager.setGraphs(snapshot.graphs);

            toast.success(
                'Configuration loaded. Parsers and graphs were replaced.',
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Failed to load configuration.';
            toast.error(message);
        } finally {
            event.target.value = '';
        }
    };

    return (
        <div className="h-full w-full min-h-0 flex flex-1 flex-col overflow-hidden">
            <div className="border-b px-4 py-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold tracking-wide">
                        Serial Grapher
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={loadConfigFile}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            Load Config
                        </Button>
                        <Button size="sm" onClick={saveConfig}>
                            Save Config
                        </Button>
                    </div>
                </div>
            </div>
            <ResizablePanelGroup
                orientation="horizontal"
                className="flex-1 min-h-0"
            >
                <ResizablePanel
                    className="h-full min-h-0 overflow-hidden"
                    defaultSize={APP_LAYOUT.LEFT_PANEL_DEFAULT_SIZE}
                    minSize={APP_LAYOUT.LEFT_PANEL_MIN_SIZE}
                >
                    <div className="flex h-full min-h-0 flex-col overflow-hidden">
                        <div className="flex flex-wrap border-b">
                            <div className="min-w-42.5 max-w-42.5 flex  flex-1 flex-col border-r p-3 ">
                                <div className="min-h-0 flex-1 overflow-hidden">
                                    <SerialPanel />
                                </div>
                            </div>

                            <div className="min-w-31 flex flex-1 flex-col p-3">
                                <div className="min-h-0 flex-1 overflow-hidden mt-10">
                                    <BluetoothPanel />
                                </div>
                            </div>
                        </div>

                        <div className="min-w-32.5 flex p-3 flex-col border-b">
                            <div className="min-h-0 flex-1 overflow-hidden">
                                <FileUploadPanel />
                            </div>
                        </div>

                        <div className="min-h-0 mt-1 flex-1 flex flex-col overflow-hidden">
                            <Tabs
                                defaultValue="parsers"
                                className="flex-1 min-h-0 overflow-hidden"
                            >
                                <TabsList
                                    variant="line"
                                    className="mb-3 w-full shrink-0 justify-start"
                                >
                                    <TabsTrigger value="parsers">
                                        Parsers
                                    </TabsTrigger>
                                    <TabsTrigger value="graphs">
                                        Graphs
                                    </TabsTrigger>
                                </TabsList>

                                <div className="relative min-h-0 flex-1 overflow-hidden">
                                    <TabsContent
                                        value="parsers"
                                        keepMounted
                                        className="absolute inset-0 min-h-0 overflow-hidden p-0"
                                    >
                                        <div className="h-full min-h-0 overflow-auto p-3 pt-0">
                                            <TranslationPanel />
                                        </div>
                                    </TabsContent>

                                    <TabsContent
                                        value="graphs"
                                        keepMounted
                                        className="absolute inset-0 min-h-0 overflow-hidden p-0"
                                    >
                                        <div className="h-full min-h-0 overflow-auto p-3 pt-0">
                                            <GraphPanel />
                                        </div>
                                    </TabsContent>
                                </div>
                            </Tabs>
                            <div className="flex items-center justify-end gap-2 border-t p-3 pt-2">
                                <Button
                                    variant={
                                        subscribed ? 'destructive' : 'default'
                                    }
                                    size="sm"
                                    onClick={() =>
                                        dataBufferManager.setSubscribed(
                                            !subscribed,
                                        )
                                    }
                                >
                                    {subscribed ? (
                                        <PauseIcon size={16} className="mr-1" />
                                    ) : (
                                        <PlayIcon size={16} className="mr-1" />
                                    )}
                                    {subscribed ? 'Stop' : 'Subscribe'}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        dataBufferManager.clearBuffers()
                                    }
                                    disabled={subscribed}
                                >
                                    Clear
                                </Button>
                            </div>
                        </div>
                    </div>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel className="min-h-0 overflow-hidden">
                    <ResizablePanelGroup
                        orientation="vertical"
                        className="h-full min-h-0 overflow-hidden"
                    >
                        <ResizablePanel
                            className="min-h-0 overflow-hidden"
                            defaultSize={
                                APP_LAYOUT.RIGHT_PANEL_TOP_DEFAULT_SIZE
                            }
                            minSize={APP_LAYOUT.RIGHT_PANEL_TOP_MIN_SIZE}
                        >
                            <Dashboard />
                        </ResizablePanel>
                        <ResizableHandle />
                        <ResizablePanel
                            className="min-h-0 overflow-hidden"
                            defaultSize={
                                APP_LAYOUT.RIGHT_PANEL_BOTTOM_DEFAULT_SIZE
                            }
                            minSize={APP_LAYOUT.RIGHT_PANEL_BOTTOM_MIN_SIZE}
                        >
                            <InputConsolePanel />
                        </ResizablePanel>
                    </ResizablePanelGroup>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
