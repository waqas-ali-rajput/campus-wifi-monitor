export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

/** Median absolute deviation. */
export function mad(xs: number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/** Least-squares slope of ys against index 0..n-1. */
export function slope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = mean(ys);
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => {
    num += (i - xm) * (y - ym);
    den += (i - xm) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
