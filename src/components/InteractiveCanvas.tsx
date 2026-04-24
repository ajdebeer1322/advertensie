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
  onChange,
  onCommitHistory,
  active,
  onActiveChange,
  visible,
  onVisibleChange,
  maxWidth,
  maxHeight,
  hideToolbar,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = useState({ w: 800, h: 800 });
  const dragRef = useRef<DragState | null>(null);
  const setActive = onActiveChange;
  const setVisible = onVisibleChange;

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

  const displayWidth = displaySize.w;
  const displayHeight = displaySize.h;
  const scale = displayWidth / settings.canvasWidth;

  // Mouse handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / scale;
      const dy = (e.clientY - d.startY) / scale;
      const next = computeNextBox(d.startBox, d.mode, dx, dy);
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
      onChange(patch);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [scale, onChange]);

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

  return (
    <div ref={wrapRef}>
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
          position: 'relative',
          width: displayWidth,
          height: displayHeight,
          margin: '0 auto',
          background: '#fff',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          userSelect: 'none',
        }}
      >
        {previewDataUrl && (
          <img
            src={previewDataUrl}
            alt="preview"
            draggable={false}
            style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
          />
        )}
        {getAllBoxes(settings)
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
