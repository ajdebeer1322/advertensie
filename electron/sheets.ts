import fetch from 'node-fetch';
import { parse } from 'csv-parse/sync';

export interface SheetRow {
  [key: string]: string;
}

/**
 * Accepts a Google Sheets URL (edit or share link) and a worksheet name,
 * fetches CSV via the `gviz` endpoint (works for any sheet shared
 * with "Anyone with the link" as Viewer or published).
 */
export async function fetchSheet(sheetUrl: string, worksheet: string): Promise<SheetRow[]> {
  if (!sheetUrl) throw new Error('Sheet URL not set in settings.');
  const id = extractSheetId(sheetUrl);
  if (!id) throw new Error('Could not parse Google Sheet ID from URL.');
  const sheetName = worksheet || 'Sheet1';
  const url =
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=` +
    encodeURIComponent(sheetName);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Sheet fetch failed (${res.status}). Ensure the sheet is shared "Anyone with the link".`);
  }
  const csv = await res.text();
  if (csv.trim().startsWith('<')) {
    throw new Error('Sheet not accessible. Share it with "Anyone with the link — Viewer" or publish to web.');
  }
  const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as SheetRow[];
  return records;
}

function extractSheetId(url: string): string | null {
  const m = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(url)) return url;
  return null;
}
