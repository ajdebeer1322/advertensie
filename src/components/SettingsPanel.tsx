import React, { useState } from 'react';
import type { AppSettings, Box, CustomElement, FolderFont, ReportEntry, SheetRow } from '../types';

interface Props {
  settings: AppSettings;
  updateSettings: (s: Partial<AppSettings>) => Promise<void>;
  allFonts: string[];
  folderFonts: FolderFont[];
  onAddFontFile: () => void;
  log: (level: ReportEntry['level'], text: string) => void;
}

type Tab = 'sheet' | 'folders' | 'overlays' | 'layout' | 'fonts' | 'export' | 'extras';

export function SettingsPanel({
  settings,
  updateSettings,
  allFonts,
  folderFonts,
  onAddFontFile,
  log,
}: Props) {
  const [tab, setTab] = useState<Tab>('sheet');
  const s = settings;

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => updateSettings({ [k]: v } as any);

  const pickFolder = async (k: keyof AppSettings) => {
    const f = await window.api.pickFolder('Choose folder');
    if (f) await set(k, f as any);
  };
  const pickFile = async (k: keyof AppSettings, exts: string[]) => {
    const f = await window.api.pickFile([{ name: 'Files', extensions: exts }], 'Choose file');
    if (f) await set(k, f as any);
  };

  return (
    <div>
      <div className="tabs">
        {(['sheet', 'folders', 'overlays', 'layout', 'fonts', 'export', 'extras'] as Tab[]).map((t) => (
          <div key={t} className={'tab ' + (tab === t ? 'active' : '')} onClick={() => setTab(t)}>
            {t}
          </div>
        ))}
      </div>

      {tab === 'sheet' && (
        <div className="card">
          <h3>Text source</h3>
          <div className="field-grid">
            <SelectField
              label="Source"
              value={s.dataSource}
              onChange={(v) => set('dataSource', v as any)}
              options={['sheet', 'none', 'demo']}
            />
            <div>
              <label>Demo description (Enter = new line)</label>
              <textarea
                rows={3}
                value={s.demoDescription}
                onChange={(e) => set('demoDescription', e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div>
              <label>Demo price (Enter = new line)</label>
              <textarea
                rows={3}
                value={s.demoPrice}
                onChange={(e) => set('demoPrice', e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            <b>sheet</b>: pull description + price from Google Sheets per filename.&nbsp;
            <b>none</b>: render with no text.&nbsp;
            <b>demo</b>: render the demo text on every product (good for layout testing).
          </p>
        </div>
      )}

      {tab === 'sheet' && (
        <div className="card">
          <h3>Google Sheet</h3>
          <div className="field-grid">
            <div>
              <label>Sheet URL (must be shared "Anyone with link")</label>
              <input
                type="text"
                value={s.sheetUrl}
                onChange={(e) => set('sheetUrl', e.target.value)}
              />
            </div>
            <div>
              <label>Worksheet / tab name</label>
              <input
                type="text"
                value={s.worksheet}
                onChange={(e) => set('worksheet', e.target.value)}
              />
            </div>
            <div>
              <label>Key column</label>
              <input
                type="text"
                value={s.keyColumn}
                onChange={(e) => set('keyColumn', e.target.value)}
              />
            </div>
            <div>
              <label>Description column</label>
              <input
                type="text"
                value={s.descriptionColumn}
                onChange={(e) => set('descriptionColumn', e.target.value)}
              />
            </div>
            <div>
              <label>Price column</label>
              <input
                type="text"
                value={s.priceColumn}
                onChange={(e) => set('priceColumn', e.target.value)}
              />
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={s.caseSensitiveMatch}
                  onChange={(e) => set('caseSensitiveMatch', e.target.checked)}
                />{' '}
                Case-sensitive matching
              </label>
            </div>
          </div>

          <SheetTester settings={s} log={log} />
        </div>
      )}

      {tab === 'folders' && (
        <div className="card">
          <h3>Folders</h3>
          <FolderRow
            label="Product images folder"
            value={s.productFolder}
            onPick={() => pickFolder('productFolder')}
          />
          <FolderRow
            label="Output folder"
            value={s.outputFolder}
            onPick={() => pickFolder('outputFolder')}
          />
          <FolderRow
            label="Fonts folder (.ttf/.otf)"
            value={s.fontsFolder}
            onPick={() => pickFolder('fontsFolder')}
          />
        </div>
      )}

      {tab === 'overlays' && (
        <div className="card">
          <h3>Overlay assets (PNG, transparent)</h3>
          <FileRow
            label="Top header / branding"
            value={s.headerOverlay}
            onPick={() => pickFile('headerOverlay', ['png'])}
          />
          <FileRow
            label="Green description sign"
            value={s.descriptionOverlay}
            onPick={() => pickFile('descriptionOverlay', ['png'])}
          />
          <FileRow
            label="Round price badge"
            value={s.priceOverlay}
            onPick={() => pickFile('priceOverlay', ['png'])}
          />
        </div>
      )}

      {tab === 'layout' && (
        <div className="card">
          <h3>Canvas & layout</h3>
          <div className="field-grid">
            <NumberField label="Canvas width" value={s.canvasWidth} onChange={(v) => set('canvasWidth', v)} />
            <NumberField label="Canvas height" value={s.canvasHeight} onChange={(v) => set('canvasHeight', v)} />
          </div>
          <BoxField label="Product image area" value={s.productBox} onChange={(v) => set('productBox', v)} />
          <BoxField label="Header overlay" value={s.headerBox} onChange={(v) => set('headerBox', v)} />
          <BoxField label="Description overlay" value={s.descriptionBox} onChange={(v) => set('descriptionBox', v)} />
          <BoxField label="Price overlay" value={s.priceBox} onChange={(v) => set('priceBox', v)} />
          <BoxField
            label="Description text box"
            value={s.descriptionTextBox}
            onChange={(v) => set('descriptionTextBox', v)}
          />
          <BoxField label="Price text box" value={s.priceTextBox} onChange={(v) => set('priceTextBox', v)} />
        </div>
      )}

      {tab === 'fonts' && (
        <div>
          <div className="card">
            <h3>Font sources</h3>
            <p className="muted">
              {allFonts.length} fonts available · {folderFonts.length} from folder
            </p>
            <button className="secondary" onClick={onAddFontFile}>
              ➕ Add font file
            </button>
          </div>

          <div className="card">
            <h3>Description text</h3>
            <div className="field-grid">
              <SelectField
                label="Font family"
                value={s.descriptionFont}
                onChange={(v) => set('descriptionFont', v)}
                options={allFonts}
              />
              <NumberField
                label="Font size"
                value={s.descriptionFontSize}
                onChange={(v) => set('descriptionFontSize', v)}
              />
              <NumberField
                label="Line height"
                value={s.descriptionLineHeight}
                step={0.1}
                onChange={(v) => set('descriptionLineHeight', v)}
              />
              <NumberField
                label="Letter spacing"
                value={s.descriptionLetterSpacing}
                onChange={(v) => set('descriptionLetterSpacing', v)}
              />
              <ColorField
                label="Color"
                value={s.descriptionColor}
                onChange={(v) => set('descriptionColor', v)}
              />
              <ColorField
                label="Stroke color"
                value={s.descriptionStroke}
                onChange={(v) => set('descriptionStroke', v)}
              />
              <NumberField
                label="Stroke width"
                value={s.descriptionStrokeWidth}
                onChange={(v) => set('descriptionStrokeWidth', v)}
              />
              <SelectField
                label="Align"
                value={s.descriptionAlign}
                onChange={(v) => set('descriptionAlign', v as any)}
                options={['left', 'center', 'right']}
              />
              <NumberField
                label="Max lines"
                value={s.descriptionMaxLines}
                onChange={(v) => set('descriptionMaxLines', v)}
              />
              <CheckboxField
                label="Uppercase"
                value={s.descriptionUppercase}
                onChange={(v) => set('descriptionUppercase', v)}
              />
              <CheckboxField
                label="Bold"
                value={s.descriptionBold}
                onChange={(v) => set('descriptionBold', v)}
              />
              <CheckboxField
                label="Auto-fit"
                value={s.descriptionAutoFit}
                onChange={(v) => set('descriptionAutoFit', v)}
              />
              <CheckboxField
                label="Ellipsis when truncated"
                value={s.descriptionEllipsis}
                onChange={(v) => set('descriptionEllipsis', v)}
              />
              <CheckboxField
                label="Drop shadow"
                value={s.descriptionShadow}
                onChange={(v) => set('descriptionShadow', v)}
              />
            </div>
          </div>

          <div className="card">
            <h3>Price text</h3>
            <div className="field-grid">
              <SelectField
                label="Font family"
                value={s.priceFont}
                onChange={(v) => set('priceFont', v)}
                options={allFonts}
              />
              <NumberField
                label="Font size"
                value={s.priceFontSize}
                onChange={(v) => set('priceFontSize', v)}
              />
              <NumberField
                label="Line height"
                value={s.priceLineHeight}
                step={0.1}
                onChange={(v) => set('priceLineHeight', v)}
              />
              <NumberField
                label="Letter spacing"
                value={s.priceLetterSpacing}
                onChange={(v) => set('priceLetterSpacing', v)}
              />
              <ColorField label="Color" value={s.priceColor} onChange={(v) => set('priceColor', v)} />
              <ColorField
                label="Stroke color"
                value={s.priceStroke}
                onChange={(v) => set('priceStroke', v)}
              />
              <NumberField
                label="Stroke width"
                value={s.priceStrokeWidth}
                onChange={(v) => set('priceStrokeWidth', v)}
              />
              <SelectField
                label="Align"
                value={s.priceAlign}
                onChange={(v) => set('priceAlign', v as any)}
                options={['left', 'center', 'right']}
              />
              <CheckboxField label="Bold" value={s.priceBold} onChange={(v) => set('priceBold', v)} />
              <CheckboxField
                label="Drop shadow"
                value={s.priceShadow}
                onChange={(v) => set('priceShadow', v)}
              />
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Price format ({'{price}'} placeholder · Enter for new line)</label>
                <textarea
                  rows={3}
                  value={s.priceFormat}
                  onChange={(e) => set('priceFormat', e.target.value)}
                  style={{ resize: 'vertical', fontFamily: 'monospace' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'export' && (
        <div className="card">
          <h3>Export</h3>
          <div className="field-grid">
            <SelectField
              label="Format"
              value={s.exportFormat}
              onChange={(v) => set('exportFormat', v as any)}
              options={['png', 'jpg']}
            />
            <NumberField
              label="JPG quality (1–100)"
              value={s.exportQuality}
              onChange={(v) => set('exportQuality', v)}
            />
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Filename pattern ({'{image_name}'} and {'{ext}'})</label>
              <input
                type="text"
                value={s.filenamePattern}
                onChange={(e) => set('filenamePattern', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'extras' && (
        <ExtrasEditor
          settings={s}
          updateSettings={updateSettings}
          allFonts={allFonts}
        />
      )}
    </div>
  );
}

function ExtrasEditor({
  settings,
  updateSettings,
  allFonts,
}: {
  settings: AppSettings;
  updateSettings: (s: Partial<AppSettings>) => Promise<void>;
  allFonts: string[];
}) {
  const list = settings.customElements || [];

  const update = (id: string, patch: Partial<CustomElement>) =>
    updateSettings({
      customElements: list.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  const remove = (id: string) =>
    updateSettings({ customElements: list.filter((e) => e.id !== id) });
  const move = (id: string, dir: -1 | 1) => {
    const i = list.findIndex((e) => e.id === id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    updateSettings({ customElements: next });
  };
  const add = (type: 'text' | 'image') => {
    const el: CustomElement = {
      id: `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      label: type === 'text' ? 'New text' : 'New image',
      enabled: true,
      box: { x: 100, y: 100, width: 300, height: 100 },
      ...(type === 'text'
        ? {
            staticText: 'Sample text',
            font: 'Arial',
            fontSize: 32,
            color: '#ffffff',
            stroke: '#000000',
            strokeWidth: 0,
            align: 'center' as const,
            bold: false,
            uppercase: false,
          }
        : { imagePath: '' }),
    };
    updateSettings({ customElements: [...list, el] });
  };

  return (
    <div className="card">
      <h3>Extras</h3>
      <p className="muted">
        Add extra text or images on top of your ad. Text can pull from any sheet column, or use a
        template like <code>{'{name}'} – R{'{price}'}</code>.
      </p>
      <div className="toolbar">
        <button onClick={() => add('text')}>➕ Add text</button>
        <button onClick={() => add('image')}>➕ Add image</button>
      </div>

      {list.length === 0 && (
        <div className="muted" style={{ marginTop: 12 }}>
          No extra elements yet.
        </div>
      )}

      {list.map((el, i) => (
        <ExtraCard
          key={el.id}
          el={el}
          allFonts={allFonts}
          onChange={(patch) => update(el.id, patch)}
          onRemove={() => remove(el.id)}
          onUp={i > 0 ? () => move(el.id, -1) : undefined}
          onDown={i < list.length - 1 ? () => move(el.id, 1) : undefined}
        />
      ))}
    </div>
  );
}

function ExtraCard({
  el,
  allFonts,
  onChange,
  onRemove,
  onUp,
  onDown,
}: {
  el: CustomElement;
  allFonts: string[];
  onChange: (p: Partial<CustomElement>) => void;
  onRemove: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const isText = el.type === 'text';
  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        background: '#111827',
        border: '1px solid #374151',
        borderRadius: 6,
      }}
    >
      <div className="toolbar">
        <span style={{ fontWeight: 600 }}>
          {isText ? '📝' : '🖼'} {el.label || (isText ? 'Text' : 'Image')}
        </span>
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
          <input
            type="checkbox"
            checked={el.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          <span style={{ fontSize: 12 }}>Enabled</span>
        </label>
        <button className="secondary" disabled={!onUp} onClick={onUp}>
          ↑
        </button>
        <button className="secondary" disabled={!onDown} onClick={onDown}>
          ↓
        </button>
        <button className="danger" onClick={onRemove}>
          Delete
        </button>
      </div>

      <div className="field-grid" style={{ marginTop: 8 }}>
        <div>
          <label>Label</label>
          <input
            type="text"
            value={el.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>
        <div className="field-grid" style={{ gap: 6 }}>
          <div>
            <label>X</label>
            <input
              type="number"
              value={el.box.x}
              onChange={(e) =>
                onChange({ box: { ...el.box, x: Number(e.target.value) } })
              }
            />
          </div>
          <div>
            <label>Y</label>
            <input
              type="number"
              value={el.box.y}
              onChange={(e) =>
                onChange({ box: { ...el.box, y: Number(e.target.value) } })
              }
            />
          </div>
          <div>
            <label>W</label>
            <input
              type="number"
              value={el.box.width}
              onChange={(e) =>
                onChange({ box: { ...el.box, width: Number(e.target.value) } })
              }
            />
          </div>
          <div>
            <label>H</label>
            <input
              type="number"
              value={el.box.height}
              onChange={(e) =>
                onChange({ box: { ...el.box, height: Number(e.target.value) } })
              }
            />
          </div>
        </div>
      </div>

      {isText ? (
        <div style={{ marginTop: 8 }}>
          <div className="field-grid">
            <div>
              <label>Sheet column (optional — overrides text below)</label>
              <input
                type="text"
                placeholder="e.g. brand"
                value={el.sheetColumn || ''}
                onChange={(e) => onChange({ sheetColumn: e.target.value })}
              />
            </div>
            <div>
              <label>Static text / template (use {'{column}'})</label>
              <textarea
                rows={2}
                value={el.staticText || ''}
                onChange={(e) => onChange({ staticText: e.target.value })}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
          <div className="field-grid" style={{ marginTop: 8 }}>
            <div>
              <label>Font</label>
              <select
                value={el.font || 'Arial'}
                onChange={(e) => onChange({ font: e.target.value })}
                style={{ fontFamily: `'${el.font || 'Arial'}', sans-serif` }}
              >
                {allFonts.map((f) => (
                  <option key={f} value={f} style={{ fontFamily: `'${f}', sans-serif` }}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Size</label>
              <input
                type="number"
                value={el.fontSize ?? 32}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              />
            </div>
            <div>
              <label>Color</label>
              <input
                type="color"
                value={el.color || '#ffffff'}
                onChange={(e) => onChange({ color: e.target.value })}
              />
            </div>
            <div>
              <label>Stroke</label>
              <input
                type="color"
                value={el.stroke || '#000000'}
                onChange={(e) => onChange({ stroke: e.target.value })}
              />
            </div>
            <div>
              <label>Stroke width</label>
              <input
                type="number"
                value={el.strokeWidth ?? 0}
                onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
              />
            </div>
            <div>
              <label>Align</label>
              <select
                value={el.align || 'center'}
                onChange={(e) => onChange({ align: e.target.value as any })}
              >
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
              <input
                type="checkbox"
                checked={!!el.bold}
                onChange={(e) => onChange({ bold: e.target.checked })}
              />
              <span style={{ fontSize: 12 }}>Bold</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
              <input
                type="checkbox"
                checked={!!el.uppercase}
                onChange={(e) => onChange({ uppercase: e.target.checked })}
              />
              <span style={{ fontSize: 12 }}>Uppercase</span>
            </label>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <label>Image file (PNG)</label>
          <div className="toolbar">
            <button
              className="secondary"
              onClick={async () => {
                const f = await window.api.pickFile(
                  [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
                  'Choose image',
                );
                if (f) onChange({ imagePath: f });
              }}
            >
              📎 Choose
            </button>
            <span className="muted" style={{ wordBreak: 'break-all' }}>
              {el.imagePath || '(not set)'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SheetTester({
  settings,
  log,
}: {
  settings: AppSettings;
  log: (level: ReportEntry['level'], text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const test = async () => {
    if (!settings.sheetUrl) {
      setErr('Sheet URL is empty');
      return;
    }
    setBusy(true);
    setErr(null);
    setRows(null);
    try {
      const data = await window.api.fetchSheet(settings.sheetUrl, settings.worksheet);
      setRows(data);
      log('ok', `Sheet OK — ${data.length} rows from "${settings.worksheet}"`);
    } catch (e: any) {
      const msg = e.message || String(e);
      setErr(msg);
      log('fail', `Sheet test failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const preview = rows?.slice(0, 5) || [];
  const cols = rows && rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #374151' }}>
      <div className="toolbar">
        <button onClick={test} disabled={busy}>
          {busy ? 'Connecting…' : '🔌 Test connection'}
        </button>
        {rows && (
          <span className="muted">
            ✅ Loaded {rows.length} rows · showing first {preview.length}
          </span>
        )}
        {err && <span style={{ color: '#f87171', fontSize: 12 }}>❌ {err}</span>}
      </div>

      {rows && rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {/* Column health check */}
          <div style={{ marginBottom: 8, fontSize: 12 }}>
            {[
              { col: settings.keyColumn, label: 'Key' },
              { col: settings.descriptionColumn, label: 'Description' },
              { col: settings.priceColumn, label: 'Price' },
            ].map(({ col, label }) => {
              const ok = cols.includes(col);
              return (
                <span
                  key={label}
                  style={{
                    marginRight: 12,
                    color: ok ? '#34d399' : '#f87171',
                  }}
                >
                  {ok ? '✓' : '✗'} {label} → <code>{col}</code>
                </span>
              );
            })}
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #374151', borderRadius: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#111827' }}>
                  {cols.map((c) => {
                    const isMapped =
                      c === settings.keyColumn ||
                      c === settings.descriptionColumn ||
                      c === settings.priceColumn;
                    return (
                      <th
                        key={c}
                        style={{
                          padding: '6px 8px',
                          textAlign: 'left',
                          color: isMapped ? '#fbbf24' : '#9ca3af',
                          borderBottom: '1px solid #374151',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
                    {cols.map((c) => (
                      <td
                        key={c}
                        style={{
                          padding: '6px 8px',
                          color: '#e5e7eb',
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={row[c]}
                      >
                        {row[c] || <span style={{ color: '#4b5563' }}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="muted" style={{ marginTop: 8 }}>
          Connected, but the worksheet has no rows.
        </div>
      )}
    </div>
  );
}

function FolderRow({ label, value, onPick }: { label: string; value: string; onPick: () => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label>{label}</label>
      <div className="toolbar">
        <button className="secondary" onClick={onPick}>
          📁 Choose
        </button>
        <span className="muted" style={{ wordBreak: 'break-all' }}>
          {value || '(not set)'}
        </span>
      </div>
    </div>
  );
}

function OverlayRow({
  label,
  value,
  onPick,
  onClear,
}: {
  label: string;
  value: string;
  onPick: () => void;
  onClear: () => void;
}) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!value) {
      setDataUrl(null);
      return;
    }
    window.api.readFileAsDataUrl(value).then((u) => {
      if (!cancelled) setDataUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        padding: 10,
        marginBottom: 10,
        background: '#111827',
        border: '1px solid #374151',
        borderRadius: 6,
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          flex: '0 0 120px',
          borderRadius: 4,
          background:
            'repeating-conic-gradient(#1f2937 0% 25%, #111827 0% 50%) 50% / 16px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={label}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : (
          <span style={{ color: '#6b7280', fontSize: 11 }}>(no image)</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
        <div
          className="muted"
          style={{ wordBreak: 'break-all', marginBottom: 8, fontSize: 11 }}
        >
          {value || '(not set)'}
        </div>
        <div className="toolbar">
          <button className="secondary" onClick={onPick}>
            📎 {value ? 'Replace' : 'Choose'}
          </button>
          {value && (
            <button className="secondary" onClick={onClear}>
              ✕ Clear
            </button>
          )}
          {value && (
            <button className="secondary" onClick={() => window.api.openPath(value)}>
              📂 Open
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FileRow({ label, value, onPick }: { label: string; value: string; onPick: () => void }) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    if (!value) {
      setDataUrl(null);
      return;
    }
    window.api.readFileAsDataUrl(value).then((u) => {
      if (!cancelled) setDataUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div style={{ marginBottom: 12 }}>
      <label>{label}</label>
      <div className="toolbar">
        <div
          style={{
            width: 48,
            height: 48,
            flex: '0 0 48px',
            borderRadius: 4,
            border: '1px solid #374151',
            background:
              'repeating-conic-gradient(#1f2937 0% 25%, #111827 0% 50%) 50% / 10px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {dataUrl && (
            <img
              src={dataUrl}
              alt=""
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          )}
        </div>
        <button className="secondary" onClick={onPick}>
          📎 Choose
        </button>
        <span className="muted" style={{ wordBreak: 'break-all' }}>
          {value || '(not set)'}
        </span>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <label>{label}</label>
      <input
        type="number"
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label>{label}</label>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function CheckboxField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {!options.includes(value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function BoxField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Box;
  onChange: (v: Box) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label>{label} (x, y, width, height)</label>
      <div className="row">
        <input
          type="number"
          value={value.x}
          onChange={(e) => onChange({ ...value, x: Number(e.target.value) })}
        />
        <input
          type="number"
          value={value.y}
          onChange={(e) => onChange({ ...value, y: Number(e.target.value) })}
        />
        <input
          type="number"
          value={value.width}
          onChange={(e) => onChange({ ...value, width: Number(e.target.value) })}
        />
        <input
          type="number"
          value={value.height}
          onChange={(e) => onChange({ ...value, height: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}
