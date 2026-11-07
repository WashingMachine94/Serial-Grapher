# Serial Grapher

## Introduction

Serial Grapher has two parts:

- `serial-grapher-webapp/` (Next.js dashboard)
- `serial-grapher-extension/` (VS Code extension)

Prerequisites:

- Node.js 20+
- npm
- VS Code

## Building & installation

Use this cross-platform script from repository root to build everything needed for the extension package:

```bash
node ./scripts/build-extension.mjs
```

What it does:

1. Builds the webapp and syncs static output into `serial-grapher-extension/media/webapp`
2. Builds the extension production bundle
3. Packages a VSIX file

Install the generated VSIX into VS Code:

```powershell
code --install-extension .\serial-grapher-extension\serial-grapher-0.0.1.vsix
```

Or in VS Code: `Extensions: Install from VSIX...`

## Webapp dev

From repo root:

```bash
cd serial-grapher-webapp
npm install
npm run dev
```

Open `http://localhost:3000`.

## Extension dev

From repo root:

```bash
cd serial-grapher-extension
npm install
npm run compile
```