import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webappDir = path.resolve(scriptDir, '..');
const sourceDir = path.join(webappDir, 'out');
const targetDir = path.resolve(
    webappDir,
    '..',
    'serial-grapher-extension',
    'media',
    'webapp',
);

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });

console.log(`Synced static export to ${targetDir}`);
