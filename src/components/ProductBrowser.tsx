import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettings, ImageItem, SheetRow } from '../types';
import { findRow, keyFromFilename } from '../utils/matching';

interface Props {
  images: ImageItem[];
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
  onPreview: (path: string) => void;
  onRefresh: () => void;
  onPickFolder: () => void;
  currentFolder: string;
  rows: SheetRow[];
  settings: AppSettings;
  onRefreshSheet: () => void;
}

export function ProductBrowser(p: Props) {
  const [search, setSearch] = useState('');
  const [filterMissing, setFilterMissing] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [showMissingPhotos, setShowMissingPhotos] = useState(false);

  const printMissingPhotos = () => {
    const now = new Date().toLocaleString();
    const missingRows: SheetRow[] = [];
    const seen = new Set<string>();
    for (const row of p.rows) {
      const raw = row[p.settings.keyColumn];
      if (!raw) continue;
      const keyText = String(raw).trim();
      const nk = norm(keyText);
      if (!nk || imageKeys.has(nk) || seen.has(nk)) continue;
      seen.add(nk);
      missingRows.push(row);
    }

    const sheetColumns = Array.from(
      new Set(
        missingRows.flatMap((row) => Object.keys(row)).filter((k) => k.trim().length > 0),
      ),
    );

    const headerHtml =
      `<th>#</th>` +
      sheetColumns.map((c) => `<th>${escapeHtml(c)}</th>`).join('') +
      `<th>Notes / Assigned To</th>`;

    const rowsHtml = missingRows
      .map((row, i) => {
        const cells = sheetColumns
          .map((col) => `<td>${escapeHtml(String(row[col] ?? ''))}</td>`)
          .join('');
        return `<tr><td>${i + 1}</td>${cells}<td></td></tr>`;
      })
      .join('');
    const emptyColSpan = sheetColumns.length + 2;

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Missing Photos List</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
      h1 { margin: 0 0 8px; font-size: 20px; }
      .meta { margin-bottom: 16px; color: #4b5563; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
      th { background: #f3f4f6; }
      td:first-child { width: 48px; white-space: nowrap; }
      td:last-child { width: 220px; }
      .table-wrap { overflow-x: auto; }
      .actions { display: flex; gap: 8px; margin-bottom: 12px; }
      .btn { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #f9fafb; cursor: pointer; }
      .btn:hover { background: #f3f4f6; }
      @media print {
        .actions { display: none; }
        body { margin: 12mm; }
      }
    </style>
  </head>
  <body>
    <h1>Missing Product Photos</h1>
    <div class="meta">Generated: ${escapeHtml(now)} · Total missing: ${missingRows.length}</div>
    <div class="actions">
      <button class="btn" onclick="window.print()">Print</button>
      <button class="btn" onclick="window.close()">Close</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="${emptyColSpan}">No missing products found.</td></tr>`}
        </tbody>
      </table>
    </div>
  </body>
</html>`;
    const w = window.open('', '_blank', 'width=1100,height=800');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  };
  const norm = (s: string) => (p.settings.caseSensitiveMatch ? s.trim() : s.trim().toLowerCase());

  const sheetKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of p.rows) {
      const raw = row[p.settings.keyColumn];
      if (!raw) continue;
      const n = norm(String(raw));
      if (n) keys.add(n);
    }
    return keys;
  }, [p.rows, p.settings.keyColumn, p.settings.caseSensitiveMatch]);

  const imageKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const img of p.images) keys.add(norm(keyFromFilename(img.name)));
    return keys;
  }, [p.images, p.settings.caseSensitiveMatch]);

  const sheetMatchedImagePaths = useMemo(() => {
    return p.images
      .filter((img) => sheetKeys.has(norm(keyFromFilename(img.name))))
      .map((img) => img.path);
  }, [p.images, sheetKeys, p.settings.caseSensitiveMatch]);

  const missingSheetProducts = useMemo(() => {
    const missing: string[] = [];
    for (const row of p.rows) {
      const raw = row[p.settings.keyColumn];
      if (!raw) continue;
      const text = String(raw).trim();
      const n = norm(text);
      if (!n || imageKeys.has(n)) continue;
      missing.push(text);
    }
    return Array.from(new Set(missing)).sort((a, b) => a.localeCompare(b));
  }, [p.rows, p.settings.keyColumn, imageKeys, p.settings.caseSensitiveMatch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = p.images;
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    if (filterMissing && p.rows.length) {
      list = list.filter(
        (i) => !findRow(p.rows, i.name, p.settings.keyColumn, p.settings.caseSensitiveMatch),
      );
    }
    return list;
  }, [p.images, search, filterMissing, p.rows, p.settings]);

  // Lazy load thumbnails for visible images (simple all-load — fine for typical batches)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const img of filtered.slice(0, 200)) {
        if (cancelled) return;
        if (thumbs[img.path]) continue;
        const url = await window.api.readFileAsDataUrl(img.path);
        if (cancelled) return;
        if (url) setThumbs((t) => ({ ...t, [img.path]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filtered]);

  const toggle = (path: string) => {
    const next = new Set(p.selected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    p.onSelectedChange(next);
  };

  return (
    <div>
      <div className="card">
        <h3>Product Folder</h3>
        <div className="toolbar">
          <button onClick={p.onPickFolder}>Choose folder</button>
          <button className="secondary" onClick={p.onRefresh}>
            Refresh images
          </button>
          <button className="secondary" onClick={p.onRefreshSheet}>
            Refresh sheet
          </button>
          <span className="muted">{p.currentFolder || '(no folder set)'}</span>
        </div>
        <div className="toolbar">
          <input
            type="text"
            placeholder="Search filenames…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="secondary"
            onClick={() => p.onSelectedChange(new Set(filtered.map((i) => i.path)))}
          >
            Select all
          </button>
          <button
            className="secondary"
            onClick={() => p.onSelectedChange(new Set(sheetMatchedImagePaths))}
            disabled={!p.rows.length}
            title="Select images that have matching keys in the sheet"
          >
            Select all in sheet
          </button>
          <button className="secondary" onClick={() => p.onSelectedChange(new Set())}>
            Clear
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <input
              type="checkbox"
              checked={filterMissing}
              onChange={(e) => setFilterMissing(e.target.checked)}
            />
            <span>Only missing-sheet</span>
          </label>
          <span className="muted">
            {filtered.length} shown · {p.selected.size} selected
          </span>
        </div>
      </div>

      <div className="card">
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Missing Photos</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              onClick={() => setShowMissingPhotos((v) => !v)}
              disabled={!p.rows.length}
              title="Show or hide products that do not have a matching image"
            >
              {showMissingPhotos ? 'Hide list' : 'Show list'}
            </button>
            <button
              className="secondary"
              onClick={printMissingPhotos}
              disabled={!p.rows.length}
              title="Print a list of products that still need photos"
            >
              Print missing
            </button>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          {missingSheetProducts.length} sheet products without a matching image filename
        </div>
        {showMissingPhotos &&
          (missingSheetProducts.length ? (
            <div
              style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 8 }}
            >
              {missingSheetProducts.map((name) => (
                <div key={name} style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9' }}>
                  {name}
                </div>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 8 }}>
              No missing products found.
            </div>
          ))}
      </div>

      <div className="grid">
        {filtered.map((img) => {
          const sel = p.selected.has(img.path);
          const row = p.rows.length
            ? findRow(p.rows, img.name, p.settings.keyColumn, p.settings.caseSensitiveMatch)
            : undefined;
          const missing = p.rows.length && !row;
          return (
            <div
              key={img.path}
              className={'tile ' + (sel ? 'selected' : '')}
              onClick={() => toggle(img.path)}
              onDoubleClick={() => p.onPreview(img.path)}
              title={img.name}
            >
              {thumbs[img.path] ? <img src={thumbs[img.path]} alt={img.name} /> : <span>…</span>}
              <div
                className="tile-name"
                style={missing ? { background: 'rgba(220,38,38,0.85)' } : undefined}
              >
                {img.name}
                {missing ? ' ⚠' : ''}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="muted" style={{ padding: 24 }}>
            No images. Choose a product folder.
          </div>
        )}
      </div>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
