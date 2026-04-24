import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface AppSettings {
  // Sheets
  sheetUrl: string;
  worksheet: string;
  keyColumn: string;
  descriptionColumn: string;
  priceColumn: string;
  caseSensitiveMatch: boolean;
  dataSource: 'sheet' | 'none' | 'demo';
  demoDescription: string;
  demoPrice: string;

  // Folders
  productFolder: string;
  outputFolder: string;
  fontsFolder: string;

  // Overlays
  headerOverlay: string;
  descriptionOverlay: string;
  priceOverlay: string;

  // Canvas
  canvasWidth: number;
  canvasHeight: number;

  // Layout boxes (px in canvas coords)
  productBox: Box;
  headerBox: Box;
  descriptionBox: Box; // overlay placement
  priceBox: Box;       // overlay placement

  // Text boxes (relative — independent of overlay placement so user can align text)
  descriptionTextBox: Box;
  priceTextBox: Box;

  // Description text settings
  descriptionFont: string;
  descriptionFontSize: number;
  descriptionLineHeight: number;
  descriptionLetterSpacing: number;
  descriptionColor: string;
  descriptionStroke: string;
  descriptionStrokeWidth: number;
  descriptionShadow: boolean;
  descriptionAlign: 'left' | 'center' | 'right';
  descriptionUppercase: boolean;
  descriptionBold: boolean;
  descriptionMaxLines: number;
  descriptionAutoFit: boolean;
  descriptionEllipsis: boolean;

  // Price text settings
  priceFont: string;
  priceFontSize: number;
  priceLineHeight: number;
  priceLetterSpacing: number;
  priceColor: string;
  priceStroke: string;
  priceStrokeWidth: number;
  priceShadow: boolean;
  priceAlign: 'left' | 'center' | 'right';
  priceBold: boolean;
  priceFormat: string; // e.g. "FROM R{price}"

  // Export
  exportFormat: 'png' | 'jpg';
  exportQuality: number;
  filenamePattern: string; // e.g. "{image_name}-promo.{ext}"

  // Extra dynamic elements (text or image) added by the user
  customElements: CustomElement[];

  /** Per-image overrides keyed by image filename (without extension).
   * Each entry is a partial settings object that overrides global settings
   * for just that one product image. */
  overrides: Record<string, Partial<AppSettings>>;
}

export interface CustomElement {
  id: string;
  type: 'text' | 'image';
  label: string;
  enabled: boolean;
  box: Box;

  // Text fields
  sheetColumn?: string;      // bind text to a sheet column (overrides staticText)
  staticText?: string;       // fixed text or a template like "From R{price}"
  font?: string;
  fontSize?: number;
  color?: string;
  stroke?: string;
  strokeWidth?: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  uppercase?: boolean;

  // Image fields
  imagePath?: string;        // static overlay PNG
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULTS: AppSettings = {
  sheetUrl: '',
  worksheet: 'Sheet1',
  keyColumn: 'image_name',
  descriptionColumn: 'description',
  priceColumn: 'price',
  caseSensitiveMatch: false,
  dataSource: 'sheet',
  demoDescription: 'DEMO PRODUCT',
  demoPrice: '99',

  productFolder: '',
  outputFolder: '',
  fontsFolder: '',

  headerOverlay: '',
  descriptionOverlay: '',
  priceOverlay: '',

  canvasWidth: 1080,
  canvasHeight: 1080,

  productBox: { x: 0, y: 0, width: 1080, height: 1080 },
  headerBox: { x: 0, y: 0, width: 1080, height: 180 },
  descriptionBox: { x: 40, y: 780, width: 600, height: 240 },
  priceBox: { x: 740, y: 740, width: 300, height: 300 },

  descriptionTextBox: { x: 70, y: 820, width: 540, height: 180 },
  priceTextBox: { x: 760, y: 800, width: 260, height: 180 },

  descriptionFont: 'Arial',
  descriptionFontSize: 64,
  descriptionLineHeight: 1.1,
  descriptionLetterSpacing: 0,
  descriptionColor: '#ffffff',
  descriptionStroke: '#000000',
  descriptionStrokeWidth: 0,
  descriptionShadow: false,
  descriptionAlign: 'center',
  descriptionUppercase: true,
  descriptionBold: true,
  descriptionMaxLines: 3,
  descriptionAutoFit: true,
  descriptionEllipsis: true,

  priceFont: 'Arial',
  priceFontSize: 80,
  priceLineHeight: 1.0,
  priceLetterSpacing: 0,
  priceColor: '#ffffff',
  priceStroke: '#000000',
  priceStrokeWidth: 0,
  priceShadow: false,
  priceAlign: 'center',
  priceBold: true,
  priceFormat: 'FROM R{price}',

  exportFormat: 'png',
  exportQuality: 92,
  filenamePattern: '{image_name}-promo.{ext}',

  customElements: [],
  overrides: {},
};

let cached: AppSettings | null = null;

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): AppSettings {
  if (cached) return cached;
  try {
    const p = settingsPath();
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      cached = { ...DEFAULTS, ...raw };
      return cached!;
    }
  } catch (e) {
    console.error('Failed to load settings, using defaults', e);
  }
  cached = { ...DEFAULTS };
  return cached;
}

export function saveSettings(next: Partial<AppSettings>): AppSettings {
  const merged = { ...loadSettings(), ...next };
  cached = merged;
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

export { DEFAULTS };
