import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, Box, FolderFont, ImageItem, ReportEntry, SheetRow } from '../types';
import { findRow } from '../utils/matching';
import { InteractiveCanvas, BoxKey, getAllBoxes } from './InteractiveCanvas';
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
type EditorTelemetry = {
  source: 'editor-assets';
  pending: number;
  dropped: number;
  cacheSize: number;
  lastLoadMs: number;
};

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
  const [livePatch, setLivePatch] = useState<Partial<AppSettings> | null>(null);

  // Effective settings = global merged with per-image override (when an image is active).
  const effective: AppSettings = useMemo(
    () => {
      const base = currentKey ? mergeOverride(p.settings, currentOverride) : p.settings;
      return livePatch ? ({ ...base, ...livePatch } as AppSettings) : base;
    },
    [p.settings, currentKey, currentOverride, livePatch],
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

  const [dataUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<EditorTelemetry>({
    source: 'editor-assets',
    pending: 0,
    dropped: 0,
    cacheSize: 0,
    lastLoadMs: 0,
  });

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

  useEffect(() => {
    setErr(null);
  }, [current]);

  const next = () => idx < list.length - 1 && p.onActivePath(list[idx + 1].path);
  const prev = () => idx > 0 && p.onActivePath(list[idx - 1].path);
  const liveText = useMemo(() => {
    const img = current ? list.find((i) => i.path === current) : null;
    let description = '';
    let price = '';
    if (p.settings.dataSource === 'demo') {
      description = p.settings.demoDescription;
      price = p.settings.demoPrice;
    } else if (p.settings.dataSource === 'sheet' && img) {
      const row = p.rows.length
        ? findRow(p.rows, img.name, p.settings.keyColumn, p.settings.caseSensitiveMatch)
        : undefined;
      description = row ? row[p.settings.descriptionColumn] || '' : '';
      price = row ? row[p.settings.priceColumn] || '' : '';
    }
    return {
      description: description || p.settings.demoDescription || 'DEMO PRODUCT',
      price: price || p.settings.demoPrice || '99',
    };
  }, [current, list, p.settings, p.rows]);

  return (
    <div className="preview-layout">
      {/* Left: canvas area */}
      <div className="preview-workspace">
        <div className="toolbar preview-toolbar">
          <button className="secondary" onClick={prev} disabled={idx <= 0}>
            ◀
          </button>
          <button className="secondary" onClick={next} disabled={idx < 0 || idx >= list.length - 1}>
            ▶
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
            {hasOverride && (
              <span className="status-pill" title="This image has its own override settings">
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

        <div ref={canvasAreaRef} className="canvas-stage">
          <InteractiveCanvas
            settings={effective}
            previewDataUrl={dataUrl}
            productImagePath={current}
            liveDescription={liveText.description}
            livePrice={liveText.price}
            onChange={writePatch}
            onCommitHistory={p.onCommitHistory}
            active={active}
            onActiveChange={setActive}
            visible={visible}
            onVisibleChange={setVisible}
            maxWidth={canvasMax.w}
            maxHeight={canvasMax.h}
            hideToolbar
            onTelemetry={setTelemetry}
          />
        </div>
        <div className="muted" style={{ padding: '6px 10px', borderTop: '1px solid rgba(232, 226, 214, 0.10)' }}>
          editor: {telemetry.source} | pending {telemetry.pending} | dropped {telemetry.dropped} | cache {telemetry.cacheSize} | last {telemetry.lastLoadMs}ms
        </div>
      </div>

      {/* Right: properties panel */}
      {panelOpen && (
        <aside className="editor-panel">
          <div className="editor-panel-header">
            <div className="editor-panel-icon">T</div>
            <div className="editor-panel-title">
              <div>Text</div>
              <span>Style and customize your text</span>
            </div>
            <button
              type="button"
              className="secondary editor-reset-btn"
              onClick={resetOverride}
              disabled={!hasOverride}
            >
              Reset
            </button>
          </div>
          <Section
            title="Layers"
            icon="L"
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
                icon="P"
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
            icon="T"
            open={openSection === 'description'}
            onToggle={() =>
              setOpenSection(openSection === 'description' ? 'canvas' : 'description')
            }
          >
            <DescriptionEditor
              settings={effective}
              allFonts={p.allFonts}
              onChange={writePatch}
              onPreviewPatch={setLivePatch}
            />
          </Section>

          <Section
            title="Price text"
            icon="$"
            open={openSection === 'price'}
            onToggle={() => setOpenSection(openSection === 'price' ? 'canvas' : 'price')}
          >
            <PriceEditor
              settings={effective}
              allFonts={p.allFonts}
              onChange={writePatch}
              onPreviewPatch={setLivePatch}
            />
          </Section>

          <Section
            title="Canvas"
            icon="C"
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
          <div className="editor-live-card">
            <div className="editor-live-icon">Ag</div>
            <div>
              <strong>Live preview</strong>
              <span>Changes you make will appear here</span>
            </div>
            <button type="button" className="secondary">Preview on canvas</button>
          </div>
          <div className="editor-tip">
            <span>?</span>
            <div><strong>Tip:</strong> Use Auto-fit to resize text to fit its container</div>
            <button type="button" className="secondary" aria-label="Dismiss tip">x</button>
          </div>
        </aside>
      )}
    </div>
  );
}

// ---------- Subcomponents ----------

function Section({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={'editor-section ' + (open ? 'open' : '')}>
      <div onClick={onToggle} className="editor-section-toggle">
        <span className="editor-section-label"><span>{icon}</span>{title}</span>
        <span>{open ? '▾' : '▸'}</span>
      </div>
      {open && <div className="editor-section-body">{children}</div>}
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
            background: active === b.key ? 'rgba(255, 255, 255, 0.07)' : 'transparent',
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
  onPreviewPatch,
}: {
  settings: AppSettings;
  allFonts: string[];
  onChange: (patch: Partial<AppSettings>) => void;
  onPreviewPatch: (patch: Partial<AppSettings> | null) => void;
}) {
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    onChange({ [k]: v } as Partial<AppSettings>);
  return (
    <div className="inspector-stack">
      <InspectorGroup title="Typography">
        <div className="inspector-field inspector-field-wide">
          <label>Font family</label>
          <LiveFontSelect
            value={s.descriptionFont}
            onChange={(v) => set('descriptionFont', v)}
            onPreview={(v) => onPreviewPatch(v ? { descriptionFont: v } : null)}
            options={allFonts}
          />
        </div>
        <InspectorPair>
          <InspectorSlider
            label="Size"
            value={s.descriptionFontSize}
            onChange={(v) => set('descriptionFontSize', v)}
            min={8}
            max={180}
            step={1}
            unit="px"
          />
          <InspectorSlider
            label="Line height"
            value={s.descriptionLineHeight}
            onChange={(v) => set('descriptionLineHeight', v)}
            min={0.7}
            max={2.4}
            step={0.05}
          />
        </InspectorPair>
      </InspectorGroup>

      <InspectorGroup title="Appearance">
        <InspectorInline>
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
        </InspectorInline>
        <InspectorPair>
          <InspectorSlider
            label="Stroke width"
            value={s.descriptionStrokeWidth}
            onChange={(v) => set('descriptionStrokeWidth', v)}
            min={0}
            max={12}
            step={1}
            unit="px"
            compact
          />
          <div className="inspector-checks inspector-checks-compact">
            <Chk
              label="Shadow"
              value={s.descriptionShadow}
              onChange={(v) => set('descriptionShadow', v)}
            />
          </div>
        </InspectorPair>
      </InspectorGroup>

      <InspectorGroup title="Text behavior">
        <InspectorPair>
          <InspectorSlider
            label="Letter spacing"
            value={s.descriptionLetterSpacing}
            onChange={(v) => set('descriptionLetterSpacing', v)}
            min={-5}
            max={20}
            step={1}
            unit="px"
          />
          <InspectorSlider
            label="Max lines"
            value={s.descriptionMaxLines}
            onChange={(v) => set('descriptionMaxLines', v)}
            min={1}
            max={8}
            step={1}
          />
        </InspectorPair>
        <AlignControl value={s.descriptionAlign} onChange={(v) => set('descriptionAlign', v)} />
        <div className="inspector-checks inspector-field-wide">
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
        </div>
      </InspectorGroup>
    </div>
  );
}

function PriceEditor({
  settings: s,
  allFonts,
  onChange,
  onPreviewPatch,
}: {
  settings: AppSettings;
  allFonts: string[];
  onChange: (patch: Partial<AppSettings>) => void;
  onPreviewPatch: (patch: Partial<AppSettings> | null) => void;
}) {
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    onChange({ [k]: v } as Partial<AppSettings>);
  return (
    <div className="inspector-stack">
      <InspectorGroup title="Typography">
        <div className="inspector-field inspector-field-wide">
          <label>Font family</label>
          <LiveFontSelect
            value={s.priceFont}
            onChange={(v) => set('priceFont', v)}
            onPreview={(v) => onPreviewPatch(v ? { priceFont: v } : null)}
            options={allFonts}
          />
        </div>
        <InspectorPair>
          <InspectorSlider
            label="Size"
            value={s.priceFontSize}
            onChange={(v) => set('priceFontSize', v)}
            min={8}
            max={180}
            step={1}
            unit="px"
          />
          <InspectorSlider
            label="Line height"
            value={s.priceLineHeight}
            onChange={(v) => set('priceLineHeight', v)}
            min={0.7}
            max={2.4}
            step={0.05}
          />
        </InspectorPair>
      </InspectorGroup>

      <InspectorGroup title="Appearance">
        <InspectorInline>
          <CF label="Color" value={s.priceColor} onChange={(v) => set('priceColor', v)} />
          <CF label="Stroke" value={s.priceStroke} onChange={(v) => set('priceStroke', v)} />
        </InspectorInline>
        <InspectorPair>
          <InspectorSlider
            label="Stroke width"
            value={s.priceStrokeWidth}
            onChange={(v) => set('priceStrokeWidth', v)}
            min={0}
            max={12}
            step={1}
            unit="px"
            compact
          />
          <div className="inspector-checks inspector-checks-compact">
            <Chk label="Shadow" value={s.priceShadow} onChange={(v) => set('priceShadow', v)} />
          </div>
        </InspectorPair>
      </InspectorGroup>

      <InspectorGroup title="Text behavior">
        <InspectorPair>
          <InspectorSlider
            label="Letter spacing"
            value={s.priceLetterSpacing}
            onChange={(v) => set('priceLetterSpacing', v)}
            min={-5}
            max={20}
            step={1}
            unit="px"
          />
          <div />
        </InspectorPair>
        <AlignControl value={s.priceAlign} onChange={(v) => set('priceAlign', v)} />
        <div className="inspector-checks inspector-field-wide">
          <Chk label="Bold" value={s.priceBold} onChange={(v) => set('priceBold', v)} />
        </div>
        <div className="inspector-field inspector-field-wide">
          <label>Price format ({'{price}'} for value)</label>
          <textarea
            rows={3}
            value={s.priceFormat}
            onChange={(e) => set('priceFormat', e.target.value)}
            style={{ resize: 'vertical', fontFamily: 'monospace' }}
          />
        </div>
      </InspectorGroup>
    </div>
  );
}

function InspectorGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="inspector-group">
      <div className="inspector-group-title">{title}</div>
      <div className="inspector-grid">{children}</div>
    </section>
  );
}

function InspectorInline({ children }: { children: React.ReactNode }) {
  return <div className="inspector-inline-grid inspector-field-wide">{children}</div>;
}

function InspectorPair({ children }: { children: React.ReactNode }) {
  return <div className="inspector-pair-grid inspector-field-wide">{children}</div>;
}

function InspectorSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  compact,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  compact?: boolean;
}) {
  const precision = step < 1 ? 2 : 0;
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const commit = (n: number) => {
    if (!Number.isFinite(n)) return;
    const next = Number(clamp(n).toFixed(precision));
    onChange(next);
  };
  const nudge = (dir: -1 | 1) => commit(value + step * dir);
  const id = `inspector-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const fill = `${((clamp(value) - min) / (max - min)) * 100}%`;

  return (
    <div className={'inspector-slider' + (compact ? ' inspector-slider-compact' : '')}>
      <div className="inspector-slider-header">
        <div className="inspector-slider-label-row">
          <label htmlFor={`${id}-range`} className="inspector-slider-label">{label}</label>
          {unit && <span className="inspector-unit">{unit}</span>}
        </div>
        <div className="inspector-slider-control-row">
          <div className="inspector-stepper" aria-label={`${label} step controls`}>
            <button type="button" className="secondary inspector-stepper-btn" onClick={() => nudge(-1)} aria-label={`Decrease ${label}`}>
              -
            </button>
            <button type="button" className="secondary inspector-stepper-btn" onClick={() => nudge(1)} aria-label={`Increase ${label}`}>
              +
            </button>
          </div>
          <input
            id={`${id}-value`}
            className="inspector-slider-value"
            aria-label={`${label} value`}
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => commit(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="inspector-slider-track">
        <input
          id={`${id}-range`}
          aria-labelledby={`${id}-value`}
          className="inspector-slider-track-input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ '--slider-fill': fill } as React.CSSProperties}
          onInput={(e) => commit(Number(e.currentTarget.value))}
          onChange={(e) => commit(Number(e.target.value))}
        />
      </div>
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
    <div className="inspector-field color-field">
      <label>{label}</label>
      <div className="color-input-shell">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <span>{value.toUpperCase()}</span>
        <button type="button" className="secondary" aria-label={`${label} palette`}>⌘</button>
      </div>
    </div>
  );
}

function AlignControl({
  value,
  onChange,
}: {
  value: 'left' | 'center' | 'right';
  onChange: (v: 'left' | 'center' | 'right') => void;
}) {
  return (
    <div className="align-field inspector-field-wide">
      <label>Align</label>
      <div className="segmented-control">
        {(['left', 'center', 'right'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={value === option ? 'active' : ''}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
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
    <label className="inspector-check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function LiveFontSelect({
  value,
  onChange,
  onPreview,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  onPreview: (v: string | null) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const previewFont = hovered || value;
  const list = !options.includes(value) ? [value, ...options] : options;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="font-picker" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="font-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        style={{ fontFamily: `'${previewFont}', sans-serif` }}
      >
        <span className="font-picker-name">{value}</span>
        <span className="font-picker-caret">v</span>
      </button>
      <div className="font-preview">
        <span
          className="font-preview-sample"
          style={{ fontFamily: `'${previewFont}', sans-serif` }}
        >
          AaBbCc 123
        </span>
        <span
          className="font-preview-name"
          style={{ fontFamily: `'${previewFont}', sans-serif` }}
        >
          {previewFont}
        </span>
      </div>
      {open && (
        <div
          className="font-menu"
          onMouseLeave={() => {
            setHovered(null);
            onPreview(null);
          }}
        >
          {list.slice(0, 160).map((font) => (
            <button
              key={font}
              type="button"
              className={'font-option ' + (font === value ? 'active' : '')}
              style={{ fontFamily: `'${font}', sans-serif` }}
              onMouseEnter={() => {
                setHovered(font);
                onPreview(font);
              }}
              onFocus={() => {
                setHovered(font);
                onPreview(font);
              }}
              onClick={() => {
                onChange(font);
                setOpen(false);
                setHovered(null);
                onPreview(null);
              }}
            >
              <span className="font-option-sample" style={{ fontFamily: `'${font}', sans-serif` }}>
                Aa
              </span>
              <span className="font-option-name">{font}</span>
            </button>
          ))}
        </div>
      )}
    </div>
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
          background: '#101827',
          border: '1px solid rgba(148, 163, 184, 0.18)',
          borderRadius: 4,
          fontFamily: `'${value}', sans-serif`,
          fontSize: 18,
          color: '#ffd166',
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
