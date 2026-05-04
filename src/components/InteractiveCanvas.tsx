import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, Box } from '../types';

type BuiltinBoxKey =
  | 'productBox'
  | 'headerBox'
  | 'descriptionBox'
  | 'priceBox'
  | 'descriptionTextBox'
  | 'priceTextBox';

type BoxKey = BuiltinBoxKey | string; // custom IDs use the element id

interface BoxDef {
  key: BoxKey;
  label: string;
  color: string;
  custom?: boolean;
}

const BUILTIN_BOXES: BoxDef[] = [
  { key: 'productBox', label: 'Product', color: '#60a5fa' },
  { key: 'headerBox', label: 'Header / Logo', color: '#fbbf24' },
  { key: 'descriptionBox', label: 'Description sign', color: '#34d399' },
  { key: 'priceBox', label: 'Price badge', color: '#f97316' },
  { key: 'descriptionTextBox', label: 'Description text', color: '#a78bfa' },
  { key: 'priceTextBox', label: 'Price text', color: '#f472b6' },
];

const CUSTOM_COLORS = ['#22d3ee', '#facc15', '#a3e635', '#fb7185', '#c084fc', '#f59e0b'];

export function getAllBoxes(settings: AppSettings): BoxDef[] {
  const customs = (settings.customElements || []).map((el, i) => ({
    key: el.id,
    label: el.label || (el.type === 'image' ? 'Custom image' : 'Custom text'),
    color: CUSTOM_COLORS[i % CUSTOM_COLORS.length],
    custom: true,
  }));
  return [...BUILTIN_BOXES, ...customs];
}

const BOXES = BUILTIN_BOXES; // kept for back-compat exports

function getBoxValue(settings: AppSettings, key: BoxKey): Box {
  if (BUILTIN_BOXES.some((b) => b.key === key)) return (settings as any)[key];
  const el = settings.customElements?.find((e) => e.id === key);
  return el?.box ?? { x: 0, y: 0, width: 100, height: 100 };
}

function makeBoxPatch(settings: AppSettings, key: BoxKey, box: Box): Partial<AppSettings> {
  if (BUILTIN_BOXES.some((b) => b.key === key)) {
    return { [key]: box } as Partial<AppSettings>;
  }
  return {
    customElements: (settings.customElements || []).map((e) =>
      e.id === key ? { ...e, box } : e,
    ),
  };
}

interface Props {
  settings: AppSettings;
  previewDataUrl: string | null;
  productImagePath?: string | null;
  liveDescription?: string;
  livePrice?: string;
  onChange: (patch: Partial<AppSettings>) => void;
  /** Called once at the start of a drag — parent should snapshot for undo. */
  onCommitHistory?: () => void;
  active: BoxKey | null;
  onActiveChange: (k: BoxKey | null) => void;
  visible: Record<BoxKey, boolean>;
  onVisibleChange: (v: Record<BoxKey, boolean>) => void;
  /** Available drawing area; canvas scales to fit. */
  maxWidth?: number;
  maxHeight?: number;
  /** Hide the built-in toolbar (parent renders its own). */
  hideToolbar?: boolean;
  showGuides?: boolean;
  resetZoomSignal?: number;
  onZoomChange?: (zoom: number) => void;
  snapEnabled?: boolean;
  onTelemetry?: (t: {
    source: 'editor-preview' | 'export-preview';
    pending: number;
    dropped: number;
    cacheSize: number;
    lastLoadMs: number;
  }) => void;
}

export { BOXES };
export type { BoxKey };

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

interface DragState {
  key: BoxKey;
  mode: DragMode;
  startX: number;
  startY: number;
  startBox: Box;
  startFontSize?: number;
}

export function InteractiveCanvas({
  settings,
  previewDataUrl,
  productImagePath,
  liveDescription,
  livePrice,
  onChange,
  onCommitHistory,
  active,
  onActiveChange,
  visible,
  onVisibleChange,
  maxWidth,
  maxHeight,
  hideToolbar,
  showGuides = true,
  resetZoomSignal,
  onZoomChange,
  snapEnabled = true,
  onTelemetry,
}: Props) {
  const PAN_GUTTER = 320;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState({ w: 800, h: 800 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<DragState | null>(null);
  const setActive = onActiveChange;
  const setVisible = onVisibleChange;
  const [baseImages, setBaseImages] = useState<Record<string, string | null>>({});
  const baseImagesRef = useRef<Record<string, string | null>>({});
  const [telemetry, setTelemetry] = useState({
    source: 'editor-preview' as const,
    pending: 0,
    dropped: 0,
    cacheSize: 0,
    lastLoadMs: 0,
  });
  const [snapGuides, setSnapGuides] = useState<Array<{ axis: 'x' | 'y'; value: number }>>([]);
  const jobRef = useRef(0);
  const queuedPatchRef = useRef<Partial<AppSettings> | null>(null);
  const rafRef = useRef<number | null>(null);

  // Fit canvas to available space (contain)
  useEffect(() => {
    const update = () => {
      const containerW = maxWidth ?? (wrapRef.current ? wrapRef.current.clientWidth - 16 : 800);
      const containerH = maxHeight ?? window.innerHeight - 200;
      const ratio = settings.canvasWidth / settings.canvasHeight;
      let w = containerW;
      let h = w / ratio;
      if (h > containerH) {
        h = containerH;
        w = h * ratio;
      }
      setDisplaySize({ w, h });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [maxWidth, maxHeight, settings.canvasWidth, settings.canvasHeight]);

  const displayWidth = displaySize.w * zoom;
  const displayHeight = displaySize.h * zoom;
  const scale = displayWidth / settings.canvasWidth;

  useEffect(() => {
    onZoomChange?.(zoom);
  }, [zoom, onZoomChange]);

  useEffect(() => {
    setZoom(1);
    requestAnimationFrame(() => {
      const scroller = wrapRef.current?.parentElement;
      if (!scroller) return;
      scroller.scrollLeft = Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
      scroller.scrollTop = Math.max(0, (scroller.scrollHeight - scroller.clientHeight) / 2);
    });
  }, [resetZoomSignal]);

  useEffect(() => {
    baseImagesRef.current = baseImages;
  }, [baseImages]);

  useEffect(() => {
    let cancelled = false;
    const jobId = ++jobRef.current;
    const mode: 'editor-preview' | 'export-preview' = productImagePath
      ? 'editor-preview'
      : 'export-preview';
    const paths = [
      productImagePath || '',
      settings.headerOverlay,
      settings.descriptionOverlay,
      settings.priceOverlay,
    ].filter(Boolean);

    setBaseImages((prev) => {
      const keep = new Set(paths);
      const next = Object.fromEntries(
        Object.entries(prev).filter(([path]) => keep.has(path)),
      ) as Record<string, string | null>;
      baseImagesRef.current = next;
      setTelemetry((t) => ({ ...t, source: mode, cacheSize: Object.keys(next).length }));
      return next;
    });

    const missing = paths.filter((p) => baseImagesRef.current[p] === undefined);
    setTelemetry((t) => ({
      ...t,
      source: mode,
      pending: missing.length,
      cacheSize: Object.keys(baseImagesRef.current).length,
    }));

    for (const p of paths) {
      if (baseImagesRef.current[p] !== undefined) continue;
      const started = performance.now();
      window.api.readFileAsDataUrl(p).then((url) => {
        if (cancelled || jobId !== jobRef.current) {
          setTelemetry((t) => ({ ...t, dropped: t.dropped + 1 }));
          return;
        }
        setBaseImages((prev) => {
          if (prev[p] !== undefined) return prev;
          const next = { ...prev, [p]: url };
          baseImagesRef.current = next;
          setTelemetry((t) => ({
            ...t,
            pending: Math.max(0, t.pending - 1),
            lastLoadMs: Math.round(performance.now() - started),
            cacheSize: Object.keys(next).length,
          }));
          return next;
        });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [
    productImagePath,
    settings.headerOverlay,
    settings.descriptionOverlay,
    settings.priceOverlay,
  ]);

  useEffect(() => {
    onTelemetry?.(telemetry);
  }, [telemetry, onTelemetry]);

  const schedulePatch = (patch: Partial<AppSettings>) => {
    queuedPatchRef.current = patch;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const queued = queuedPatchRef.current;
      queuedPatchRef.current = null;
      if (queued) onChange(queued);
    });
  };

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  // Mouse handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / scale;
      const dy = (e.clientY - d.startY) / scale;
      let next = computeNextBox(d.startBox, d.mode, dx, dy);
      let guides: Array<{ axis: 'x' | 'y'; value: number }> = [];
      if (snapEnabled && d.mode === 'move') {
        const snapped = snapMoveBox(next, d.key, settings);
        next = snapped.box;
        guides = snapped.guides;
      } else {
        if (snapEnabled) {
          const snapped = snapResizeBox(next, d.key, d.mode, settings);
          next = snapped.box;
          guides = snapped.guides;
        }
      }
      setSnapGuides(guides);
      const patch: Partial<AppSettings> = makeBoxPatch(settings, d.key, next);
      // Resizing a text box scales the font size with box height
      if (d.mode !== 'move' && d.startFontSize && d.startBox.height > 0) {
        const factor = next.height / d.startBox.height;
        const newSize = Math.max(6, Math.round(d.startFontSize * factor));
        if (d.key === 'descriptionTextBox') {
          (patch as any).descriptionFontSize = newSize;
        } else if (d.key === 'priceTextBox') {
          (patch as any).priceFontSize = newSize;
        } else {
          // Custom text element — scale its fontSize too
          const el = settings.customElements?.find((c) => c.id === d.key);
          if (el && el.type === 'text') {
            const elements = patch.customElements || settings.customElements || [];
            patch.customElements = elements.map((c) =>
              c.id === d.key ? { ...c, fontSize: newSize } : c,
            );
          }
        }
      }
      schedulePatch(patch);
    };
    const onUp = () => {
      dragRef.current = null;
      setSnapGuides([]);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [scale, settings]);

  const startDrag = (key: BoxKey, mode: DragMode, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setActive(key);
    onCommitHistory?.();
    let startFontSize: number | undefined;
    if (key === 'descriptionTextBox') startFontSize = settings.descriptionFontSize;
    else if (key === 'priceTextBox') startFontSize = settings.priceFontSize;
    else {
      const el = settings.customElements?.find((c) => c.id === key);
      if (el?.type === 'text') startFontSize = el.fontSize ?? 32;
    }
    dragRef.current = {
      key,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startBox: { ...getBoxValue(settings, key) },
      startFontSize,
    };
  };

  // Nudge active box with arrow keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active) return;
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      )
        return;
      const step = e.shiftKey ? 10 : 1;
      const b = getBoxValue(settings, active);
      let nb = b;
      if (e.key === 'ArrowLeft') nb = { ...b, x: b.x - step };
      else if (e.key === 'ArrowRight') nb = { ...b, x: b.x + step };
      else if (e.key === 'ArrowUp') nb = { ...b, y: b.y - step };
      else if (e.key === 'ArrowDown') nb = { ...b, y: b.y + step };
      else return;
      e.preventDefault();
      onCommitHistory?.();
      onChange(makeBoxPatch(settings, active, nb));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, settings, onChange]);

  const activeBox = active ? settings[active] : null;

  const isEditorPreview = !!productImagePath;
  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((z) => Math.min(4, Math.max(0.25, z * factor)));
  };

  return (
    <div ref={wrapRef} onWheel={handleWheelZoom} style={{ minWidth: '100%', minHeight: '100%' }}>
      {!hideToolbar && (
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <span className="muted">Show / edit:</span>
        {getAllBoxes(settings).map((b) => (
          <label
            key={b.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              borderRadius: 4,
              background: active === b.key ? '#374151' : 'transparent',
              cursor: 'pointer',
              borderLeft: `3px solid ${b.color}`,
            }}
            onClick={() => setActive(b.key)}
          >
            <input
              type="checkbox"
              checked={visible[b.key]}
              onChange={(e) => setVisible({ ...visible, [b.key]: e.target.checked })}
              onClick={(e) => e.stopPropagation()}
            />
            <span style={{ fontSize: 12 }}>{b.label}</span>
          </label>
        ))}
      </div>
      )}

        <div
          style={{
            minWidth: '100%',
            minHeight: '100%',
            width: 'max-content',
            height: 'max-content',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: PAN_GUTTER,
            boxSizing: 'content-box',
          }}
        >
        <div
          style={{
            position: 'relative',
            width: displayWidth,
            height: displayHeight,
            background: '#fff',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            userSelect: 'none',
            flex: '0 0 auto',
          }}
        >
        {isEditorPreview ? (
          <EditorBase
            settings={settings}
            scale={scale}
            productUrl={baseImages[productImagePath] || null}
            headerUrl={baseImages[settings.headerOverlay] || null}
            descriptionUrl={baseImages[settings.descriptionOverlay] || null}
            priceUrl={baseImages[settings.priceOverlay] || null}
          />
        ) : previewDataUrl ? (
          <img
            src={previewDataUrl}
            alt="preview"
            draggable={false}
            style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
          />
        ) : null}
        {isEditorPreview && visible.descriptionTextBox !== false && liveDescription && (
          <LiveTextLayer
            box={settings.descriptionTextBox}
            scale={scale}
            text={settings.descriptionUppercase ? liveDescription.toUpperCase() : liveDescription}
            font={settings.descriptionFont}
            fontSize={settings.descriptionFontSize}
            lineHeight={settings.descriptionLineHeight}
            letterSpacing={settings.descriptionLetterSpacing}
            color={settings.descriptionColor}
            stroke={settings.descriptionStroke}
            strokeWidth={settings.descriptionStrokeWidth}
            outline={settings.descriptionOutline}
            outlineWidth={settings.descriptionOutlineWidth}
            shadow={settings.descriptionShadow}
            align={settings.descriptionAlign}
            bold={settings.descriptionBold}
            maxLines={settings.descriptionMaxLines}
            autoFit={settings.descriptionAutoFit}
            ellipsis={settings.descriptionEllipsis}
          />
        )}
        {isEditorPreview && visible.priceTextBox !== false && livePrice && (
          <LiveTextLayer
            box={settings.priceTextBox}
            scale={scale}
            text={(settings.priceFormat || '{price}').replace('{price}', livePrice)}
            font={settings.priceFont}
            fontSize={settings.priceFontSize}
            lineHeight={settings.priceLineHeight}
            letterSpacing={settings.priceLetterSpacing}
            color={settings.priceColor}
            stroke={settings.priceStroke}
            strokeWidth={settings.priceStrokeWidth}
            outline={settings.priceOutline}
            outlineWidth={settings.priceOutlineWidth}
            shadow={settings.priceShadow}
            align={settings.priceAlign}
            bold={settings.priceBold}
            maxLines={3}
            autoFit
            ellipsis={false}
          />
        )}
        {snapEnabled &&
          snapGuides.map((g, i) => (
            <div
              key={`${g.axis}-${g.value}-${i}`}
              style={{
                position: 'absolute',
                pointerEvents: 'none',
                zIndex: 2,
                ...(g.axis === 'x'
                  ? {
                      left: g.value * scale,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: 'rgba(56, 189, 248, 0.95)',
                      boxShadow: '0 0 0 1px rgba(56, 189, 248, 0.25)',
                    }
                  : {
                      top: g.value * scale,
                      left: 0,
                      right: 0,
                      height: 1,
                      background: 'rgba(56, 189, 248, 0.95)',
                      boxShadow: '0 0 0 1px rgba(56, 189, 248, 0.25)',
                    }),
              }}
            />
          ))}
        {showGuides &&
          getAllBoxes(settings)
          .filter((b) => visible[b.key] !== false)
          .map((b) => {
          const box = getBoxValue(settings, b.key);
          const isActive = active === b.key;
          return (
            <div
              key={b.key}
              onMouseDown={(e) => startDrag(b.key, 'move', e)}
              style={{
                position: 'absolute',
                left: box.x * scale,
                top: box.y * scale,
                width: box.width * scale,
                height: box.height * scale,
                border: `2px ${isActive ? 'solid' : 'dashed'} ${b.color}`,
                background: isActive ? `${b.color}22` : 'transparent',
                cursor: 'move',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -22,
                  left: 0,
                  background: b.color,
                  color: '#111827',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                {b.label}
              </div>
              {isActive && <ResizeHandles boxKey={b.key} color={b.color} startDrag={startDrag} />}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

function snapMoveBox(
  box: Box,
  activeKey: BoxKey,
  settings: AppSettings,
): { box: Box; guides: Array<{ axis: 'x' | 'y'; value: number }> } {
  const SNAP = 8; // canvas pixels
  const guidesX: number[] = [0, settings.canvasWidth / 2, settings.canvasWidth];
  const guidesY: number[] = [0, settings.canvasHeight / 2, settings.canvasHeight];

  for (const def of getAllBoxes(settings)) {
    if (def.key === activeKey) continue;
    const b = getBoxValue(settings, def.key);
    guidesX.push(b.x, b.x + b.width / 2, b.x + b.width);
    guidesY.push(b.y, b.y + b.height / 2, b.y + b.height);
  }

  const left = box.x;
  const centerX = box.x + box.width / 2;
  const right = box.x + box.width;
  const top = box.y;
  const centerY = box.y + box.height / 2;
  const bottom = box.y + box.height;

  const snapX = pickBestSnap([left, centerX, right], guidesX, SNAP);
  const snapY = pickBestSnap([top, centerY, bottom], guidesY, SNAP);

  return {
    box: {
      ...box,
      x: Math.round(box.x + snapX.delta),
      y: Math.round(box.y + snapY.delta),
    },
    guides: [
      ...(snapX.guide !== null ? [{ axis: 'x' as const, value: snapX.guide }] : []),
      ...(snapY.guide !== null ? [{ axis: 'y' as const, value: snapY.guide }] : []),
    ],
  };
}

function pickBestSnap(
  points: number[],
  guides: number[],
  threshold: number,
): { delta: number; guide: number | null } {
  let bestDelta = 0;
  let bestGuide: number | null = null;
  let bestAbs = threshold + 1;
  for (const p of points) {
    for (const g of guides) {
      const d = g - p;
      const ad = Math.abs(d);
      if (ad <= threshold && ad < bestAbs) {
        bestDelta = d;
        bestGuide = g;
        bestAbs = ad;
      }
    }
  }
  if (bestAbs <= threshold) return { delta: bestDelta, guide: bestGuide };
  return { delta: 0, guide: null };
}

function snapResizeBox(
  box: Box,
  activeKey: BoxKey,
  mode: DragMode,
  settings: AppSettings,
): { box: Box; guides: Array<{ axis: 'x' | 'y'; value: number }> } {
  const SNAP = 8; // canvas pixels
  const MIN_SIZE = 10;
  const outGuides: Array<{ axis: 'x' | 'y'; value: number }> = [];

  const guidesX: number[] = [0, settings.canvasWidth / 2, settings.canvasWidth];
  const guidesY: number[] = [0, settings.canvasHeight / 2, settings.canvasHeight];
  for (const def of getAllBoxes(settings)) {
    if (def.key === activeKey) continue;
    const b = getBoxValue(settings, def.key);
    guidesX.push(b.x, b.x + b.width / 2, b.x + b.width);
    guidesY.push(b.y, b.y + b.height / 2, b.y + b.height);
  }

  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;

  const movesLeft = mode === 'nw' || mode === 'sw' || mode === 'w';
  const movesRight = mode === 'ne' || mode === 'se' || mode === 'e';
  const movesTop = mode === 'nw' || mode === 'ne' || mode === 'n';
  const movesBottom = mode === 'sw' || mode === 'se' || mode === 's';

  if (movesLeft) {
    const s = pickBestSnap([left], guidesX, SNAP);
    if (s.delta) {
      left += s.delta;
      if (s.guide !== null) outGuides.push({ axis: 'x', value: s.guide });
    }
  }
  if (movesRight) {
    const s = pickBestSnap([right], guidesX, SNAP);
    if (s.delta) {
      right += s.delta;
      if (s.guide !== null) outGuides.push({ axis: 'x', value: s.guide });
    }
  }
  if (movesTop) {
    const s = pickBestSnap([top], guidesY, SNAP);
    if (s.delta) {
      top += s.delta;
      if (s.guide !== null) outGuides.push({ axis: 'y', value: s.guide });
    }
  }
  if (movesBottom) {
    const s = pickBestSnap([bottom], guidesY, SNAP);
    if (s.delta) {
      bottom += s.delta;
      if (s.guide !== null) outGuides.push({ axis: 'y', value: s.guide });
    }
  }

  // Keep minimum dimensions while preserving the anchored side.
  if (right - left < MIN_SIZE) {
    if (movesLeft && !movesRight) left = right - MIN_SIZE;
    else right = left + MIN_SIZE;
  }
  if (bottom - top < MIN_SIZE) {
    if (movesTop && !movesBottom) top = bottom - MIN_SIZE;
    else bottom = top + MIN_SIZE;
  }

  return {
    box: {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top),
    },
    guides: outGuides,
  };
}

function LiveTextLayer({
  box,
  scale,
  text,
  font,
  fontSize,
  lineHeight,
  letterSpacing,
  color,
  stroke,
  strokeWidth,
  outline,
  outlineWidth,
  shadow,
  align,
  bold,
  maxLines,
  autoFit,
  ellipsis,
}: {
  box: Box;
  scale: number;
  text: string;
  font: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  stroke: string;
  strokeWidth: number;
  outline: string;
  outlineWidth: number;
  shadow: boolean;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  maxLines: number;
  autoFit: boolean;
  ellipsis: boolean;
}) {
  const W = Math.max(1, box.width);
  const H = Math.max(1, box.height);
  const layout = layoutTextLines({
    text,
    width: W,
    height: H,
    fontSize,
    lineHeight,
    letterSpacing,
    bold,
    maxLines,
    autoFit,
    ellipsis,
    strokeWidth,
    outlineWidth,
  });
  const lines = layout.lines;
  const lineH = layout.lineH;
  const drawFontSize = layout.fontSize;
  const visualPad = Math.max(strokeWidth, outlineWidth) + 2;
  const availableH = Math.max(1, H - visualPad * 2);
  const centerY = visualPad + availableH / 2;
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const x = align === 'left' ? 0 : align === 'right' ? W : W / 2;

  return (
    <svg
      width={W * scale}
      height={H * scale}
      viewBox={`0 0 ${W} ${H}`}
      style={{
        position: 'absolute',
        left: box.x * scale,
        top: box.y * scale,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      {shadow && (
        <defs>
          <filter id={`shadow-${box.x}-${box.y}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
            <feOffset dx="2" dy="2" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.55" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      {lines.map((line, i) => (
        <g key={`${line}-${i}`}>
          {outlineWidth > 0 && (
            <text
              x={x}
              y={centerY + (i - (lines.length - 1) / 2) * lineH}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontFamily={`'${font}', sans-serif`}
              fontSize={drawFontSize}
              fontWeight={bold ? 800 : 400}
              letterSpacing={letterSpacing}
              fill="none"
              stroke={outline}
              strokeWidth={outlineWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              filter={shadow ? `url(#shadow-${box.x}-${box.y})` : undefined}
              xmlSpace="preserve"
            >
              {toSvgText(line)}
            </text>
          )}
          <text
            x={x}
            y={centerY + (i - (lines.length - 1) / 2) * lineH}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontFamily={`'${font}', sans-serif`}
            fontSize={drawFontSize}
            fontWeight={bold ? 800 : 400}
            letterSpacing={letterSpacing}
            fill={color}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
            paintOrder="stroke"
            filter={shadow ? `url(#shadow-${box.x}-${box.y})` : undefined}
            xmlSpace="preserve"
          >
            {toSvgText(line)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function toSvgText(line: string): string {
  // Use nbsp to avoid browsers/fonts collapsing or swallowing regular spaces.
  return line.replace(/ /g, '\u00A0');
}

function approxCharWidth(fontSize: number, bold: boolean): number {
  return fontSize * (bold ? 0.58 : 0.52);
}

function measureTextWidth(
  text: string,
  fontSize: number,
  letterSpacing: number,
  bold: boolean,
): number {
  return text.length * (approxCharWidth(fontSize, bold) + letterSpacing);
}

function wrapTextLines(
  text: string,
  width: number,
  fontSize: number,
  letterSpacing: number,
  bold: boolean,
): string[] {
  const paragraphs = text.split(/\n/);
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    let current = '';
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      if (measureTextWidth(candidate, fontSize, letterSpacing, bold) <= width) current = candidate;
      else {
        if (current) out.push(current);
        current = w;
      }
    }
    if (current) out.push(current);
    if (words.length === 0) out.push('');
  }
  return out;
}

function linesTooTall(count: number, fontSize: number, lineHeight: number, boxH: number, pad: number): boolean {
  return count * fontSize * lineHeight > Math.max(1, boxH - pad * 2);
}

function truncateWithEllipsis(
  line: string,
  width: number,
  fontSize: number,
  letterSpacing: number,
  bold: boolean,
): string {
  let s = line;
  while (s.length > 1 && measureTextWidth(`${s}...`, fontSize, letterSpacing, bold) > width) {
    s = s.slice(0, -1);
  }
  return `${s}...`;
}

function layoutTextLines(opts: {
  text: string;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  bold: boolean;
  maxLines: number;
  autoFit: boolean;
  ellipsis: boolean;
  strokeWidth: number;
  outlineWidth: number;
}): { lines: string[]; fontSize: number; lineH: number } {
  let size = opts.fontSize;
  const visualPad = Math.max(opts.strokeWidth, opts.outlineWidth) + 2;
  let lines = wrapTextLines(opts.text, opts.width, size, opts.letterSpacing, opts.bold);
  if (opts.autoFit) {
    while (
      (lines.length > opts.maxLines ||
        linesTooTall(lines.length, size, opts.lineHeight, opts.height, visualPad)) &&
      size > 8
    ) {
      size -= 2;
      lines = wrapTextLines(opts.text, opts.width, size, opts.letterSpacing, opts.bold);
    }
  }
  if (lines.length > opts.maxLines) {
    lines = lines.slice(0, opts.maxLines);
    if (opts.ellipsis && lines.length > 0) {
      lines[lines.length - 1] = truncateWithEllipsis(
        lines[lines.length - 1],
        opts.width,
        size,
        opts.letterSpacing,
        opts.bold,
      );
    }
  }
  return { lines, fontSize: size, lineH: size * opts.lineHeight };
}

function EditorBase({
  settings,
  scale,
  productUrl,
  headerUrl,
  descriptionUrl,
  priceUrl,
}: {
  settings: AppSettings;
  scale: number;
  productUrl: string | null;
  headerUrl: string | null;
  descriptionUrl: string | null;
  priceUrl: string | null;
}) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#fff',
          pointerEvents: 'none',
        }}
      />
      {productUrl && (
        <img
          src={productUrl}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: settings.productBox.x * scale,
            top: settings.productBox.y * scale,
            width: settings.productBox.width * scale,
            height: settings.productBox.height * scale,
            objectFit: 'cover',
            pointerEvents: 'none',
          }}
        />
      )}
      <BaseOverlay url={headerUrl} box={settings.headerBox} scale={scale} />
      <BaseOverlay url={descriptionUrl} box={settings.descriptionBox} scale={scale} />
      <BaseOverlay url={priceUrl} box={settings.priceBox} scale={scale} />
    </>
  );
}

function BaseOverlay({
  url,
  box,
  scale,
}: {
  url: string | null;
  box: Box;
  scale: number;
}) {
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: box.x * scale,
        top: box.y * scale,
        width: box.width * scale,
        height: box.height * scale,
        objectFit: 'contain',
        pointerEvents: 'none',
      }}
    />
  );
}

function ResizeHandles({
  boxKey,
  color,
  startDrag,
}: {
  boxKey: BoxKey;
  color: string;
  startDrag: (k: BoxKey, m: DragMode, e: React.MouseEvent) => void;
}) {
  const SZ = 20;
  const OFF = -SZ / 2;
  const handles: { mode: DragMode; style: React.CSSProperties; cursor: string }[] = [
    { mode: 'nw', style: { top: OFF, left: OFF }, cursor: 'nwse-resize' },
    { mode: 'ne', style: { top: OFF, right: OFF }, cursor: 'nesw-resize' },
    { mode: 'sw', style: { bottom: OFF, left: OFF }, cursor: 'nesw-resize' },
    { mode: 'se', style: { bottom: OFF, right: OFF }, cursor: 'nwse-resize' },
    { mode: 'n', style: { top: OFF, left: '50%', marginLeft: OFF }, cursor: 'ns-resize' },
    { mode: 's', style: { bottom: OFF, left: '50%', marginLeft: OFF }, cursor: 'ns-resize' },
    { mode: 'w', style: { top: '50%', left: OFF, marginTop: OFF }, cursor: 'ew-resize' },
    { mode: 'e', style: { top: '50%', right: OFF, marginTop: OFF }, cursor: 'ew-resize' },
  ];
  return (
    <>
      {handles.map((h) => (
        <div
          key={h.mode}
          onMouseDown={(e) => startDrag(boxKey, h.mode, e)}
          style={{
            position: 'absolute',
            width: SZ,
            height: SZ,
            background: color,
            border: '3px solid #111827',
            borderRadius: 4,
            cursor: h.cursor,
            boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
            zIndex: 10,
            ...h.style,
          }}
        />
      ))}
    </>
  );
}

function computeNextBox(start: Box, mode: DragMode, dx: number, dy: number): Box {
  const b = { ...start };
  const round = Math.round;
  const minSize = 10;
  switch (mode) {
    case 'move':
      b.x = round(start.x + dx);
      b.y = round(start.y + dy);
      break;
    case 'nw':
      b.x = round(start.x + dx);
      b.y = round(start.y + dy);
      b.width = Math.max(minSize, round(start.width - dx));
      b.height = Math.max(minSize, round(start.height - dy));
      break;
    case 'ne':
      b.y = round(start.y + dy);
      b.width = Math.max(minSize, round(start.width + dx));
      b.height = Math.max(minSize, round(start.height - dy));
      break;
    case 'sw':
      b.x = round(start.x + dx);
      b.width = Math.max(minSize, round(start.width - dx));
      b.height = Math.max(minSize, round(start.height + dy));
      break;
    case 'se':
      b.width = Math.max(minSize, round(start.width + dx));
      b.height = Math.max(minSize, round(start.height + dy));
      break;
    case 'n':
      b.y = round(start.y + dy);
      b.height = Math.max(minSize, round(start.height - dy));
      break;
    case 's':
      b.height = Math.max(minSize, round(start.height + dy));
      break;
    case 'w':
      b.x = round(start.x + dx);
      b.width = Math.max(minSize, round(start.width - dx));
      break;
    case 'e':
      b.width = Math.max(minSize, round(start.width + dx));
      break;
  }
  return b;
}

function NumberInline({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
      <span style={{ color: '#9ca3af', fontSize: 11 }}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 70 }}
      />
    </label>
  );
}
