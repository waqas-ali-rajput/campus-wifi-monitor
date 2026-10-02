export interface PingResult {
  pingMs: number;
  jitterMs: number;
  lossPct: number;
  samples: number[];
  sent: number;
  ok: number;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), rej(new DOMException('Aborted', 'AbortError'))), { once: true });
  });

export function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Ping stats from raw samples: median RTT, mean |Δ| jitter, timeouts → loss. Warm-up sample dropped if ≥ 5 succeeded. */
export function pingStats(rtts: Array<number | null>): PingResult {
  const sent = rtts.length;
  let ok = rtts.filter((x): x is number => x != null);
  const loss = Math.round(((sent - ok.length) / Math.max(1, sent)) * 1000) / 10;
  if (ok.length >= 5) ok = ok.slice(1);
  const jitter = ok.length > 1 ? ok.slice(1).reduce((s, x, i) => s + Math.abs(x - ok[i]!), 0) / (ok.length - 1) : 0;
  return { pingMs: ok.length ? median(ok) : NaN, jitterMs: jitter, lossPct: loss, samples: ok, sent, ok: ok.length };
}

/** Phase 1: sequential HTTP probes (browsers cannot send ICMP). */
export async function runPing(opts: {
  base?: string;
  count?: number;
  gapMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onSample?: (rtt: number | null, i: number) => void;
  fetchImpl?: typeof fetch;
}): Promise<PingResult> {
  const { base = '/api/speedtest', count = 20, gapMs = 50, timeoutMs = 1500, signal } = opts;
  const f = opts.fetchImpl ?? fetch;
  const rtts: Array<number | null> = [];
  for (let i = 0; i < count; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const onAbort = () => ac.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const t0 = performance.now();
    try {
      const r = await f(`${base}/ping?t=${Math.random().toString(36).slice(2)}`, { cache: 'no-store', credentials: 'include', signal: ac.signal });
      if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
      const rtt = performance.now() - t0;
      rtts.push(rtt);
      opts.onSample?.(rtt, i);
    } catch (e) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      rtts.push(null);
      opts.onSample?.(null, i);
    } finally {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
    }
    await sleep(gapMs, signal);
  }
  return pingStats(rtts);
}
