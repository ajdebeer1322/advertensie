# Sunshine Padstal Ads

Windows desktop app (Electron + React + Vite + Sharp) that batch-generates product promo images from a folder of product photos and a Google Sheet.

## What it does

1. Pick a folder of product photos.
2. The app matches each filename to a row in a fixed Google Sheet (key column, e.g. `image_name`).
3. For each selected product it composes a finished ad:
   - base product image
   - top header/branding overlay (PNG)
   - green description sign overlay (PNG)
   - round price badge overlay (PNG)
   - description text (from sheet → placed inside the green sign)
   - price text (from sheet → placed inside the round badge, e.g. `FROM R152`)
4. Exports PNG or JPG to a chosen output folder. Writes `export-log.csv` too.

## Project structure

```
electron/           Main process (Node-side)
  main.ts           BrowserWindow bootstrap
  preload.ts        Context-bridge API exposed to renderer as window.api
  ipc.ts            All IPC handlers
  settings.ts       JSON-backed settings store (userData/settings.json)
  sheets.ts         Google Sheets CSV (gviz) fetch + parse
  fonts.ts          System font listing + folder-font scanning
  renderer.ts       Sharp composition + SVG-text rendering (auto-fit, wrap, stroke, shadow)
  matching.ts       Filename → sheet row matching
src/                Renderer (React)
  main.tsx, App.tsx
  components/       ProductBrowser, PreviewPanel, SettingsPanel, ReportPanel
  utils/matching.ts
  types.ts
index.html, vite.config.ts, package.json
```

## Setup

Requirements: Node.js 18+, npm.

```bash
cd D:/code/ads
npm install
```

Sharp has native binaries — install on the target platform (Windows).

### Develop

```bash
npm run electron:dev
```

Starts Vite on `http://localhost:5173` and launches Electron pointed at it with DevTools.

### Build + package for Windows

```bash
npm run electron:build
```

Produces an NSIS installer in `release/`.

## Configuring Google Sheets

1. Create (or open) your fixed Google Sheet.
2. Ensure it has at least these columns (header row):
   - `image_name` — the key, matching a product photo filename (without extension)
   - `description` — text shown in the green sign
   - `price` — numeric value; formatted via `priceFormat` (e.g. `FROM R{price}`)
3. Share → **Anyone with the link — Viewer** (or publish to web).
4. Copy the full URL (the one containing `/d/<sheetId>/`).
5. In the app: **Settings → Sheet**, paste the URL, set the worksheet tab name (default `Sheet1`) and column names.

The app fetches `https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&sheet=<name>` — no API key needed.

### Example

Filename `kaptein-se-moer-koffie.jpg` matches sheet row:

| image_name              | description | price |
| ----------------------- | ----------- | ----- |
| kaptein-se-moer-koffie  | COFFEE      | 152   |

With `priceFormat = "FROM R{price}"` and `descriptionUppercase = true` the ad renders `COFFEE` in the green sign and `FROM R152` in the price badge.

## Adding custom fonts

You have two options:

**A. Fonts folder (recommended, portable)**

1. Settings → Folders → Fonts folder → pick a folder.
2. Drop `.ttf` / `.otf` / `.woff` / `.woff2` files in that folder.
3. Those families appear in the font dropdowns and are embedded in the SVG render step (so they work without being installed system-wide).

**B. System fonts**

The app lists fonts installed on Windows via `font-list`. Install a font normally (right-click → Install) and it appears in the dropdown.

Folder fonts are listed first — if you need a specific font to render reliably on any machine, put it in the fonts folder.

## Settings persistence

Everything lives in a single JSON file at:
```
%APPDATA%\sunshine-padstal-ads\settings.json
```
It's re-read on every launch. Back it up if you want to preserve your exact template configuration.

## Main user flow

1. Open app.
2. Settings → fill in Sheet URL, columns, product folder, output folder, three overlay PNGs, canvas size, layout boxes, and font settings.
3. Products tab → Refresh sheet → select images (or use **Select all**).
4. Preview tab → double-click a tile (or click Preview) to verify.
5. Click **⚡ Generate** in the sidebar → files land in the output folder + `export-log.csv`.

## Notes

- The composition is a *fixed template* batch generator, not a freeform editor. Layout changes happen in Settings → Layout (x/y/width/height per element).
- Text auto-fits: if the description is too long, the font size shrinks until it fits within the max lines / text box height. If it still overflows and `Ellipsis` is on, the last line is truncated with `…`.
- `export-log.csv` is written next to your outputs (one row per product, status + error).
- To support multiple templates later, duplicate `settings.json` — the architecture already isolates settings from rendering, so you can add a profile picker without changing the renderer.

## Troubleshooting

- **"Sheet not accessible"** — share the sheet as *Anyone with link — Viewer*.
- **Font doesn't render** — drop the `.ttf` into your Fonts folder; system font rendering depends on Sharp/librsvg locating it by family name, which is more reliable with embedded font-face.
- **Sharp install fails** — on Windows ensure you have the Visual Studio Build Tools; `npm rebuild sharp --platform=win32 --arch=x64` often fixes mismatches.
