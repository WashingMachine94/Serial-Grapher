# Serial Grapher

Serial Grapher is a full-stack project with two parts:

- A Next.js web app for visualizing live serial data and uploaded logs
- A VS Code extension that hosts that dashboard inside the editor

This repo includes both the app and the extension, so you can build and run the dashboard locally or package the extension for installation in VS Code.

## Project structure

- `serial-grapher-webapp/` — Next.js dashboard frontend
- `serial-grapher-extension/` — VS Code extension host and packaging metadata

## Requirements

- Node.js 20+ and npm
- VS Code (for extension development and installation)
- Optional: `vsce` for packaging the .vsix file

## Build the web app

From the repo root:

1. Install dependencies:

   ```bash
   cd serial-grapher-webapp
   npm install
   ```

2. Run the app locally in development mode:

   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`.

3. Build a production version:

   ```bash
   npm run build
   ```

   The project includes a `postbuild` hook that automatically copies the generated static export from `serial-grapher-webapp/out` into `serial-grapher-extension/media/webapp` so the extension can serve the dashboard.

## Build the extension

From the repo root:

1. Install extension dependencies:

   ```bash
   cd serial-grapher-extension
   npm install
   ```

2. Compile the extension during development:

   ```bash
   npm run compile
   ```

3. Build a production bundle for packaging:

   ```bash
   npm run package
   ```

4. Optional: lint the extension code:

   ```bash
   npm run lint
   ```

## Package the extension

To create a VSIX package for installation in VS Code:

```bash
cd serial-grapher-extension
npx @vscode/vsce package
```

This creates a `.vsix` file in the extension folder, such as:

```bash
serial-grapher-0.0.1.vsix
```

If you prefer to use the extension manifest script directly, the project already defines:

```bash
npm run package
```

For packaging, `vsce` is the standard tool to build the final installable extension.

## Run the extension in VS Code

For local debugging:

1. Open the extension folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. The extension becomes available inside the VS Code instance and can open the dashboard from the command palette or the extension command menu

## Install the extension from a VSIX file

Inside VS Code:

1. Open the Command Palette
2. Run `Extensions: Install from VSIX...`
3. Select the generated `.vsix` file
4. Reload the window when prompted

You can also install it from the terminal:

```bash
code --install-extension serial-grapher-0.0.1.vsix
```

## Notes

- The web app icon is defined in `serial-grapher-webapp/app/icon.svg` and is used as the browser favicon.
- The VS Code extension icon is stored in `serial-grapher-extension/media/serial-grapher-icon.png` and referenced by the extension manifest.
- For distribution, keep the web app built before packaging the extension so the embedded dashboard is up to date.

## Commands only

Run from repository root unless noted.

### Web app

```bash
cd serial-grapher-webapp
npm install
npm run dev
```

```bash
cd serial-grapher-webapp
npm run build
```

### Extension

```bash
cd serial-grapher-extension
npm install
npm run compile
```

```bash
cd serial-grapher-extension
npm run package
```

### VSIX package

```bash
cd serial-grapher-extension
npx @vscode/vsce package
```

### Install extension in VS Code

```bash
code --install-extension serial-grapher-0.0.1.vsix
```
