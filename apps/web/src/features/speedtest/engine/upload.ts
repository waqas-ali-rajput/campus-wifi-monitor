import type { ThroughputResult } from './download';

let payload: Uint8Array | null = null;
function randomPayload(size: number): Uint8Array {
  if (payload && payload.length === size) return payload;
  const p = new Uint8Array(size);
  for (let i = 0; i < size; i += 65536) crypto.getRandomValues(p.subarray(i, Math.min(size, i + 65536)));
  payload = p;
  return p;
}

/** Phase 3: parallel XHR uploads of incompressible data; progress events give live throughput. */
export async function runUpload(opts: {
  base?: string;
  workers?: number;
  chunkBytes?: number;
  durationMs?: number;
  warmupMs?: number;
  signal?: AbortSignal;
  onProgress?: (mbps: number, fraction: number) => void;
}): Promise<ThroughputResult> {
  const { base = '/api/speedtest', workers = 3, chunkBytes = 2 * 1024 * 1024, durationMs = 6000, warmupMs = 1000, signal } = opts;
  const body = randomPayload(chunkBytes);
  const start = performance.now();
  let windowStart = 0;
  let measured = 0;
  let total = 0;
  let done = false;
  let failure: unknown = null;
  const xhrs = new Set<XMLHttpRequest>();

  const tick = setInterval(() => {
    const now = performance.now();
    if (now - start >= warmupMs && windowStart === 0) {
      windowStart = now;
      measured = 0;
    }
    const secs = windowStart ? (now - windowStart) / 1000 : (now - start) / 1000;
    const bytes = windowStart ? measured : total;
    if (secs > 0.05) opts.onProgress?.((bytes * 8) / secs / 1e6, Math.min(1, (now - start) / durationMs));
  }, 150);

  const one = () =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrs.add(xhr);
      let last = 0;
      xhr.upload.onprogress = (e) => {
        const d = e.loaded - last;
        last = e.loaded;
        total += d;
        if (windowStart) measured += d;
      };
      xhr.onload = () => (xhrs.delete(xhr), xhr.status < 400 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
      xhr.onerror = () => (xhrs.delete(xhr), reject(new Error('Network error')));
      xhr.onabort = () => (xhrs.delete(xhr), resolve());
      xhr.open('POST', `${base}/upload?t=${Math.random()}`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-Requested-With', 'campus-wifi');
      xhr.send(body as unknown as Blob);
    });

  const worker = async () => {
    while (!done) await one();
  };
  const abortAll = () => xhrs.forEach((x) => x.abort());
  signal?.addEventListener('abort', abortAll, { once: true });
  const runners = Array.from({ length: workers }, () => worker().catch((e) => { if (!done) failure = e; }));
  await Promise.race([new Promise((r) => setTimeout(r, durationMs)), Promise.all(runners)]);
  done = true;
  const end = performance.now();
  abortAll();
  clearInterval(tick);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const secs = windowStart ? (end - windowStart) / 1000 : 0;
  if (failure && measured === 0) throw failure;
  if (secs <= 0 || measured === 0) throw new Error('No data sent');
  return { mbps: (measured * 8) / secs / 1e6, bytes: measured, seconds: secs };
}
