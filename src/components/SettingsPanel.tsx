import React, { useState } from 'react';
import type { AppSettings, Box, FolderFont, ReportEntry, SheetRow } from '../types';

interface Props {
  settings: AppSettings;
  updateSettings: (s: Partial<AppSettings>) => Promise<void>;
  allFonts: string[];
  folderFonts: FolderFont[];
  onAddFontFile: () => void;
  log: (level: ReportEntry['level'], text: string) => void;
}

type Tab = 'sheet' | 'folders' | 'overlays' | 'layout' | 'fonts' | 'export';

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
        {(['sheet', 'folders', 'overlays', 'layout', 'fonts', 'export'] as Tab[]).map((t) => (
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

function FileRow({ label, value, onPick }: { label: string; value: string; onPick: () => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label>{label}</label>
      <div className="toolbar">
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
