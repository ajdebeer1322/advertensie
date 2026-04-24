import React, { useState } from 'react';
import type { AppSettings } from '../types';

interface Props {
  settings: AppSettings;
  allFonts: string[];
  onChange: (patch: Partial<AppSettings>) => void;
}

export function QuickTextControls({ settings: s, allFonts, onChange }: Props) {
  const [open, setOpen] = useState<'desc' | 'price' | null>('desc');

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    onChange({ [k]: v } as Partial<AppSettings>);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button
          className={open === 'desc' ? '' : 'secondary'}
          onClick={() => setOpen(open === 'desc' ? null : 'desc')}
          style={{ flex: 1 }}
        >
          📝 Description text {open === 'desc' ? '▾' : '▸'}
        </button>
        <button
          className={open === 'price' ? '' : 'secondary'}
          onClick={() => setOpen(open === 'price' ? null : 'price')}
          style={{ flex: 1 }}
        >
          💰 Price text {open === 'price' ? '▾' : '▸'}
        </button>
      </div>

      {open === 'desc' && (
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="field-grid-3">
            <Row label="Font">
              <FontSelect
                value={s.descriptionFont}
                onChange={(v) => set('descriptionFont', v)}
                options={allFonts}
              />
            </Row>
            <Row label="Size">
              <Num value={s.descriptionFontSize} onChange={(v) => set('descriptionFontSize', v)} />
            </Row>
            <Row label="Line height">
              <Num
                step={0.1}
                value={s.descriptionLineHeight}
                onChange={(v) => set('descriptionLineHeight', v)}
              />
            </Row>
            <Row label="Letter spacing">
              <Num
                value={s.descriptionLetterSpacing}
                onChange={(v) => set('descriptionLetterSpacing', v)}
              />
            </Row>
            <Row label="Color">
              <input
                type="color"
                value={s.descriptionColor}
                onChange={(e) => set('descriptionColor', e.target.value)}
              />
            </Row>
            <Row label="Stroke color">
              <input
                type="color"
                value={s.descriptionStroke}
                onChange={(e) => set('descriptionStroke', e.target.value)}
              />
            </Row>
            <Row label="Stroke width">
              <Num
                value={s.descriptionStrokeWidth}
                onChange={(v) => set('descriptionStrokeWidth', v)}
              />
            </Row>
            <Row label="Align">
              <select
                value={s.descriptionAlign}
                onChange={(e) => set('descriptionAlign', e.target.value as any)}
              >
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </Row>
            <Row label="Max lines (wrap)">
              <Num
                value={s.descriptionMaxLines}
                onChange={(v) => set('descriptionMaxLines', v)}
              />
            </Row>
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
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
      )}

      {open === 'price' && (
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="field-grid-3">
            <Row label="Font">
              <FontSelect
                value={s.priceFont}
                onChange={(v) => set('priceFont', v)}
                options={allFonts}
              />
            </Row>
            <Row label="Size">
              <Num value={s.priceFontSize} onChange={(v) => set('priceFontSize', v)} />
            </Row>
            <Row label="Line height">
              <Num
                step={0.1}
                value={s.priceLineHeight}
                onChange={(v) => set('priceLineHeight', v)}
              />
            </Row>
            <Row label="Letter spacing">
              <Num
                value={s.priceLetterSpacing}
                onChange={(v) => set('priceLetterSpacing', v)}
              />
            </Row>
            <Row label="Color">
              <input
                type="color"
                value={s.priceColor}
                onChange={(e) => set('priceColor', e.target.value)}
              />
            </Row>
            <Row label="Stroke color">
              <input
                type="color"
                value={s.priceStroke}
                onChange={(e) => set('priceStroke', e.target.value)}
              />
            </Row>
            <Row label="Stroke width">
              <Num
                value={s.priceStrokeWidth}
                onChange={(v) => set('priceStrokeWidth', v)}
              />
            </Row>
            <Row label="Align">
              <select
                value={s.priceAlign}
                onChange={(e) => set('priceAlign', e.target.value as any)}
              >
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </Row>
            <Row label="Price format">
              <input
                type="text"
                value={s.priceFormat}
                onChange={(e) => set('priceFormat', e.target.value)}
              />
            </Row>
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <Chk label="Bold" value={s.priceBold} onChange={(v) => set('priceBold', v)} />
            <Chk label="Shadow" value={s.priceShadow} onChange={(v) => set('priceShadow', v)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label>{label}</label>
      {children}
    </div>
  );
}

function Num({
  value,
  onChange,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      step={step ?? 1}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
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
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {!options.includes(value) && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
