'use client';

import { useEffect, useRef, useState } from 'react';
import { getSerialManager } from '@/utils/state';
import { getBluetoothManager } from '@/utils/bluetooth';
import { getFileUploadManager } from '@/utils/fileUpload';
import { Button } from '../ui/button';
import {
    ArrowsClockwiseIcon,
    PlusIcon,
    TrashIcon,
    PlayIcon,
    PauseIcon,
    WarningIcon,
    PencilSimpleIcon,
    ClockIcon,
} from '@phosphor-icons/react';
import { Input } from '../ui/input';
import { Field, FieldLabel } from '../ui/field';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Popover,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    escapeHtml,
    highlightColors,
    extractMatches,
    highlightMatches,
} from '@/utils/translation';
import { regexPresets } from '@/utils/regexPresets';
import {
    dataBufferManager,
    NodeData,
    ParserData,
    ParserTrigger,
} from '@/utils/dataBufferManager';

const MAX_TRANSLATION_LINES = 250;

export default function TranslationPanel() {
    const [line, setLine] = useState<string | null>(null);
    const [highlightedLine, setHighlightedLine] = useState<string | null>(null);
    const [triggerWarning, setTriggerWarning] = useState(false);
    const [parsers, setParsers] = useState<ParserData[]>(() =>
        dataBufferManager.getParsers(),
    );
    const [selectedPreset, setSelectedPreset] = useState('');
    const [subscribed, setSubscribed] = useState(false);
    const subscribedRef = useRef(false);
    const sourceLinesRef = useRef<string[]>([]);

    const getLatestInputLine = () => {
        const candidates = [
            {
                line: getSerialManager().getLatestLine(),
                timestamp: getSerialManager().getLatestLineTimestamp(),
            },
            {
                line: getBluetoothManager().getLatestLine(),
                timestamp: getBluetoothManager().getLatestLineTimestamp(),
            },
            {
                line: getFileUploadManager().getLatestLine(),
                timestamp: getFileUploadManager().getLatestLineTimestamp(),
            },
        ].filter((item) => item.line != null && item.line.length > 0);

        if (candidates.length === 0) return null;

        return candidates.sort((a, b) => a.timestamp - b.timestamp).at(-1)?.line ?? null;
    };

    useEffect(() => {
        const unsubscribe = dataBufferManager.subscribeNodesChanged(() => {
            const updatedParsers = dataBufferManager.getParsers();
            setParsers(updatedParsers);
        });
        if (dataBufferManager.getParsers().length === 0)
            dataBufferManager.addParser('Parser 1');
        return unsubscribe;
    }, []);

    useEffect(() => {
        subscribedRef.current = subscribed;
    }, [subscribed]);

    useEffect(() => {
        const serialManager = getSerialManager();
        const bluetoothManager = getBluetoothManager();
        const fileUploadManager = getFileUploadManager();
        sourceLinesRef.current = [
            ...serialManager.getLines(),
            ...bluetoothManager.getLines(),
            ...fileUploadManager.getLines(),
        ].slice(-MAX_TRANSLATION_LINES);
        const handleIncomingLines = (newLines: string[]) => {
            if (newLines.length === 0) return;
            sourceLinesRef.current = [
                ...sourceLinesRef.current,
                ...newLines,
            ].slice(-MAX_TRANSLATION_LINES);
            if (subscribedRef.current)
                newLines.forEach((incomingLine) =>
                    dataBufferManager.processLine(incomingLine),
                );
        };
        const unsubscribeSerial = serialManager.registerCallbacks({
            onData: handleIncomingLines,
        });
        const unsubscribeBluetooth = bluetoothManager.registerCallbacks({
            onData: handleIncomingLines,
        });
        const unsubscribeFileUpload = fileUploadManager.registerCallbacks({
            onData: handleIncomingLines,
        });
        return () => {
            unsubscribeSerial();
            unsubscribeBluetooth();
            unsubscribeFileUpload();
        };
    }, []);

    const addParser = () => {
        if (!subscribed)
            dataBufferManager.addParser(`Parser ${parsers.length + 1}`);
    };
    const removeParser = () => {
        if (!subscribed && parsers.length > 1)
            dataBufferManager.removeParser(parsers.at(-1)!.id);
    };
    const removeParserById = (id: string) => {
        dataBufferManager.removeParser(id);
    };
    const removeNode = (id: string) => {
        if (!subscribed) dataBufferManager.removeNode(id);
    };
    const updateNodeName = (id: string, name: string) => {
        if (!subscribed) dataBufferManager.updateNode(id, { name });
    };
    const toggleTimestamp = (id: string) => {
        if (!subscribed) {
            const allNodes = dataBufferManager.getNodes();
            const node = allNodes.find((item) => item.id === id);
            if (node)
                dataBufferManager.updateNode(id, {
                    isTimestamp: !node.isTimestamp,
                });
        }
    };

    return (
        <div className="flex flex-col gap-4 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">Parsers</span>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={addParser}
                        disabled={subscribed}
                    >
                        <PlusIcon size={16} className="mr-1" /> Add Parser
                    </Button>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                {parsers.map((parser, pIndex) => (
                    <div key={parser.id} className="rounded-md border p-2">
                        <div className="flex items-center gap-2">
                            <div className="font-small">{parser.name}</div>
                            <div className="ml-auto flex items-center gap-2">
                                <Popover>
                                    <PopoverTrigger>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={subscribed}
                                            title={`Edit ${parser.name}`}
                                        >
                                            <PencilSimpleIcon size={16} />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-90">
                                        <PopoverHeader>
                                            <PopoverTitle>
                                                Edit parser
                                            </PopoverTitle>
                                        </PopoverHeader>
                                        <Field>
                                            <FieldLabel>Parser name</FieldLabel>
                                            <Input
                                                value={parser.name}
                                                onChange={(e) =>
                                                    !subscribed &&
                                                    dataBufferManager.updateParser(
                                                        parser.id,
                                                        {
                                                            name: e.target
                                                                .value,
                                                        },
                                                    )
                                                }
                                                disabled={subscribed}
                                            />
                                        </Field>
                                        <Field>
                                            <FieldLabel>Trigger</FieldLabel>
                                            <div className="flex gap-2">
                                                <Select
                                                    value={parser.triggerType}
                                                    onValueChange={(value) =>
                                                        !subscribed &&
                                                        dataBufferManager.updateParser(
                                                            parser.id,
                                                            {
                                                                triggerType:
                                                                    value as ParserTrigger,
                                                            },
                                                        )
                                                    }
                                                    disabled={subscribed}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="includes">
                                                            Includes
                                                        </SelectItem>
                                                        <SelectItem value="startsWith">
                                                            Starts with
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Input
                                                    value={parser.triggerValue}
                                                    onChange={(e) =>
                                                        !subscribed &&
                                                        dataBufferManager.updateParser(
                                                            parser.id,
                                                            {
                                                                triggerValue:
                                                                    e.target
                                                                        .value,
                                                            },
                                                        )
                                                    }
                                                    placeholder="Text that activates this parser"
                                                    disabled={subscribed}
                                                />
                                            </div>
                                        </Field>
                                        <div className="flex flex-col gap-3 md:flex-row md:items-end">
                                            <Field className="flex-1">
                                                <FieldLabel>RegEx</FieldLabel>
                                                <Input
                                                    value={parser.regexPattern}
                                                    onChange={(e) =>
                                                        !subscribed &&
                                                        dataBufferManager.updateParser(
                                                            parser.id,
                                                            {
                                                                regexPattern:
                                                                    e.target
                                                                        .value,
                                                            },
                                                        )
                                                    }
                                                    placeholder="Enter regex pattern..."
                                                    disabled={subscribed}
                                                />
                                            </Field>
                                            <Select
                                                value={selectedPreset}
                                                onValueChange={(value) => {
                                                    if (!value) return;
                                                    setSelectedPreset(value);
                                                    const preset =
                                                        regexPresets.find(
                                                            (item) =>
                                                                item.label ===
                                                                value,
                                                        );
                                                    if (preset && !subscribed)
                                                        dataBufferManager.updateParser(
                                                            parser.id,
                                                            {
                                                                regexPattern:
                                                                    preset.pattern,
                                                            },
                                                        );
                                                }}
                                                disabled={subscribed}
                                            >
                                                <SelectTrigger className="md:w-45">
                                                    <SelectValue placeholder="Presets" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {regexPresets.map(
                                                        (preset) => (
                                                            <SelectItem
                                                                key={
                                                                    preset.label
                                                                }
                                                                value={
                                                                    preset.label
                                                                }
                                                            >
                                                                {preset.label}
                                                            </SelectItem>
                                                        ),
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Field>
                                            <FieldLabel>Test line</FieldLabel>
                                            <div className="flex gap-2">
                                                <Input
                                                    value={parser.testLine}
                                                    onChange={(e) =>
                                                        !subscribed &&
                                                        dataBufferManager.updateParser(
                                                            parser.id,
                                                            {
                                                                testLine:
                                                                    e.target
                                                                        .value,
                                                            },
                                                        )
                                                    }
                                                    placeholder="Enter a line or use the latest input"
                                                    disabled={subscribed}
                                                />
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    onClick={() => {
                                                        const latest = getLatestInputLine();
                                                        if (
                                                            !subscribed &&
                                                            latest
                                                        )
                                                            dataBufferManager.updateParser(
                                                                parser.id,
                                                                {
                                                                    testLine:
                                                                        latest,
                                                                },
                                                            );
                                                    }}
                                                    title="Use latest input line"
                                                >
                                                    <ArrowsClockwiseIcon
                                                        size={18}
                                                    />
                                                </Button>
                                                <Button
                                                    onClick={() => {
                                                        const testLine =
                                                            parser.testLine ||
                                                            line ||
                                                            '';
                                                        const triggerMatched =
                                                            parser.triggerType ===
                                                            'includes'
                                                                ? testLine.includes(
                                                                      parser.triggerValue,
                                                                  )
                                                                : testLine.startsWith(
                                                                      parser.triggerValue,
                                                                  );
                                                        if (!triggerMatched) {
                                                            setTriggerWarning(
                                                                true,
                                                            );
                                                            setHighlightedLine(
                                                                `<span style="background-color: rgba(251, 191, 36, 0.25); color: #f59e0b; padding: 0 2px; border-radius: 2px;">${escapeHtml(
                                                                    testLine,
                                                                )}</span>`,
                                                            );
                                                            return;
                                                        }
                                                        setTriggerWarning(
                                                            false,
                                                        );
                                                        setHighlightedLine(
                                                            highlightMatches(
                                                                testLine,
                                                                extractMatches(
                                                                    testLine,
                                                                    parser.regexPattern,
                                                                ),
                                                                highlightColors,
                                                            ),
                                                        );
                                                    }}
                                                    disabled={
                                                        !parser.testLine &&
                                                        !line
                                                    }
                                                >
                                                    Run
                                                </Button>
                                            </div>
                                        </Field>
                                        <div className="min-h-8 rounded-lg border bg-black p-2 font-mono text-xs text-muted-foreground">
                                            <div
                                                dangerouslySetInnerHTML={{
                                                    __html:
                                                        highlightedLine ||
                                                        escapeHtml(
                                                            parser.testLine ||
                                                                line ||
                                                                'Waiting for serial data...',
                                                        ),
                                                }}
                                            />
                                        </div>
                                        <div className="border-t pt-2">
                                            <div className="mb-2 flex items-center justify-between">
                                                <span className="text-sm font-medium">
                                                    Nodes ({parser.nodes.length}
                                                    )
                                                </span>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        !subscribed &&
                                                        dataBufferManager.addNode(
                                                            parser.id,
                                                            `Node ${parser.nodes.length + 1}`,
                                                        )
                                                    }
                                                    disabled={subscribed}
                                                >
                                                    <PlusIcon
                                                        className="mr-1"
                                                        size={16}
                                                    />{' '}
                                                    Add
                                                </Button>
                                            </div>
                                            <div className="max-h-40 overflow-auto">
                                                <div className="w-full text-xs">
                                                    {parser.nodes.map(
                                                        (
                                                            node: NodeData,
                                                            nIndex: number,
                                                        ) => {
                                                            const dotColor =
                                                                highlightColors[
                                                                    nIndex %
                                                                        highlightColors.length
                                                                ];
                                                            return (
                                                                <div
                                                                    key={
                                                                        node.id
                                                                    }
                                                                    className="flex items-center gap-2 py-1"
                                                                >
                                                                    <div
                                                                        style={{
                                                                            width: 10,
                                                                            height: 10,
                                                                            borderRadius: 9999,
                                                                            backgroundColor:
                                                                                dotColor,
                                                                        }}
                                                                    />
                                                                    <Input
                                                                        value={
                                                                            node.name
                                                                        }
                                                                        onChange={(
                                                                            e,
                                                                        ) =>
                                                                            !subscribed &&
                                                                            dataBufferManager.updateNode(
                                                                                node.id,
                                                                                {
                                                                                    name: e
                                                                                        .target
                                                                                        .value,
                                                                                },
                                                                            )
                                                                        }
                                                                        className="h-7 w-28 text-sm"
                                                                        disabled={
                                                                            subscribed
                                                                        }
                                                                    />
                                                                    <label className="flex items-center gap-1 text-sm">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={
                                                                                node.isTimestamp
                                                                            }
                                                                            onChange={() =>
                                                                                !subscribed &&
                                                                                dataBufferManager.updateNode(
                                                                                    node.id,
                                                                                    {
                                                                                        isTimestamp:
                                                                                            !node.isTimestamp,
                                                                                    },
                                                                                )
                                                                            }
                                                                            disabled={
                                                                                subscribed
                                                                            }
                                                                            className="h-4 w-4"
                                                                        />
                                                                        Timestamp
                                                                    </label>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            !subscribed &&
                                                                            dataBufferManager.removeNode(
                                                                                node.id,
                                                                            )
                                                                        }
                                                                        disabled={
                                                                            subscribed
                                                                        }
                                                                        className="ml-auto"
                                                                    >
                                                                        <TrashIcon
                                                                            size={
                                                                                16
                                                                            }
                                                                        />
                                                                    </Button>
                                                                </div>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeParserById(parser.id)}
                                    title={`Delete ${parser.name}`}
                                >
                                    <TrashIcon size={16} />
                                </Button>
                            </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            {parser.nodes.map((node, nIndex) => (
                                <div
                                    key={node.id}
                                    className="flex items-center gap-1"
                                >
                                    <div
                                        style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: 9999,
                                            backgroundColor:
                                                highlightColors[
                                                    nIndex %
                                                        highlightColors.length
                                                ],
                                        }}
                                    />
                                    <div className="flex items-center gap-1">
                                        <span>{node.name}</span>
                                        {node.isTimestamp && (
                                            <ClockIcon size={12} />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex gap-2">
                <div className="text-xs text-muted-foreground ">
                    {subscribed
                        ? 'Subscribed - data is flowing'
                        : 'Paused - configure parsers and nodes'}
                    {parsers.some((p) =>
                        p.nodes.some((node) => node.isTimestamp),
                    ) && ' | Using timestamp from this parser'}
                </div>
                <div className="flex flex-1"></div>
                <Button
                    variant={subscribed ? 'destructive' : 'default'}
                    size="sm"
                    onClick={() => setSubscribed((current) => !current)}
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
                    onClick={() => dataBufferManager.clearBuffers()}
                    disabled={subscribed}
                >
                    Clear
                </Button>
            </div>
        </div>
    );
}
