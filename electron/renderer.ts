import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import type { AppSettings, Box } from './settings';

export interface RenderInput {
  settings: AppSettings;
  productImagePath: string;
  description: string;
  price: string;
  /** Editor preview can render the cached non-text base; text is live in the UI. */
  editorPreview?: boolean;
  /** Optional font file paths loaded into @font-face inside the SVG. */
  embeddedFonts?: { family: string; file: string }[];
  /** Optional matched sheet row, used to resolve custom element sheetColumn bindings. */
  sheetRow?: Record<string, string>;
}

export interface RenderResult {
  buffer: Buffer;
  format: 'png' | 'jpg';
}

const baseCache = new Map<string, Buffer>();
const MAX_BASE_CACHE = 8;

/** Main composition. Layers in order:
 * 1. Base product image (fit into productBox)
 * 2. Header overlay
 * 3. Description overlay
 * 4. Price overlay
 * 5. Description text (SVG)
 * 6. Price text (SVG)
 */
export async function renderAd(input: RenderInput): Promise<RenderResult> {
  const { settings, productImagePath } = input;
  const W = settings.canvasWidth;
  const H = settings.canvasHeight;

  const baseBuffer = await getBaseBuffer(input);
  const composites: sharp.OverlayOptions[] = [];

  const addLayer = async (buf: Buffer, box: Box) => {
    const clipped = await clipToCanvas(buf, box, W, H);
    if (clipped) composites.push({ input: clipped.buffer, left: clipped.left, top: clipped.top });
  };

  if (input.editorPreview) {
    return { buffer: baseBuffer, format: 'png' };
  }

  // Description text
  const descText = formatDescription(input.description, settings);
  if (descText) {
    const svg = buildTextSvg({
      text: descText,
      box: settings.descriptionTextBox,
      font: settings.descriptionFont,
      fontSize: settings.descriptionFontSize,
      lineHeight: settings.descriptionLineHeight,
      letterSpacing: settings.descriptionLetterSpacing,
      color: settings.descriptionColor,
      stroke: settings.descriptionStroke,
      strokeWidth: settings.descriptionStrokeWidth,
      outline: settings.descriptionOutline,
      outlineWidth: settings.descriptionOutlineWidth,
      shadow: settings.descriptionShadow,
      align: settings.descriptionAlign,
      bold: settings.descriptionBold,
      maxLines: settings.descriptionMaxLines,
      autoFit: settings.descriptionAutoFit,
      ellipsis: settings.descriptionEllipsis,
      embeddedFonts: input.embeddedFonts || [],
    });
    // Rasterize SVG so we can clip it if it extends past canvas
    const rasterized = await sharp(Buffer.from(svg)).png().toBuffer();
    await addLayer(rasterized, settings.descriptionTextBox);
  }

  // Price text
  const priceText = formatPrice(input.price, settings);
  if (priceText) {
    const svg = buildTextSvg({
      text: priceText,
      box: settings.priceTextBox,
      font: settings.priceFont,
      fontSize: settings.priceFontSize,
      lineHeight: settings.priceLineHeight,
      letterSpacing: settings.priceLetterSpacing,
      color: settings.priceColor,
      stroke: settings.priceStroke,
      strokeWidth: settings.priceStrokeWidth,
      outline: settings.priceOutline,
      outlineWidth: settings.priceOutlineWidth,
      shadow: settings.priceShadow,
      align: settings.priceAlign,
      bold: settings.priceBold,
      maxLines: 3,
      autoFit: true,
      ellipsis: false,
      embeddedFonts: input.embeddedFonts || [],
    });
    const rasterized = await sharp(Buffer.from(svg)).png().toBuffer();
    await addLayer(rasterized, settings.priceTextBox);
  }

  // Custom extras (text or image), in declared order
  for (const el of settings.customElements || []) {
    if (!el.enabled) continue;
    if (el.type === 'image') {
      if (!el.imagePath || !fs.existsSync(el.imagePath)) continue;
      const buf = await sharp(el.imagePath)
        .resize(Math.max(1, el.box.width), Math.max(1, el.box.height), {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      await addLayer(buf, el.box);
    } else {
      // text
      let text = el.staticText || '';
      if (el.sheetColumn && input.sheetRow) {
        const v = input.sheetRow[el.sheetColumn];
        if (v) text = v;
      }
      // Allow templating: replace {column} placeholders from the sheet row
      if (input.sheetRow) {
        text = text.replace(/\{([^}]+)\}/g, (_, k) => input.sheetRow?.[k] ?? '');
      }
      if (!text) continue;
      if (el.uppercase) text = text.toUpperCase();
      const svg = buildTextSvg({
        text: normalizeBreaks(text),
        box: el.box,
        font: el.font || 'Arial',
        fontSize: el.fontSize ?? 32,
        lineHeight: 1.1,
        letterSpacing: 0,
        color: el.color || '#ffffff',
        stroke: el.stroke || '#000000',
        strokeWidth: el.strokeWidth ?? 0,
        outline: '#000000',
        outlineWidth: 0,
        shadow: false,
        align: el.align || 'center',
        bold: !!el.bold,
        maxLines: 4,
        autoFit: true,
        ellipsis: true,
        embeddedFonts: input.embeddedFonts || [],
      });
      const rasterized = await sharp(Buffer.from(svg)).png().toBuffer();
      await addLayer(rasterized, el.box);
    }
  }

  const pipeline = sharp(baseBuffer).composite(composites);

  let buffer: Buffer;
  if (settings.exportFormat === 'jpg') {
    buffer = await pipeline.jpeg({ quality: settings.exportQuality }).toBuffer();
  } else {
    buffer = await pipeline.png().toBuffer();
  }
  return { buffer, format: settings.exportFormat };
}

async function getBaseBuffer(input: RenderInput): Promise<Buffer> {
  const { settings, productImagePath } = input;
  const W = settings.canvasWidth;
  const H = settings.canvasHeight;
  const key = JSON.stringify({
    productImagePath,
    productMtime: fileMtime(productImagePath),
    W,
    H,
    productBox: settings.productBox,
    headerOverlay: settings.headerOverlay,
    headerMtime: fileMtime(settings.headerOverlay),
    headerBox: settings.headerBox,
    descriptionOverlay: settings.descriptionOverlay,
    descriptionMtime: fileMtime(settings.descriptionOverlay),
    descriptionBox: settings.descriptionBox,
    priceOverlay: settings.priceOverlay,
    priceMtime: fileMtime(settings.priceOverlay),
    priceBox: settings.priceBox,
  });
  const cached = baseCache.get(key);
  if (cached) return cached;

  const base = sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });
  const composites: sharp.OverlayOptions[] = [];
  const addLayer = async (buf: Buffer, box: Box) => {
    const clipped = await clipToCanvas(buf, box, W, H);
    if (clipped) composites.push({ input: clipped.buffer, left: clipped.left, top: clipped.top });
  };

  if (fs.existsSync(productImagePath)) {
    const fitted = await sharp(productImagePath)
      .resize(Math.max(1, settings.productBox.width), Math.max(1, settings.productBox.height), {
        fit: 'cover',
        position: 'centre',
      })
      .png()
      .toBuffer();
    await addLayer(fitted, settings.productBox);
  }

  const overlaySteps: { file: string; box: Box }[] = [
    { file: settings.headerOverlay, box: settings.headerBox },
    { file: settings.descriptionOverlay, box: settings.descriptionBox },
    { file: settings.priceOverlay, box: settings.priceBox },
  ];
  for (const s of overlaySteps) {
    if (s.file && fs.existsSync(s.file)) {
      const buf = await sharp(s.file)
        .resize(Math.max(1, s.box.width), Math.max(1, s.box.height), {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      await addLayer(buf, s.box);
    }
  }

  const buffer = await base.composite(composites).png().toBuffer();
  baseCache.set(key, buffer);
  while (baseCache.size > MAX_BASE_CACHE) {
    const first = baseCache.keys().next().value;
    if (!first) break;
    baseCache.delete(first);
  }
  return buffer;
}

function fileMtime(file: string): number {
  if (!file || !fs.existsSync(file)) return 0;
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/** Expand `\n` escape sequences into actual newlines, and normalize CRLF. */
function normalizeBreaks(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
}

function formatDescription(text: string, s: AppSettings): string {
  if (!text) return '';
  const t = normalizeBreaks(text);
  return s.descriptionUppercase ? t.toUpperCase() : t;
}

function formatPrice(price: string, s: AppSettings): string {
  if (!price) return '';
  const fmt = normalizeBreaks(s.priceFormat || '{price}');
  return fmt.replace('{price}', String(price));
}

interface TextOpts {
  text: string;
  box: Box;
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
  embeddedFonts: { family: string; file: string }[];
}

/** Build an SVG layer sized to the text box that does word-wrap,
 * auto-fit (shrink font until it fits), optional ellipsis, and stroke/shadow.
 */
function buildTextSvg(o: TextOpts): string {
  const W = o.box.width;
  const H = o.box.height;

  let fontSize = o.fontSize;
  let lines = wrapText(o.text, W, fontSize, o.letterSpacing, o.bold);
  const visualPad = Math.max(o.strokeWidth, o.outlineWidth) + 2;
  if (o.autoFit) {
    while (
      (lines.length > o.maxLines || linesTooTall(lines.length, fontSize, o.lineHeight, H, visualPad)) &&
      fontSize > 8
    ) {
      fontSize -= 2;
      lines = wrapText(o.text, W, fontSize, o.letterSpacing, o.bold);
    }
  }
  if (lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    if (o.ellipsis && lines.length > 0) {
      lines[lines.length - 1] = truncateWithEllipsis(
        lines[lines.length - 1],
        W,
        fontSize,
        o.letterSpacing,
        o.bold,
      );
    }
  }

  const lineH = fontSize * o.lineHeight;
  const availableH = Math.max(1, H - visualPad * 2);
  const centerY = visualPad + availableH / 2;

  const anchor = o.align === 'left' ? 'start' : o.align === 'right' ? 'end' : 'middle';
  const xPos = o.align === 'left' ? 0 : o.align === 'right' ? W : W / 2;

  const fontFaces = o.embeddedFonts
    .map((f) => {
      try {
        const data = fs.readFileSync(f.file).toString('base64');
        const ext = path.extname(f.file).slice(1).toLowerCase();
        const mime =
          ext === 'ttf'
            ? 'font/ttf'
            : ext === 'otf'
              ? 'font/otf'
              : ext === 'woff'
                ? 'font/woff'
                : 'font/woff2';
        return `@font-face { font-family: '${escapeXml(f.family)}'; src: url(data:${mime};base64,${data}); }`;
      } catch {
        return '';
      }
    })
    .join('\n');

  const shadow = o.shadow
    ? `<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
         <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
         <feOffset dx="2" dy="2" result="offsetblur"/>
         <feComponentTransfer><feFuncA type="linear" slope="0.6"/></feComponentTransfer>
         <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
       </filter>`
    : '';

  const filterAttr = o.shadow ? ` filter="url(#shadow)"` : '';
  const weight = o.bold ? 'bold' : 'normal';
  const letter = o.letterSpacing ? ` letter-spacing="${o.letterSpacing}"` : '';

  const tspans = lines
    .map((line, i) => {
      const y = centerY + (i - (lines.length - 1) / 2) * lineH;
      const common = `x="${xPos}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" font-family="${escapeXml(o.font)}" font-size="${fontSize}" font-weight="${weight}"${letter}${filterAttr}`;
      const textOut = escapeXml(svgSpacePreserve(line));
      const outlineText =
        o.outlineWidth > 0
          ? `<text ${common} fill="none" stroke="${o.outline}" stroke-width="${o.outlineWidth}" stroke-linejoin="round" stroke-linecap="round" xml:space="preserve">${textOut}</text>`
          : '';
      const mainText = `<text ${common} fill="${o.color}" stroke="${o.stroke}" stroke-width="${o.strokeWidth}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke" xml:space="preserve">${textOut}</text>`;
      return outlineText ? `${outlineText}\n${mainText}` : mainText;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<style>${fontFaces}</style>
${shadow}
</defs>
${tspans}
</svg>`;
}

function approxCharWidth(fontSize: number, bold: boolean): number {
  return fontSize * (bold ? 0.58 : 0.52);
}

function measure(text: string, fontSize: number, letterSpacing: number, bold: boolean): number {
  return text.length * (approxCharWidth(fontSize, bold) + letterSpacing);
}

function wrapText(
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
      const candidate = current ? current + ' ' + w : w;
      if (measure(candidate, fontSize, letterSpacing, bold) <= width) {
        current = candidate;
      } else {
        if (current) out.push(current);
        current = w;
      }
    }
    if (current) out.push(current);
    if (words.length === 0) out.push('');
  }
  return out;
}

function linesTooTall(
  count: number,
  fontSize: number,
  lineHeight: number,
  boxH: number,
  visualPad: number,
): boolean {
  return count * fontSize * lineHeight > Math.max(1, boxH - visualPad * 2);
}

function truncateWithEllipsis(
  line: string,
  width: number,
  fontSize: number,
  letterSpacing: number,
  bold: boolean,
): string {
  let s = line;
  while (s.length > 1 && measure(s + '…', fontSize, letterSpacing, bold) > width) {
    s = s.slice(0, -1);
  }
  return s + '…';
}

/** Given a buffer already sized to box.width x box.height, return it clipped
 * to the canvas (W x H). Returns null if the box is entirely outside. */
async function clipToCanvas(
  buffer: Buffer,
  box: Box,
  W: number,
  H: number,
): Promise<{ buffer: Buffer; left: number; top: number } | null> {
  let left = box.x;
  let top = box.y;
  let extractLeft = 0;
  let extractTop = 0;
  let extractW = box.width;
  let extractH = box.height;

  if (left < 0) {
    extractLeft = -left;
    extractW += left;
    left = 0;
  }
  if (top < 0) {
    extractTop = -top;
    extractH += top;
    top = 0;
  }
  if (left + extractW > W) extractW = W - left;
  if (top + extractH > H) extractH = H - top;

  if (extractW <= 0 || extractH <= 0) return null;

  if (
    extractLeft === 0 &&
    extractTop === 0 &&
    extractW === box.width &&
    extractH === box.height
  ) {
    return { buffer, left, top };
  }
  const clipped = await sharp(buffer)
    .extract({ left: extractLeft, top: extractTop, width: extractW, height: extractH })
    .toBuffer();
  return { buffer: clipped, left, top };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function svgSpacePreserve(s: string): string {
  // Replace regular spaces so spacing survives font/browser quirks in SVG text.
  return s.replace(/ /g, '\u00A0');
}
