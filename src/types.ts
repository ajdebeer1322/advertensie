export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppSettings {
  sheetUrl: string;
  worksheet: string;
  keyColumn: string;
  descriptionColumn: string;
  priceColumn: string;
  caseSensitiveMatch: boolean;
  dataSource: 'sheet' | 'none' | 'demo';
  demoDescription: string;
  demoPrice: string;

  productFolder: string;
  outputFolder: string;
  fontsFolder: string;

  headerOverlay: string;
  descriptionOverlay: string;
  priceOverlay: string;

  canvasWidth: number;
  canvasHeight: number;

  productBox: Box;
  headerBox: Box;
  descriptionBox: Box;
  priceBox: Box;
  descriptionTextBox: Box;
  priceTextBox: Box;

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
  priceFormat: string;

  exportFormat: 'png' | 'jpg';
  exportQuality: number;
  filenamePattern: string;

  customElements: CustomElement[];
  overrides: Record<string, Partial<AppSettings>>;
}

export interface CustomElement {
  id: string;
  type: 'text' | 'image';
  label: string;
  enabled: boolean;
  box: Box;

  sheetColumn?: string;
  staticText?: string;
  font?: string;
  fontSize?: number;
  color?: string;
  stroke?: string;
  strokeWidth?: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  uppercase?: boolean;

  imagePath?: string;
}

export interface ImageItem {
  name: string;
  path: string;
}

export interface SheetRow {
  [key: string]: string;
}

export interface FolderFont {
  family: string;
  file: string;
}

export interface ReportEntry {
  level: 'ok' | 'fail' | 'info';
  text: string;
  ts: number;
}

declare global {
  interface Window {
    api: {
      loadSettings: () => Promise<AppSettings>;
      saveSettings: (s: Partial<AppSettings>) => Promise<AppSettings>;

      pickFolder: (title?: string) => Promise<string | null>;
      pickFile: (
        filters?: { name: string; extensions: string[] }[],
        title?: string,
      ) => Promise<string | null>;
      listImages: (folder: string) => Promise<ImageItem[]>;
      readFileAsDataUrl: (filePath: string) => Promise<string | null>;
      openPath: (p: string) => Promise<string>;

      listSystemFonts: () => Promise<string[]>;
      listFolderFonts: (folder: string) => Promise<FolderFont[]>;
      loadFontFile: (filePath: string) => Promise<FolderFont | null>;

      fetchSheet: (sheetUrl: string, worksheet: string) => Promise<SheetRow[]>;

      renderPreview: (payload: {
        settings: AppSettings;
        productImagePath: string;
        description: string;
        price: string;
        embeddedFonts?: FolderFont[];
        sheetRow?: Record<string, string>;
        settingsOverride?: Partial<AppSettings>;
      }) => Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }>;

      renderBatch: (payload: {
        settings: AppSettings;
        items: {
          imagePath: string;
          description: string;
          price: string;
          keyName: string;
          sheetRow?: Record<string, string>;
          settingsOverride?: Partial<AppSettings>;
        }[];
        embeddedFonts?: FolderFont[];
      }) => Promise<
        | {
            ok: true;
            results: { imagePath: string; outPath?: string; error?: string }[];
            success: number;
            failure: number;
          }
        | { ok: false; error: string }
      >;

      onBatchProgress: (
        cb: (msg: { index: number; total: number; current: string }) => void,
      ) => () => void;
    };
  }
}
