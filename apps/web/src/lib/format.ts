export function fmtMbps(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return '–';
  return x <= 10 ? x.toFixed(1) : Math.round(x).toString();
}
export const fmtMs = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? '–' : Math.round(x).toString());
export const fmtPct = (x: number | null | undefined) =>
  x == null || Number.isNaN(x) ? '–' : `${x < 10 && x % 1 !== 0 ? x.toFixed(1) : Math.round(x)}%`;
export const fmtScore = (x: number | null | undefined) => (x == null ? '–' : Math.round(x).toString());

let campusTz: string | undefined;
export const setCampusTz = (tz: string) => (campusTz = tz);

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: campusTz });
}
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: campusTz });
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: campusTz });
}
export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 0) {
    const f = -s;
    if (f < 3600) return `in ${Math.round(f / 60)} min`;
    if (f < 86400) return `in ${Math.round(f / 3600)} h`;
    return `in ${Math.round(f / 86400)} d`;
  }
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
export function fmtDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
export const hourLabel = (h: number) => (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`);

/** datetime-local input value in the browser's local time */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
