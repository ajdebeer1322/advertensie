import { IpcMain, dialog, shell, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { loadSettings, saveSettings, AppSettings } from './settings';
import { fetchSheet } from './sheets';
import { listSystemFonts, listFolderFonts } from './fonts';
import { renderAd } from './renderer';
import { findRow } from './matching';
import type { CustomElement } from './settings';

function mergeOverride(base: AppSettings, override: Partial<AppSettings> | undefined): AppSettings {
  if (!override) return base;
  const merged: AppSettings = { ...base, ...override };
  if (override.customElements) {
    const byId = new Map(base.customElements.map((e) => [e.id, e] as const));
    for (const o of override.customElements) {
      const existing = byId.get(o.id);
      byId.set(o.id, existing ? { ...existing, ...o } as CustomElement : o);
    }
    merged.customElements = Array.from(byId.values());
  }
  return merged;
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export function registerIpc(ipc: IpcMain, getWin: () => BrowserWindow | null) {
  // ---- settings ----
  ipc.handle('settings:load', () => loadSettings());
  ipc.handle('settings:save', (_e, next: Partial<AppSettings>) => saveSettings(next));

  // ---- fs ----
  ipc.handle('fs:pickFolder', async (_e, title?: string) => {
    const win = getWin();
    const r = await dialog.showOpenDialog(win!, {
      title: title || 'Choose folder',
      properties: ['openDirectory'],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipc.handle(
    'fs:pickFile',
    async (_e, filters?: { name: string; extensions: string[] }[], title?: string) => {
      const win = getWin();
      const r = await dialog.showOpenDialog(win!, {
        title: title || 'Choose file',
        properties: ['openFile'],
        filters,
      });
      return r.canceled ? null : r.filePaths[0];
    },
  );

  ipc.handle('fs:listImages', (_e, folder: string) => {
    if (!folder || !fs.existsSync(folder)) return [];
    return fs
      .readdirSync(folder)
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .map((f) => ({ name: f, path: path.join(folder, f) }));
  });

  ipc.handle('fs:readFileAsDataUrl', (_e, filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : 'application/octet-stream';
    const data = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${data}`;
  });

  ipc.handle('fs:openPath', (_e, p: string) => shell.openPath(p));

  // ---- fonts ----
  ipc.handle('fonts:listSystem', () => listSystemFonts());
  ipc.handle('fonts:listFolder', (_e, folder: string) => listFolderFonts(folder));
  ipc.handle('fonts:loadFile', (_e, filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return { family: path.basename(filePath, path.extname(filePath)), file: filePath };
  });

  // ---- sheets ----
  ipc.handle('sheets:fetch', (_e, sheetUrl: string, worksheet: string) =>
    fetchSheet(sheetUrl, worksheet),
  );

  // ---- render ----
  ipc.handle(
    'render:preview',
    async (
      _e,
      payload: {
        settings: AppSettings;
        productImagePath: string;
        description: string;
        price: string;
        embeddedFonts?: { family: string; file: string }[];
        sheetRow?: Record<string, string>;
        settingsOverride?: Partial<AppSettings>;
      },
    ) => {
      try {
        const merged = mergeOverride(payload.settings, payload.settingsOverride);
        const result = await renderAd({ ...payload, settings: merged });
        const mime = result.format === 'png' ? 'image/png' : 'image/jpeg';
        return {
          ok: true as const,
          dataUrl: `data:${mime};base64,${result.buffer.toString('base64')}`,
        };
      } catch (err: any) {
        return { ok: false as const, error: err.message || String(err) };
      }
    },
  );

  ipc.handle(
    'render:batch',
    async (
      _e,
      payload: {
        settings: AppSettings;
        items: {
          imagePath: string;
          description: string;
          price: string;
          keyName: string;
          sheetRow?: Record<string, string>;
          settingsOverride?: Partial<AppSettings>;
        }[];
        embeddedFonts?: { family: string; file: string }[];
      },
    ) => {
      const { settings, items } = payload;
      const win = getWin();
      const outputDir = settings.outputFolder;
      if (!outputDir) return { ok: false, error: 'Output folder not set.' };
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const results: { imagePath: string; outPath?: string; error?: string }[] = [];
      let success = 0;
      let failure = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          const merged = mergeOverride(settings, item.settingsOverride);
          const { buffer, format } = await renderAd({
            settings: merged,
            productImagePath: item.imagePath,
            description: item.description,
            price: item.price,
            embeddedFonts: payload.embeddedFonts,
            sheetRow: item.sheetRow,
          });
          const filename = (merged.filenamePattern || '{image_name}.{ext}')
            .replace('{image_name}', item.keyName)
            .replace('{ext}', format === 'jpg' ? 'jpg' : 'png');
          const outPath = path.join(outputDir, filename);
          fs.writeFileSync(outPath, buffer);
          results.push({ imagePath: item.imagePath, outPath });
          success++;
        } catch (err: any) {
          results.push({ imagePath: item.imagePath, error: err.message || String(err) });
          failure++;
        }
        win?.webContents.send('render:batchProgress', {
          index: i + 1,
          total: items.length,
          current: item.imagePath,
        });
      }

      // Write CSV log
      try {
        const logLines = ['image,output,status,error'];
        for (const r of results) {
          logLines.push(
            [
              csv(r.imagePath),
              csv(r.outPath || ''),
              r.error ? 'fail' : 'ok',
              csv(r.error || ''),
            ].join(','),
          );
        }
        fs.writeFileSync(path.join(outputDir, 'export-log.csv'), logLines.join('\n'));
      } catch {
        /* noop */
      }

      return { ok: true, results, success, failure };
    },
  );
}

function csv(v: string): string {
  if (/[,"\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
