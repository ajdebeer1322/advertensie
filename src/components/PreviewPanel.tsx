import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, Box, FolderFont, ImageItem, ReportEntry, SheetRow } from '../types';
import { findRow } from '../utils/matching';
import { InteractiveCanvas, BOXES, BoxKey, getAllBoxes } from './InteractiveCanvas';
import { ThumbStrip } from './ThumbStrip';
import { imageKey, mergeOverride } from '../utils/overrides';

interface Props {
  settings: AppSettings;
  rows: SheetRow[];
  images: ImageItem[];
  selected: Set<string>;
  activePath: string | null;
  onActivePath: (p: string | null) => void;
  folderFonts: FolderFont[];
  log: (level: ReportEntry['level'], text: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  allFonts: string[];
  onCommitHistory: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

type PanelSection = 'layers' | 'box' | 'description' | 'price' | 'canvas';

export function PreviewPanel(p: Props) {
  const selectedList = useMemo(
    () => p.images.filter((i) => p.selected.has(i.path)),
    [p.images, p.selected],
  );
  const list = selectedList.length ? selectedList : p.images;
  const current = p.activePath || list[0]?.path || null;
  const idx = current ? list.findIndex((i) => i.path === current) : -1;
  const currentImg = idx >= 0 ? list[idx] : null;
  const currentKey = currentImg ? imageKey(currentImg.name) : '';
  const currentOverride = currentKey ? p.settings.overrides?.[currentKey] : undefined;
  const hasOverride = !!currentOverride && Object.keys(currentOverride).length > 0;

  // Effective settings = global merged with per-image override (when an image is active).
  const effective: AppSettings = useMemo(
    () => (currentKey ? mergeOverride(p.settings, currentOverride) : p.settings),
    [p.settings, currentKey, currentOverride],
  );

  const [overrideMode, setOverrideMode] = useState(false);

  // Route a settings patch — either to global settings or into the per-image override.
  const writePatch = useCallback(
    (patch: Partial<AppSettings>) => {
      if (overrideMode && currentKey) {
        const prev = p.settings.overrides?.[currentKey] || {};
        const nextOv: Partial<AppSettings> = { ...prev, ...patch };
        p.updateSettings({
          overrides: { ...(p.settings.overrides || {}), [currentKey]: nextOv },
        });
      } else {
        p.updateSettings(patch);
      }
    },
    [overrideMode, currentKey, p.settings, p.updateSettings],
  );

  const resetOverride = useCallback(() => {
    if (!currentKey) return;
    const next = { ...(p.settings.overrides || {}) };
    delete next[currentKey];
    p.updateSettings({ overrides: next });
  }, [currentKey, p.settings.overrides, p.updateSettings]);

  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const renderTimer = useRef<number | null>(null);

  // Side-panel state
  const [panelOpen, setPanelOpen] = useState(true);
  const [openSection, setOpenSection] = useState<PanelSection>('description');
  const [active, setActive] = useState<BoxKey | null>('descriptionTextBox');

  // Auto-switch the open section when the active layer changes.
  useEffect(() => {
    if (!active) return;
    if (active === 'descriptionTextBox') setOpenSection('description');
    else if (active === 'priceTextBox') setOpenSection('price');
    else setOpenSection('box');
  }, [active]);
  const [visible, setVisible] = useState<Record<BoxKey, boolean>>({
    productBox: false,
    headerBox: true,
    descriptionBox: true,
    priceBox: true,
    descriptionTextBox: true,
    priceTextBox: true,
  });

  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const [canvasMax, setCanvasMax] = useState({ w: 800, h: 800 });
  useEffect(() => {
    const update = () => {
      if (!canvasAreaRef.current) return;
      const r = canvasAreaRef.current.getBoundingClientRect();
      setCanvasMax({ w: Math.max(200, r.width - 32), h: Math.max(200, r.height - 32) });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [panelOpen]);

  const render = useCallback(async () => {
    if (!current) return;
    const img = list.find((i) => i.path === current);
    if (!img) return;
    setBusy(true);
    setErr(null);
    let desc = '';
    let price = '';
    let sheetRow: Record<string, string> | undefined;
    if (p.settings.dataSource === 'demo') {
      desc = p.settings.demoDescription;
      price = p.settings.demoPrice;
    } else if (p.settings.dataSource === 'sheet') {
      const row = p.rows.length
        ? findRow(p.rows, img.name, p.settings.keyColumn, p.settings.caseSensitiveMatch)
        : undefined;
      desc = row ? row[p.settings.descriptionColumn] || '' : '';
      price = row ? row[p.settings.priceColumn] || '' : '';
      sheetRow = row;
    }
    if (!desc) desc = p.settings.demoDescription || 'DEMO PRODUCT';
    if (!price) price = p.settings.demoPrice || '99';
    const res = await window.api.renderPreview({
      settings: p.settings,
      productImagePath: img.path,
      description: desc,
      price,
      embeddedFonts: p.folderFonts,
      sheetRow,
      settingsOverride: currentOverride,
    });
    if (res.ok) setDataUrl(res.dataUrl);
    else {
      setErr(res.error);
      p.log('fail', `Preview render failed: ${res.error}`);
    }
    setBusy(false);
  }, [current, list, p.settings, p.rows, p.folderFonts, p.log, currentOverride]);

  useEffect(() => {
    if (renderTimer.current) window.clearTimeout(renderTimer.current);
    renderTimer.current = window.setTimeout(render, 120);
    return () => {
      if (renderTimer.current) window.clearTimeout(renderTimer.current);
    };
  }, [render]);

  const next = () => idx < list.length - 1 && p.onActivePath(list[idx + 1].path);
  const prev = () => idx > 0 && p.onActivePath(list[idx - 1].path);

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        height: 'calc(100vh - 32px)',
        minHeight: 500,
      }}
    >
      {/* Left: canvas area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div className="toolbar" style={{ padding: 10, margin: 0, borderBottom: '1px solid #374151' }}>
          <button className="secondary" onClick={prev} disabled={idx <= 0}>
            ◀
          </button>
          <button className="secondary" onClick={next} disabled={idx < 0 || idx >= list.length - 1}>
            ▶
          </button>
          <button onClick={render} disabled={busy}>
            🔄
          </button>
          <button
            className="secondary"
            onClick={p.onUndo}
            disabled={!p.canUndo}
            title="Undo (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            className="secondary"
            onClick={p.onRedo}
            disabled={!p.canRedo}
            title="Redo (Ctrl+Y)"
          >
            ↷ Redo
          </button>
          <span className="muted" style={{ flex: 1 }}>
            {current ? `${idx + 1}/${list.length} — ${list[idx]?.name}` : 'Nothing to preview'}
            {busy && ' · rendering…'}
            {hasOverride && (
              <span
                style={{
                  marginLeft: 8,
                  padding: '2px 8px',
                  background: '#fbbf24',
                  color: '#111827',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                }}
                title="This image has its own override settings"
              >
                OVERRIDE
              </span>
            )}
          </span>
          <button
            className={overrideMode ? '' : 'secondary'}
            onClick={() => setOverrideMode((v) => !v)}
            disabled={!currentKey}
            title={
              overrideMode
                ? 'Edits go to this image only — click to return to global edits'
                : 'Make edits affect only this image'
            }
            style={overrideMode ? { background: '#fbbf24', color: '#111827' } : undefined}
          >
            {overrideMode ? '✓ Editing override' : '✏️ Override this image'}
          </button>
          {hasOverride && (
            <button
              className="secondary"
              onClick={resetOverride}
              title="Remove this image's override and use global settings"
            >
              🗑 Reset
            </button>
          )}
          <button className="secondary" onClick={() => setPanelOpen(!panelOpen)}>
            {panelOpen ? '▶ Hide panel' : '◀ Show panel'}
          </button>
        </div>

        <div style={{ padding: '0 10px' }}>
          <ThumbStrip items={list} currentPath={current} onPick={(path) => p.onActivePath(path)} />
        </div>

        {err && (
          <div className="report-line fail" style={{ padding: '4px 10px' }}>
            {err}
          </div>
        )}

        <div
          ref={canvasAreaRef}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background:
              'repeating-conic-gradient(#111827 0% 25%, #1f2937 0% 50%) 50% / 20px 20px',
            overflow: 'auto',
          }}
        >
          <InteractiveCanvas
            settings={effective}
            previewDataUrl={dataUrl}
            onChange={writePatch}
            onCommitHistory={p.onCommitHistory}
            active={active}
            onActiveChange={setActive}
            visible={visible}
            onVisibleChange={setVisible}
            maxWidth={canvasMax.w}
            maxHeight={canvasMax.h}
            hideToolbar
          />
        </div>
      </div>

      {/* Right: properties panel */}
      {panelOpen && (
        <aside
          style={{
            width: 340,
            flex: '0 0 340px',
            background: '#1f2937',
            border: '1px solid #374151',
            borderRadius: 8,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Section
            title="Layers"
            open={openSection === 'layers'}
            onToggle={() => setOpenSection(openSection === 'layers' ? 'canvas' : 'layers')}
          >
            <LayersList
              boxes={getAllBoxes(effective)}
              active={active}
              onActive={setActive}
              visible={visible}
              onVisible={setVisible}
            />
          </Section>

          {overrideMode && (
            <div
              style={{
                padding: '8px 12px',
                background: '#78350f',
                color: '#fef3c7',
                fontSize: 12,
                borderBottom: '1px solid #374151',
              }}
            >
              Override mode: edits below apply to <b>{currentImg?.name}</b> only.
            </div>
          )}

          {active && (() => {
            const allBoxes = getAllBoxes(effective);
            const def = allBoxes.find((b) => b.key === active);
            const isCustom = !!def?.custom;
            const currentBox = isCustom
              ? effective.customElements.find((c) => c.id === active)?.box
              : (effective as any)[active];
            if (!currentBox) return null;
            return (
              <Section
                title={`Position — ${def?.label || active}`}
                open={openSection === 'box'}
                onToggle={() => setOpenSection(openSection === 'box' ? 'canvas' : 'box')}
              >
                <BoxEditor
                  box={currentBox}
                  canvasW={effective.canvasWidth}
                  canvasH={effective.canvasHeight}
                  onChange={(b) => {
                    if (isCustom) {
                      writePatch({
                        customElements: effective.customElements.map((c) =>
                          c.id === active ? { ...c, box: b } : c,
                        ),
                      });
                    } else {
                      writePatch({ [active]: b } as Partial<AppSettings>);
                    }
                  }}
                />
              </Section>
            );
          })()}

          <Section
            title="Description text"
            open={openSection === 'description'}
            onToggle={() =>
              setOpenSection(openSection === 'description' ? 'canvas' : 'description')
            }
          >
            <DescriptionEditor
              settings={effective}
              allFonts={p.allFonts}
              onChange={writePatch}
            />
          </Section>

          <Section
            title="Price text"
            open={openSection === 'price'}
            onToggle={() => setOpenSection(openSection === 'price' ? 'canvas' : 'price')}
          >
            <PriceEditor
              settings={effective}
              allFonts={p.allFonts}
              onChange={writePatch}
            />
          </Section>

          <Section
            title="Canvas"
            open={openSection === 'canvas'}
            onToggle={() => setOpenSection(openSection === 'canvas' ? 'layers' : 'canvas')}
          >
            <div className="field-grid">
              <div>
                <label>Width</label>
                <input
                  type="number"
                  value={effective.canvasWidth}
                  onChange={(e) => writePatch({ canvasWidth: Number(e.target.value) })}
                />
              </div>
              <div>
                <label>Height</label>
                <input
                  type="number"
                  value={effective.canvasHeight}
                  onChange={(e) => writePatch({ canvasHeight: Number(e.target.value) })}
                />
              </div>
            </div>
          </Section>
        </aside>
      )}
    </div>
  );
}

// ---------- Subcomponents ----------

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: '1px solid #374151' }}>
      <div
        onClick={onToggle}
        style={{
          padding: '10px 12px',
          cursor: 'pointer',
          background: open ? '#111827' : 'transparent',
          fontWeight: 600,
          fontSize: 13,
          color: open ? '#fbbf24' : '#e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>{title}</span>
        <span>{open ? '▾' : '▸'}</span>
      </div>
      {open && <div style={{ padding: 12 }}>{children}</div>}
    </div>
  );
}

function LayersList({
  boxes,
  active,
  onActive,
  visible,
  onVisible,
}: {
  boxes: { key: BoxKey; label: string; color: string; custom?: boolean }[];
  active: BoxKey | null;
  onActive: (k: BoxKey | null) => void;
  visible: Record<BoxKey, boolean>;
  onVisible: (v: Record<BoxKey, boolean>) => void;
}) {
  return (
    <div>
      {boxes.map((b) => (
        <div
          key={b.key}
          onClick={() => onActive(b.key)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            background: active === b.key ? '#374151' : 'transparent',
            borderLeft: `3px solid ${b.color}`,
            marginBottom: 2,
          }}
        >
          <input
            type="checkbox"
            checked={visible[b.key] !== false}
            onChange={(e) => {
              e.stopPropagation();
              onVisible({ ...visible, [b.key]: e.target.checked });
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <span style={{ fontSize: 13 }}>
            {b.label}
            {b.custom && (
              <span style={{ color: '#9ca3af', fontSize: 10, marginLeft: 6 }}>· custom</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function BoxEditor({
  box,
  canvasW,
  canvasH,
  onChange,
}: {
  box: Box;
  canvasW: number;
  canvasH: number;
  onChange: (b: Box) => void;
}) {
  const N = (k: keyof Box, label: string) => (
    <div>
      <label>{label}</label>
      <input
        type="number"
        value={box[k]}
        onChange={(e) => onChange({ ...box, [k]: Number(e.target.value) })}
      />
    </div>
  );
  return (
    <div>
      <div className="field-grid">
        {N('x', 'X')}
        {N('y', 'Y')}
        {N('width', 'Width')}
        {N('height', 'Height')}
      </div>
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button
          className="secondary"
          onClick={() =>
            onChange({
              x: Math.round((canvasW - box.width) / 2),
              y: box.y,
              width: box.width,
              height: box.height,
            })
          }
        >
          Center H
        </button>
        <button
          className="secondary"
          onClick={() =>
            onChange({
              x: box.x,
              y: Math.round((canvasH - box.height) / 2),
              width: box.width,
              height: box.height,
            })
          }
        >
          Center V
        </button>
        <button
          className="secondary"
          onClick={() => onChange({ x: 0, y: 0, width: canvasW, height: canvasH })}
        >
          Fit canvas
        </button>
      </div>
      <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
        Drag the box on the canvas to move · handles to resize · arrow keys to nudge (Shift = 10px).
      </div>
    </div>
  );
}

function DescriptionEditor({
  settings: s,
  allFonts,
  onChange,
}: {
  settings: AppSettings;
  allFonts: string[];
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    onChange({ [k]: v } as Partial<AppSettings>);
  return (
    <div>
      <div>
        <label>Font family</label>
        <FontSelect
          value={s.descriptionFont}
          onChange={(v) => set('descriptionFont', v)}
          options={allFonts}
        />
      </div>
      <div className="field-grid" style={{ marginTop: 8 }}>
        <NF
          label="Size"
          value={s.descriptionFontSize}
          onChange={(v) => set('descriptionFontSize', v)}
        />
        <NF
          label="Line height"
          step={0.1}
          value={s.descriptionLineHeight}
          onChange={(v) => set('descriptionLineHeight', v)}
        />
        <NF
          label="Letter spacing"
          value={s.descriptionLetterSpacing}
          onChange={(v) => set('descriptionLetterSpacing', v)}
        />
        <NF
          label="Max lines"
          value={s.descriptionMaxLines}
          onChange={(v) => set('descriptionMaxLines', v)}
        />
        <CF
          label="Color"
          value={s.descriptionColor}
          onChange={(v) => set('descriptionColor', v)}
        />
        <CF
          label="Stroke"
          value={s.descriptionStroke}
          onChange={(v) => set('descriptionStroke', v)}
        />
        <NF
          label="Stroke width"
          value={s.descriptionStrokeWidth}
          onChange={(v) => set('descriptionStrokeWidth', v)}
        />
        <div>
          <label>Align</label>
          <select
            value={s.descriptionAlign}
            onChange={(e) => set('descriptionAlign', e.target.value as any)}
          >
            <option value="left">left</option>
            <option value="center">center</option>
            <option value="right">right</option>
          </select>
        </div>
      </div>
      <div
        className="toolbar"
        style={{ marginTop: 10, flexWrap: 'wrap', gap: 10 }}
      >
        <Chk
          label="Uppercase"
          value={s.descriptionUppercase}
          onChange={(v) => set('descriptionUppercase', v)}
        />
        <Chk label="Bold" value={s.descriptionBold} onChange={(v) => set('descriptionBold', v)} />
        <Chk
          label="Auto-fit"
          value={s.descriptionAutoFit}
          onChange={(v) => set('descriptionAutoFit', v)}
        />
        <Chk
          label="Ellipsis"
          value={s.descriptionEllipsis}
          onChange={(v) => set('descriptionEllipsis', v)}
        />
        <Chk
          label="Shadow"
          value={s.descriptionShadow}
          onChange={(v) => set('descriptionShadow', v)}
        />
      </div>
    </div>
  );
}

function PriceEditor({
  settings: s,
  allFonts,
  onChange,
}: {
  settings: AppSettings;
  allFonts: string[];
  onChange: (patch: Partial<AppSettings>) => void;
}) {
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    onChange({ [k]: v } as Partial<AppSettings>);
  return (
    <div>
      <div>
        <label>Font family</label>
        <FontSelect
          value={s.priceFont}
          onChange={(v) => set('priceFont', v)}
          options={allFonts}
        />
      </div>
      <div className="field-grid" style={{ marginTop: 8 }}>
        <NF label="Size" value={s.priceFontSize} onChange={(v) => set('priceFontSize', v)} />
        <NF
          label="Line height"
          step={0.1}
          value={s.priceLineHeight}
          onChange={(v) => set('priceLineHeight', v)}
        />
        <NF
          label="Letter spacing"
          value={s.priceLetterSpacing}
          onChange={(v) => set('priceLetterSpacing', v)}
        />
        <CF label="Color" value={s.priceColor} onChange={(v) => set('priceColor', v)} />
        <CF label="Stroke" value={s.priceStroke} onChange={(v) => set('priceStroke', v)} />
        <NF
          label="Stroke width"
          value={s.priceStrokeWidth}
          onChange={(v) => set('priceStrokeWidth', v)}
        />
        <div>
          <label>Align</label>
          <select
            value={s.priceAlign}
            onChange={(e) => set('priceAlign', e.target.value as any)}
          >
            <option value="left">left</option>
            <option value="center">center</option>
            <option value="right">right</option>
          </select>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <label>Price format (press Enter for a new line · {'{price}'} for the value)</label>
        <textarea
          rows={3}
          value={s.priceFormat}
          onChange={(e) => set('priceFormat', e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'monospace' }}
        />
      </div>
      <div className="toolbar" style={{ marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
        <Chk label="Bold" value={s.priceBold} onChange={(v) => set('priceBold', v)} />
        <Chk label="Shadow" value={s.priceShadow} onChange={(v) => set('priceShadow', v)} />
      </div>
    </div>
  );
}

function NF({
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

function CF({
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

function Chk({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ fontSize: 12 }}>{label}</span>
    </label>
  );
}

function FontSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: `'${value}', sans-serif` }}
      >
        {!options.includes(value) && (
          <option value={value} style={{ fontFamily: `'${value}', sans-serif` }}>
            {value}
          </option>
        )}
        {options.map((o) => (
          <option key={o} value={o} style={{ fontFamily: `'${o}', sans-serif` }}>
            {o}
          </option>
        ))}
      </select>
      <div
        style={{
          marginTop: 4,
          padding: '6px 8px',
          background: '#111827',
          border: '1px solid #374151',
          borderRadius: 4,
          fontFamily: `'${value}', sans-serif`,
          fontSize: 18,
          color: '#fbbf24',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={`Preview in ${value}`}
      >
        AaBbCc 123 — {value}
      </div>
    </div>
  );
}
