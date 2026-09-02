import Dashboard from '@/components/home/Dashboard';
import SerialPanel from '@/components/home/SerialPanel';
import BluetoothPanel from '@/components/home/BluetoothPanel';
import FileUploadPanel from '@/components/home/FileUploadPanel';
import TranslationPanel from '@/components/home/TranslationPanel';
import GraphPanel from '@/components/home/GraphPanel';
import InputConsolePanel from '@/components/home/InputConsolePanel';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { APP_LAYOUT } from '@/config';

export default function Home() {
    return (
        <div className="h-full w-full flex flex-col flex-1">
            <ResizablePanelGroup orientation="horizontal" className="flex-1">
                <ResizablePanel
                    className="h-full"
                    defaultSize={APP_LAYOUT.LEFT_PANEL_DEFAULT_SIZE}
                    minSize={APP_LAYOUT.LEFT_PANEL_MIN_SIZE}
                >
                    <div className="flex h-full min-h-0 flex-col ">
                        <div className="flex flex-wrap border-b">
                            <div className="min-w-42.5 max-w-42.5 flex  flex-1 flex-col border-r p-3 ">
                                <div className="min-h-0 flex-1 overflow-hidden">
                                    <SerialPanel />
                                </div>
                            </div>

                            <div className="min-w-32.5 flex flex-1 flex-col p-3">
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

                        <div className="min-h-0 flex-1 overflow-hidden mt-1">
                            <Tabs defaultValue="parsers" className="h-full">
                                <TabsList
                                    variant="line"
                                    className="mb-3 w-full justify-start"
                                >
                                    <TabsTrigger value="parsers">
                                        Parsers
                                    </TabsTrigger>
                                    <TabsTrigger value="graphs">
                                        Graphs
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent
                                    value="parsers"
                                    keepMounted
                                    className="h-[calc(100%-3rem)] p-3 pt-0"
                                >
                                    <TranslationPanel />
                                </TabsContent>

                                <TabsContent
                                    value="graphs"
                                    keepMounted
                                    className="h-[calc(100%-3rem)] p-3 pt-0"
                                >
                                    <GraphPanel />
                                </TabsContent>
                            </Tabs>
                        </div>
                    </div>
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel>
                    <ResizablePanelGroup
                        orientation="vertical"
                        className="h-full"
                    >
                        <ResizablePanel
                            defaultSize={
                                APP_LAYOUT.RIGHT_PANEL_TOP_DEFAULT_SIZE
                            }
                            minSize={APP_LAYOUT.RIGHT_PANEL_TOP_MIN_SIZE}
                        >
                            <Dashboard />
                        </ResizablePanel>
                        <ResizableHandle />
                        <ResizablePanel
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
