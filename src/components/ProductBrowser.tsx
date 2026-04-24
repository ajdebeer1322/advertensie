import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettings, ImageItem, SheetRow } from '../types';
import { findRow } from '../utils/matching';

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
          <button onClick={p.onPickFolder}>📁 Choose folder</button>
          <button className="secondary" onClick={p.onRefresh}>
            🔄 Refresh images
          </button>
          <button className="secondary" onClick={p.onRefreshSheet}>
            📊 Refresh sheet
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
