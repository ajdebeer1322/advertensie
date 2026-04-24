import type { SheetRow } from '../types';

export function keyFromFilename(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).trim();
}

export function findRow(
  rows: SheetRow[],
  imageName: string,
  keyColumn: string,
  caseSensitive: boolean,
): SheetRow | undefined {
  const key = keyFromFilename(imageName);
  const norm = (s: string) => (caseSensitive ? s.trim() : s.trim().toLowerCase());
  const target = norm(key);
  return rows.find((r) => {
    const v = r[keyColumn];
    return v ? norm(String(v)) === target : false;
  });
}
