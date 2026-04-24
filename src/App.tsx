import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { AppSettings, ImageItem, SheetRow, FolderFont, ReportEntry } from './types';
import { ProductBrowser } from './components/ProductBrowser';
import { PreviewPanel } from './components/PreviewPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { ReportPanel } from './components/ReportPanel';
import { findRow } from './utils/matching';
import { imageKey } from './utils/overrides';

type View = 'browser' | 'preview' | 'settings' | 'report';

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [undoStack, setUndoStack] = useState<AppSettings[]>([]);
  const [redoStack, setRedoStack] = useState<AppSettings[]>([]);
  const [view, setView] = useState<View>('browser');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [folderFonts, setFolderFonts] = useState<FolderFont[]>([]);
  const [report, setReport] = useState<ReportEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const log = useCallback((level: ReportEntry['level'], text: string) => {
    setReport((r) => [{ level, text, ts: Date.now() }, ...r].slice(0, 500));
  }, []);

  // Load settings on mount
  useEffect(() => {
    window.api.loadSettings().then(setSettings);
    window.api.listSystemFonts().then(setSystemFonts);
  }, []);

  // Reload image list when product folder changes
  useEffect(() => {
    if (!settings?.productFolder) return;
    window.api.listImages(settings.productFolder).then(setImages);
  }, [settings?.productFolder]);

  // Reload folder fonts when fonts folder changes
  useEffect(() => {
    if (!settings?.fontsFolder) {
      setFolderFonts([]);
      return;
    }
    window.api.listFolderFonts(settings.fontsFolder).then(setFolderFonts);
  }, [settings?.fontsFolder]);

  // Inject @font-face rules so the renderer process (Chromium) can preview
  // folder fonts in dropdowns and swatches. Uses file:// URLs.
  useEffect(() => {
    const id = 'folder-fonts-style';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    const toUrl = (p: string) => 'file:///' + p.replace(/\\/g, '/');
    el.textContent = folderFonts
      .map(
        (f) =>
          `@font-face { font-family: '${f.family.replace(/'/g, '')}'; src: url('${toUrl(f.file)}'); font-display: block; }`,
      )
      .join('\n');
  }, [folderFonts]);

  const updateSettings = useCallback(async (next: Partial<AppSettings>) => {
    // Optimistic: update React state synchronously so controlled inputs
    // don't lag behind keystrokes. Persist to disk in the background.
    setSettings((prev) => (prev ? { ...prev, ...next } : prev));
    try {
      await window.api.saveSettings(next);
    } catch (e: any) {
      log('fail', `Settings save failed: ${e.message || e}`);
    }
  }, [log]);

  /** Push current settings onto the undo stack. Call right before a change
   * the user might want to undo (drag start, button click, etc.). */
  const commitHistory = useCallback(() => {
    setSettings((prev) => {
      if (prev) {
        setUndoStack((s) => [...s.slice(-49), prev]);
        setRedoStack([]);
      }
      return prev;
    });
  }, []);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1];
      setSettings((cur) => {
        if (cur) setRedoStack((r) => [...r.slice(-49), cur]);
        // Persist the restored snapshot
        window.api.saveSettings(prev).catch(() => {});
        return prev;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setSettings((cur) => {
        if (cur) setUndoStack((u) => [...u.slice(-49), cur]);
        window.api.saveSettings(next).catch(() => {});
        return next;
      });
      return stack.slice(0, -1);
    });
  }, []);

  // Global Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const refreshSheet = useCallback(async () => {
    if (!settings) return;
    if (!settings.sheetUrl) {
      log('fail', 'Sheet URL not set');
      return;
    }
    setBusy('Fetching sheet…');
    try {
      const data = await window.api.fetchSheet(settings.sheetUrl, settings.worksheet);
      setRows(data);
      log('info', `Loaded ${data.length} rows from "${settings.worksheet}"`);
    } catch (e: any) {
      log('fail', `Sheet fetch failed: ${e.message || e}`);
    } finally {
      setBusy(null);
    }
  }, [settings, log]);

  const refreshImages = useCallback(async () => {
    if (!settings?.productFolder) return;
    const list = await window.api.listImages(settings.productFolder);
    setImages(list);
    log('info', `Found ${list.length} images`);
  }, [settings?.productFolder, log]);

  const generate = useCallback(async () => {
    if (!settings) return;
    if (selected.size === 0) {
      log('fail', 'No products selected');
      return;
    }
    if (!settings.outputFolder) {
      log('fail', 'Output folder not set');
      return;
    }
    if (settings.dataSource === 'sheet' && rows.length === 0) {
      log('info', 'No sheet data loaded — fetching now');
      await refreshSheet();
    }

    const items: {
      imagePath: string;
      description: string;
      price: string;
      keyName: string;
      sheetRow?: Record<string, string>;
      settingsOverride?: Partial<AppSettings>;
    }[] = [];
    for (const p of selected) {
      const item = images.find((i) => i.path === p);
      if (!item) continue;
      const keyName = imageKey(item.name);
      const settingsOverride = settings.overrides?.[keyName];
      let desc = '';
      let price = '';
      let sheetRow: Record<string, string> | undefined;
      if (settings.dataSource === 'demo') {
        desc = settings.demoDescription;
        price = settings.demoPrice;
      } else if (settings.dataSource === 'sheet') {
        const row = findRow(rows, item.name, settings.keyColumn, settings.caseSensitiveMatch);
        if (!row) {
          log('fail', `No sheet row for ${item.name}`);
          continue;
        }
        desc = row[settings.descriptionColumn] || '';
        price = row[settings.priceColumn] || '';
        sheetRow = row;
        if (!desc) log('fail', `Missing description for ${item.name}`);
        if (!price) log('fail', `Missing price for ${item.name}`);
      }
      items.push({
        imagePath: item.path,
        description: desc,
        price,
        keyName,
        sheetRow,
        settingsOverride,
      });
    }

    if (items.length === 0) {
      log('fail', 'Nothing to render');
      return;
    }

    setBusy(`Rendering 0/${items.length}…`);
    const stop = window.api.onBatchProgress((m) => {
      setBusy(`Rendering ${m.index}/${m.total}…`);
    });
    try {
      const res = await window.api.renderBatch({
        settings,
        items,
        embeddedFonts: folderFonts,
      });
      if (res.ok) {
        log('ok', `Export complete — ${res.success} ok / ${res.failure} failed`);
        for (const r of res.results) {
          if (r.error) log('fail', `${r.imagePath} → ${r.error}`);
          else log('ok', `${r.imagePath} → ${r.outPath}`);
        }
      } else {
        log('fail', res.error);
      }
    } catch (e: any) {
      log('fail', e.message || String(e));
    } finally {
      stop();
      setBusy(null);
    }
  }, [settings, selected, images, rows, folderFonts, log, refreshSheet]);

  const allFonts = useMemo(() => {
    const sys = systemFonts.map((f) => f);
    const folder = folderFonts.map((f) => f.family);
    return Array.from(new Set([...folder, ...sys]));
  }, [systemFonts, folderFonts]);

  if (!settings) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-title">☀ Sunshine Padstal</div>
        {(['browser', 'preview', 'settings', 'report'] as View[]).map((v) => (
          <div
            key={v}
            className={'sidebar-item ' + (view === v ? 'active' : '')}
            onClick={() => setView(v)}
          >
            {v === 'browser'
              ? '📷 Products'
              : v === 'preview'
                ? '👁 Preview'
                : v === 'settings'
                  ? '⚙ Settings'
                  : '📋 Report'}
            {v === 'browser' && selected.size > 0 ? ` (${selected.size})` : ''}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ padding: 12, borderTop: '1px solid #1f2937' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Text source</div>
          <select
            value={settings.dataSource}
            onChange={(e) => updateSettings({ dataSource: e.target.value as any })}
            style={{ marginBottom: 10 }}
          >
            <option value="sheet">Google Sheet</option>
            <option value="none">No text</option>
            <option value="demo">Demo text</option>
          </select>
        </div>
        <div style={{ padding: 12, borderTop: '1px solid #1f2937' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Output folder</div>
          <div
            style={{
              fontSize: 11,
              color: settings.outputFolder ? '#34d399' : '#f87171',
              wordBreak: 'break-all',
              marginBottom: 6,
            }}
          >
            {settings.outputFolder || '(not set)'}
          </div>
          <button
            className="secondary"
            style={{ width: '100%', marginBottom: 8 }}
            onClick={async () => {
              const f = await window.api.pickFolder('Choose output folder');
              if (f) await updateSettings({ outputFolder: f });
            }}
          >
            📁 Set output folder
          </button>
          {settings.outputFolder && (
            <button
              className="secondary"
              style={{ width: '100%', marginBottom: 8, fontSize: 11 }}
              onClick={() => window.api.openPath(settings.outputFolder)}
            >
              📂 Open output folder
            </button>
          )}
          <button onClick={generate} disabled={!!busy} style={{ width: '100%' }}>
            ⚡ Generate {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </aside>

      <main className="main">
        {view === 'browser' && (
          <ProductBrowser
            images={images}
            selected={selected}
            onSelectedChange={setSelected}
            onPreview={(p) => {
              setActivePreview(p);
              setView('preview');
            }}
            onRefresh={refreshImages}
            onPickFolder={async () => {
              const f = await window.api.pickFolder('Choose product folder');
              if (f) await updateSettings({ productFolder: f });
            }}
            currentFolder={settings.productFolder}
            rows={rows}
            settings={settings}
            onRefreshSheet={refreshSheet}
          />
        )}
        {view === 'preview' && (
          <PreviewPanel
            settings={settings}
            rows={rows}
            images={images}
            selected={selected}
            activePath={activePreview}
            onActivePath={setActivePreview}
            folderFonts={folderFonts}
            log={log}
            updateSettings={updateSettings}
            allFonts={allFonts}
            onCommitHistory={commitHistory}
            onUndo={undo}
            onRedo={redo}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
          />
        )}
        {view === 'settings' && (
          <SettingsPanel
            settings={settings}
            updateSettings={updateSettings}
            allFonts={allFonts}
            folderFonts={folderFonts}
            onAddFontFile={async () => {
              const f = await window.api.pickFile(
                [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
                'Choose a font file',
              );
              if (f && settings.fontsFolder) {
                // refresh listing
                const list = await window.api.listFolderFonts(settings.fontsFolder);
                setFolderFonts(list);
              } else if (f) {
                log('info', 'Set a fonts folder in settings to persist this font.');
              }
            }}
            log={log}
          />
        )}
        {view === 'report' && <ReportPanel report={report} onClear={() => setReport([])} />}

        {busy && <div className="status-bar">{busy}</div>}
      </main>
    </div>
  );
}
