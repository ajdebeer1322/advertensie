import React from 'react';
import type { ReportEntry } from '../types';

export function ReportPanel({
  report,
  onClear,
}: {
  report: ReportEntry[];
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
