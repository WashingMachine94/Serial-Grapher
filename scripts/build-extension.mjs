import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const webappDir = path.join(repoRoot, 'serial-grapher-webapp');
const extensionDir = path.join(repoRoot, 'serial-grapher-extension');

function run(command, args, cwd, label) {
    return new Promise((resolve, reject) => {
        console.log(`\n==> ${label}`);

        const child = spawn(command, args, {
            cwd,
            stdio: 'inherit',
            shell: process.platform === 'win32',
        });

        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(
                new Error(
                    `${command} ${args.join(' ')} failed with exit code ${code}`,
                ),
            );
        });
    });
}

async function findLatestVsix() {
    const files = await readdir(extensionDir, { withFileTypes: true });
    const vsixNames = files
        .filter((entry) => entry.isFile() && entry.name.endsWith('.vsix'))
        .map((entry) => entry.name);

    if (vsixNames.length === 0) {
        return null;
    }

    vsixNames.sort();
    return path.join(extensionDir, vsixNames[vsixNames.length - 1]);
}

try {
    await run('npm', ['install'], webappDir, 'Installing webapp dependencies');
    await run(
        'npm',
        ['run', 'build'],
        webappDir,
        'Building webapp and syncing static export',
    );

    await run(
        'npm',
        ['install'],
        extensionDir,
        'Installing extension dependencies',
    );
    await run(
        'npm',
        ['run', 'package'],
        extensionDir,
        'Building extension production bundle',
    );

    await run(
        'npx',
        [
            '--yes',
            '@vscode/vsce',
            'package',
            '--allow-missing-repository',
            '--skip-license',
        ],
        extensionDir,
        'Packaging VSIX (non-interactive)',
    );

    const latestVsix = await findLatestVsix();
    if (latestVsix) {
        console.log(`\nDone. VSIX created: ${latestVsix}`);
    } else {
        console.log('\nDone, but no VSIX file was found.');
    }
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nBuild failed: ${message}`);
    process.exit(1);
}
