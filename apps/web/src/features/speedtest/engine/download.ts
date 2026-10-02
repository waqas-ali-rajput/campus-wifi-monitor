export interface ThroughputResult {
  mbps: number;
  bytes: number;
  seconds: number;
}

/** Phase 2: parallel streaming downloads; the first `warmupMs` (TCP slow-start) is excluded. */
export async function runDownload(opts: {
  base?: string;
  workers?: number;
  bytesPerRequest?: number;
  durationMs?: number;
  warmupMs?: number;
  signal?: AbortSignal;
  onProgress?: (mbps: number, fraction: number) => void;
}): Promise<ThroughputResult> {
  const { base = '/api/speedtest', workers = 4, bytesPerRequest = 8 * 1024 * 1024, durationMs = 8000, warmupMs = 1500, signal } = opts;
  const ac = new AbortController();
  signal?.addEventListener('abort', () => ac.abort(), { once: true });
  const start = performance.now();
  let measured = 0;
  let total = 0;
  let windowStart = 0;
  let failure: unknown = null;
  let done = false;

  const tick = setInterval(() => {
    const now = performance.now();
    const el = now - start;
    if (el >= warmupMs && windowStart === 0) {
      windowStart = now;
      measured = 0;
    }
    const secs = windowStart ? (now - windowStart) / 1000 : el / 1000;
    const bytes = windowStart ? measured : total;
    if (secs > 0.05) opts.onProgress?.((bytes * 8) / secs / 1e6, Math.min(1, el / durationMs));
  }, 150);

  const worker = async () => {
    while (!done && !ac.signal.aborted) {
      const res = await fetch(`${base}/download?bytes=${bytesPerRequest}&t=${Math.random()}`, { cache: 'no-store', credentials: 'include', signal: ac.signal });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      for (;;) {
        const { done: d, value } = await reader.read();
        if (d) break;
        total += value.byteLength;
        if (windowStart) measured += value.byteLength;
      }
    }
  };

  const stopper = new Promise<void>((resolve) => setTimeout(resolve, durationMs));
  const runners = Array.from({ length: workers }, () =>
    worker().catch((e) => {
      if (!ac.signal.aborted && !done) failure = e;
    }),
  );
  await Promise.race([stopper, Promise.all(runners)]);
  done = true;
  const end = performance.now();
  ac.abort();
  clearInterval(tick);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const secs = windowStart ? (end - windowStart) / 1000 : 0;
  if (failure && measured === 0) throw failure;
  if (secs <= 0 || measured === 0) throw new Error('No data received');
  return { mbps: (measured * 8) / secs / 1e6, bytes: measured, seconds: secs };
}
