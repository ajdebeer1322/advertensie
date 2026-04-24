import * as path from 'path';
import type { SheetRow } from './sheets';

export interface MatchOptions {
  keyColumn: string;
  caseSensitive: boolean;
}

export function keyFromFilename(filePath: string): string {
  const base = path.basename(filePath);
  const ext = path.extname(base);
  return base.slice(0, base.length - ext.length).trim();
}

export function findRow(
  rows: SheetRow[],
  imagePath: string,
  opts: MatchOptions,
): SheetRow | undefined {
  const key = keyFromFilename(imagePath);
  const norm = (s: string) => (opts.caseSensitive ? s.trim() : s.trim().toLowerCase());
  const target = norm(key);
  return rows.find((r) => {
    const v = r[opts.keyColumn];
    if (!v) return false;
    return norm(String(v)) === target;
  });
}
