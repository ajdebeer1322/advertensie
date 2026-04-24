import * as fs from 'fs';
import * as path from 'path';

// font-list does not ship types; wrap loosely
let fontList: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  fontList = require('font-list');
} catch {
  fontList = null;
}

export async function listSystemFonts(): Promise<string[]> {
  if (!fontList) return [];
  try {
    const fonts: string[] = await fontList.getFonts({ disableQuoting: true });
    return Array.from(new Set(fonts)).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export interface FolderFont {
  family: string;
  file: string;
}

export function listFolderFonts(folder: string): FolderFont[] {
  if (!folder || !fs.existsSync(folder)) return [];
  const exts = new Set(['.ttf', '.otf', '.woff', '.woff2']);
  const files = fs.readdirSync(folder).filter((f) => exts.has(path.extname(f).toLowerCase()));
  return files.map((f) => ({
    family: path.basename(f, path.extname(f)),
    file: path.join(folder, f),
  }));
}
