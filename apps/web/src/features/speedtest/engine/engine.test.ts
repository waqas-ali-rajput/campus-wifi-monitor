import { afterEach, describe, expect, it, vi } from 'vitest';
import { pingStats, runPing } from './ping';
import { checkCloudflareConnection, connectionErrorMessage, internetMeasurements, runInternetTest } from './internet';
import type SpeedTest from '@cloudflare/speedtest';

afterEach(() => vi.useRealTimers());

describe('speed-test engine: ping', () => {
  it('drops the warm-up sample, uses the median, computes jitter and loss', () => {
    const r = pingStats([80, 20, 22, null, 24, 20, null, 26]);
    expect(r.sent).toBe(8);
    expect(r.lossPct).toBe(25);
    expect(r.samples).toEqual([20, 22, 24, 20, 26]); // first (warm-up) dropped
    expect(r.pingMs).toBe(22);
    expect(r.jitterMs).toBeCloseTo((2 + 2 + 4 + 6) / 4);
  });
  it('reports total loss when nothing answers (→ "server unreachable")', async () => {
    const failing = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    const r = await runPing({ count: 4, gapMs: 1, fetchImpl: failing });
    expect(r.ok).toBe(0);
    expect(r.lossPct).toBe(100);
  });
  it('uses larger repeated payloads to estimate sustained throughput', () => {
    const quick = internetMeasurements(true).filter((measurement) => measurement.type === 'download' || measurement.type === 'upload');
    const full = internetMeasurements(false).filter((measurement) => measurement.type === 'download' || measurement.type === 'upload');
    expect(quick.every((measurement) => 'bytes' in measurement && measurement.bytes >= 10_000_000)).toBe(true);
    expect(full.some((measurement) => 'bytes' in measurement && measurement.bytes === 25_000_000)).toBe(true);
  });

  it('refreshes live measured throughput every half second between provider samples', async () => {
    vi.useFakeTimers();
    class PendingEngine {
      onPhaseChange = (_payload: { measurementId: number; measurement: { type: string } }) => {};
      onResultsChange = (_payload: { type: string }) => {};
      onFinish = (_results: unknown) => {};
      onError = (_message: string) => {};
      results = { getSummary: () => ({}), getDownloadBandwidth: () => 20_000_000, getUploadBandwidth: () => 0, getDownloadBandwidthPoints: () => [{ bytes: 10_000_000 }], getUploadBandwidthPoints: () => [] };
      constructor(_config: unknown) {}
      play() {
        this.onPhaseChange({ measurementId: 1, measurement: { type: 'download' } });
        this.onResultsChange({ type: 'download' });
      }
      pause() {}
    }
    const progress: Array<{ phase: string; valueMbps: number | null }> = [];
    const controller = new AbortController();
    const pending = runInternetTest(controller.signal, true, (sample) => progress.push(sample), PendingEngine as unknown as typeof SpeedTest);
    const samplesAtPhaseStart = progress.length;
    await vi.advanceTimersByTimeAsync(499);
    expect(progress).toHaveLength(samplesAtPhaseStart);
    await vi.advanceTimersByTimeAsync(1);
    expect(progress).toHaveLength(samplesAtPhaseStart + 1);
    expect(progress.at(-1)).toMatchObject({ phase: 'download', valueMbps: 160 });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('checks Cloudflare reachability and distinguishes CORS blocking from network blocking', async () => {
    const availableFetch = vi.fn(async () => new Response(null, { status: 200 }));
    await expect(checkCloudflareConnection(availableFetch as unknown as typeof fetch)).resolves.toBe('ready');
    expect(availableFetch).toHaveBeenCalledWith('https://speed.cloudflare.com/__down?during=idle&bytes=0', { cache: 'no-store', mode: 'cors' });

    const corsBlockedFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.mode === 'cors') throw new TypeError('Failed to fetch');
      return new Response(null, { status: 200 });
    });
    await expect(checkCloudflareConnection(corsBlockedFetch as unknown as typeof fetch)).rejects.toThrow('blocks its cross-origin response');

    const unreachableFetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(checkCloudflareConnection(unreachableFetch as unknown as typeof fetch)).rejects.toThrow('cannot reach Cloudflare');
    await expect(checkCloudflareConnection((async () => new Response(null, { status: 503 })) as typeof fetch)).rejects.toThrow('HTTP 503');
  });

  it('explains provider connection failures and rate limits', () => {
    expect(connectionErrorMessage('Connection failed to https://speed.cloudflare.com/__down?during=idle&bytes=0.')).toContain('browser extension, VPN, proxy, or firewall');
    expect(connectionErrorMessage('Request failed with 429', 429)).toContain('Wait a minute');
  });

  it('converts only final external provider metrics to Mbps and rejects incomplete results', async () => {
    class FakeEngine {
      static config: { bandwidthPercentile: number };
      onPhaseChange = (_payload: { measurementId: number; measurement: { type: string } }) => {};
      onResultsChange = (_payload: { type: string }) => {};
      onFinish: (results: { getSummary: () => Record<string, number | undefined> }) => void = () => {};
      onError: (message: string) => void = () => {};
      results: { getSummary: () => Record<string, number | undefined>; getDownloadBandwidth: () => number; getUploadBandwidth: () => number; getDownloadBandwidthPoints: () => Array<{ bytes: number }>; getUploadBandwidthPoints: () => Array<{ bytes: number }> } = { getSummary: () => ({ download: 80_000_000, upload: 12_000_000, latency: 32, jitter: 2.5 }), getDownloadBandwidth: () => 68_000_000, getUploadBandwidth: () => 14_000_000, getDownloadBandwidthPoints: () => [{ bytes: 10_000_000 }], getUploadBandwidthPoints: () => [{ bytes: 10_000_000 }] };
      constructor(config: { bandwidthPercentile: number }) { FakeEngine.config = config; }
      play() {
        this.onPhaseChange({ measurementId: 1, measurement: { type: 'download' } });
        this.onResultsChange({ type: 'download' });
        this.onFinish(this.results);
      }
      pause() {}
    }
    const progress: Array<{ phase: string; fraction: number; valueMbps: number | null }> = [];
    const result = await runInternetTest(new AbortController().signal, true, (sample) => progress.push(sample), FakeEngine as unknown as typeof SpeedTest);
    expect(progress).toContainEqual({ phase: 'download', fraction: 2 / 3, valueMbps: 68 });
    expect(progress.some((sample) => sample.phase === 'download' && sample.valueMbps === 68)).toBe(true);
    expect(FakeEngine.config.bandwidthPercentile).toBe(0.5);
    expect(result).toEqual({ downloadMbps: 80, uploadMbps: 12, pingMs: 32, jitterMs: 2.5, provider: 'cloudflare' });

    class IncompleteEngine extends FakeEngine {
      results = { getSummary: () => ({ download: 80_000_000, latency: 32 }), getDownloadBandwidth: () => 80_000_000, getUploadBandwidth: () => 0, getDownloadBandwidthPoints: () => [{ bytes: 10_000_000 }], getUploadBandwidthPoints: () => [] };
    }
    await expect(runInternetTest(new AbortController().signal, true, () => {}, IncompleteEngine as unknown as typeof SpeedTest)).rejects.toThrow('complete download, upload, and latency');
  });

  it('cancels the external test and never returns a partial sample', async () => {
    class PendingEngine {
      onPhaseChange = (_payload: { measurementId: number; measurement: { type: string } }) => {};
      onFinish = (_results: unknown) => {};
      onError = (_message: string) => {};
      paused = false;
      constructor(_config: unknown) {}
      play() {}
      pause() { this.paused = true; }
    }
    const abort = new AbortController();
    const pending = runInternetTest(abort.signal, true, () => {}, PendingEngine as unknown as typeof SpeedTest);
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('measures round trips against a mocked server', async () => {
    const ok = (() => new Promise((res) => setTimeout(() => res(new Response(null, { status: 204 })), 5))) as unknown as typeof fetch;
    const r = await runPing({ count: 6, gapMs: 1, fetchImpl: ok });
    expect(r.ok).toBe(5);
    expect(r.pingMs).toBeGreaterThanOrEqual(4);
    expect(r.lossPct).toBe(0);
  });
});
