export function toCsv(rows: Array<Record<string, unknown>>, cols: Array<[string, string]>): string {
  const esc = (v: unknown) => {
    if (v == null) return '';
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map(([, label]) => esc(label)).join(',')];
  for (const r of rows) lines.push(cols.map(([k]) => esc(r[k])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
