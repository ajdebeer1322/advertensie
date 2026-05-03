import React from 'react';
import type { ReportEntry } from '../types';

export function ReportPanel({
  report,
  summary,
  onClear,
}: {
  report: ReportEntry[];
  summary: {
    finishedAt: number;
    totalSelected: number;
    attempted: number;
    created: { imagePath: string; outPath: string }[];
    failed: { imagePath: string; reason: string }[];
    skipped: { imagePath: string; reason: string }[];
  } | null;
  onClear: () => void;
}) {
  return (
    <div className="card">
      <div className="toolbar">
        <h3 style={{ margin: 0, flex: 1 }}>Report</h3>
        <button className="secondary" onClick={onClear}>
          Clear
        </button>
      </div>
      {summary && (
        <div style={{ marginBottom: 16, padding: 12, border: '1px solid var(--line)', borderRadius: 8 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Last Generation Summary</div>
          <div className="muted" style={{ marginBottom: 8 }}>
            {new Date(summary.finishedAt).toLocaleString()} • Selected {summary.totalSelected} • Attempted{' '}
            {summary.attempted} • Created {summary.created.length} • Failed {summary.failed.length} • Skipped{' '}
            {summary.skipped.length}
          </div>

          {summary.created.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#44e3bd' }}>Created</div>
              {summary.created.map((c, i) => (
                <div key={`${c.imagePath}-${i}`} className="report-line ok">
                  {c.imagePath} → {c.outPath}
                </div>
              ))}
            </div>
          )}

          {summary.failed.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#ff7c8b' }}>Failed</div>
              {summary.failed.map((f, i) => (
                <div key={`${f.imagePath}-${i}`} className="report-line fail">
                  {f.imagePath} → {f.reason}
                </div>
              ))}
            </div>
          )}

          {summary.skipped.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#8fbaff' }}>Skipped</div>
              {summary.skipped.map((x, i) => (
                <div key={`${x.imagePath}-${i}`} className="report-line info">
                  {x.imagePath} → {x.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {report.length === 0 ? (
        <div className="muted">No messages yet.</div>
      ) : (
        report.map((r, i) => (
          <div key={i} className={'report-line ' + r.level}>
            [{new Date(r.ts).toLocaleTimeString()}] {r.text}
          </div>
        ))
      )}
    </div>
  );
}
