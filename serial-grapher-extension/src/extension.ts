import * as vscode from 'vscode';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';

const MIME_TYPES: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.woff2': 'font/woff2',
};

let webappServer: http.Server | undefined;
let webappServerUrl: string | undefined;

export function activate(context: vscode.ExtensionContext) {
    const openDashboardStatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100,
    );
    openDashboardStatusBarItem.name = 'Serial Grapher';
    openDashboardStatusBarItem.text = '$(graph-line) Serial Grapher';
    openDashboardStatusBarItem.tooltip = 'Open Serial Grapher';
    openDashboardStatusBarItem.command = 'serial-grapher.openDashboard';
    openDashboardStatusBarItem.show();

    const disposable = vscode.commands.registerCommand(
        'serial-grapher.openDashboard',
        async () => {
            const webappRoot = vscode.Uri.joinPath(
                context.extensionUri,
                'media',
                'webapp',
            );

            try {
                const serverUrl = await ensureWebappServer(webappRoot);
                await vscode.commands.executeCommand(
                    'simpleBrowser.show',
                    serverUrl,
                );
            } catch (error) {
                const details =
                    error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(
                    `Unable to load the Serial Grapher webapp. Run npm run build in serial-grapher-webapp first. ${details}`,
                );
            }
        },
    );

    context.subscriptions.push(openDashboardStatusBarItem, disposable);
    context.subscriptions.push({
        dispose: () => {
            webappServerUrl = undefined;
            webappServer?.close();
            webappServer = undefined;
        },
    });
}

async function ensureWebappServer(webappRoot: vscode.Uri): Promise<string> {
    if (webappServer && webappServerUrl) {
        return webappServerUrl;
    }

    const indexUri = vscode.Uri.joinPath(webappRoot, 'index.html');
    await vscode.workspace.fs.stat(indexUri);

    const rootPath = webappRoot.fsPath;
    webappServer = http.createServer(async (request, response) => {
        try {
            const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
            const requestedPath = decodeURIComponent(requestUrl.pathname);
            const relativePath =
                requestedPath === '/'
                    ? 'index.html'
                    : requestedPath.replace(/^\//, '');
            const normalizedPath = path.normalize(
                path.join(rootPath, relativePath),
            );

            if (!isWithinRoot(rootPath, normalizedPath)) {
                response.writeHead(403);
                response.end('Forbidden');
                return;
            }

            const fileUri = vscode.Uri.file(normalizedPath);
            let stats: vscode.FileStat;

            try {
                stats = await vscode.workspace.fs.stat(fileUri);
            } catch {
                response.writeHead(404);
                response.end('Not Found');
                return;
            }

            let finalUri = fileUri;
            if (stats.type === vscode.FileType.Directory) {
                finalUri = vscode.Uri.file(
                    path.join(normalizedPath, 'index.html'),
                );
            }

            const bytes = await vscode.workspace.fs.readFile(finalUri);
            response.writeHead(200, {
                'Content-Type':
                    MIME_TYPES[path.extname(finalUri.fsPath)] ??
                    'application/octet-stream',
                'Cache-Control': 'no-cache',
                'Permissions-Policy': 'bluetooth=(self), serial=(self)',
            });
            response.end(Buffer.from(bytes));
        } catch {
            response.writeHead(500);
            response.end('Internal Server Error');
        }
    });

    const address = await new Promise<AddressInfo>((resolve, reject) => {
        webappServer?.once('error', reject);
        webappServer?.listen(0, '127.0.0.1', () => {
            const serverAddress = webappServer?.address();
            if (!serverAddress || typeof serverAddress === 'string') {
                reject(
                    new Error(
                        'Unable to determine the Serial Grapher web server address.',
                    ),
                );
                return;
            }

            resolve(serverAddress);
        });
    });

    webappServerUrl = `http://127.0.0.1:${address.port}/`;
    return webappServerUrl;
}

function isWithinRoot(rootPath: string, targetPath: string): boolean {
    const relativePath = path.relative(rootPath, targetPath);
    return (
        relativePath !== '..' &&
        !relativePath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativePath)
    );
}

export function deactivate() {}
