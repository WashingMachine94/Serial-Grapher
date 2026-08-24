import Dashboard from '@/components/home/Dashboard';
import SerialPanel from '@/components/home/SerialPanel';
import BluetoothPanel from '@/components/home/BluetoothPanel';
import FileUploadPanel from '@/components/home/FileUploadPanel';
import TranslationPanel from '@/components/home/TranslationPanel';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Home() {
    return (
        <div className="h-full w-full flex flex-col flex-1">
            <ResizablePanelGroup orientation="horizontal" className="flex-1">
                <ResizablePanel className="h-full" defaultSize="33%">
                    <ResizablePanelGroup
                        orientation="vertical"
                        className="h-full"
                    >
                        <ResizablePanel
                            defaultSize="0%"
                            minSize={200}
                            className="h-full min-h-0"
                        >
                            <div className="h-full min-h-0 overflow-hidden p-3 pt-0">
                                <Tabs
                                    defaultValue="serial"
                                    className="h-full min-h-0 flex flex-col"
                                >
                                    <TabsList variant="line">
                                        <TabsTrigger id="serial" value="serial">
                                            Serial
                                        </TabsTrigger>
                                        <TabsTrigger id="ble" value="ble">
                                            Bluetooth
                                        </TabsTrigger>
                                        <TabsTrigger id="file" value="file">
                                            File Upload
                                        </TabsTrigger>
                                    </TabsList>
                                    <TabsContent
                                        value="serial"
                                        className="flex h-full min-h-0 flex-col overflow-hidden"
                                    >
                                        <SerialPanel />
                                    </TabsContent>
                                    <TabsContent
                                        value="ble"
                                        className="flex h-full min-h-0 flex-col overflow-hidden"
                                    >
                                        <BluetoothPanel />
                                    </TabsContent>
                                    <TabsContent
                                        value="file"
                                        className="flex h-full min-h-0 flex-col overflow-hidden"
                                    >
                                        <FileUploadPanel />
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </ResizablePanel>
                        <ResizableHandle />
                        <ResizablePanel>
                            <TranslationPanel />
                        </ResizablePanel>
                    </ResizablePanelGroup>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel>
                    <Dashboard />
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
