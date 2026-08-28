import Dashboard from '@/components/home/Dashboard';
import SerialPanel from '@/components/home/SerialPanel';
import BluetoothPanel from '@/components/home/BluetoothPanel';
import FileUploadPanel from '@/components/home/FileUploadPanel';
import TranslationPanel from '@/components/home/TranslationPanel';
import InputConsolePanel from '@/components/home/InputConsolePanel';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable';
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
                        <div className="flex flex-wrap border border-r-0">
                            <div className="min-w-42.5 max-w-42.5 flex  flex-1 flex-col border-r p-3 ">
                                <div className="min-h-0 flex-1 overflow-hidden">
                                    <SerialPanel />
                                </div>
                            </div>

                            <div className="min-w-32.5 flex flex-1 flex-col p-3">
                                <div className="min-h-0 flex-1 overflow-hidden">
                                    <BluetoothPanel />
                                </div>
                            </div>
                        </div>

                        <div className="min-w-32.5 flex p-3 flex-col border-t-0 border">
                            <div className="min-h-0 flex-1 overflow-hidden">
                                <FileUploadPanel />
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-hidden p-3 ">
                            <TranslationPanel />
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
