import SpeedTest, { type MeasurementConfig, type Results } from '@cloudflare/speedtest';

export interface InternetMeasurement {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  provider: 'cloudflare';
}

export interface InternetTestProgress {
  phase: 'ping' | 'download' | 'upload';
  fraction: number;
  valueMbps: number | null;
}

export const internetMeasurements = (quick: boolean): MeasurementConfig[] =>
  quick
    ? [
        { type: 'latency', numPackets: 5 },
        { type: 'download', bytes: 10_000_000, count: 4 },
        { type: 'upload', bytes: 10_000_000, count: 4 },
      ]
    : [
        { type: 'latency', numPackets: 12 },
        { type: 'download', bytes: 10_000_000, count: 6 },
        { type: 'download', bytes: 25_000_000, count: 3 },
        { type: 'upload', bytes: 10_000_000, count: 6 },
        { type: 'upload', bytes: 25_000_000, count: 3 },
      ];

export async function checkCloudflareConnection(fetchImpl: typeof fetch = fetch): Promise<'ready' | 'cors-blocked'> {
  const url = 'https://speed.cloudflare.com/__down?during=idle&bytes=0';
  try {
    const response = await fetchImpl(url, { cache: 'no-store', mode: 'cors' });
    if (!response.ok) throw new Error(`Cloudflare’s speed-test endpoint returned HTTP ${response.status}.`);
    return 'ready';
  } catch (corsError) {
    if (corsError instanceof Error && !/failed to fetch|networkerror|load failed/i.test(corsError.message)) throw corsError;
    try {
      await fetchImpl(url, { cache: 'no-store', mode: 'no-cors' });
    } catch {
      throw new Error('Your browser cannot reach Cloudflare’s speed-test endpoint. Check your VPN, proxy, or firewall, then retry.');
    }
    throw new Error('Cloudflare is reachable, but your browser blocks its cross-origin response. Disable browser privacy shields/extensions for this app, then retry.');
  }
}

export function connectionErrorMessage(message: string, status?: number): string {
  if (status === 429) return 'Cloudflare is rate-limiting speed tests from this connection. Wait a minute, then try again.';
  if (message.includes('Connection failed to https://speed.cloudflare.com'))
    return `${message} Your browser could not reach Cloudflare. Check that speed.cloudflare.com is not blocked by a browser extension, VPN, proxy, or firewall, then retry. No result was saved.`;
  return message;
}

function finalMeasurement(results: Results): InternetMeasurement {
  const summary = results.getSummary();
  const downloadMbps = (summary.download ?? 0) / 1_000_000;
  const uploadMbps = (summary.upload ?? 0) / 1_000_000;
  const pingMs = summary.latency ?? 0;
  const jitterMs = summary.jitter ?? 0;
  if (![downloadMbps, uploadMbps, pingMs, jitterMs].every(Number.isFinite) || downloadMbps <= 0 || uploadMbps <= 0 || pingMs <= 0)
    throw new Error('The provider did not return complete download, upload, and latency measurements.');
  return { downloadMbps, uploadMbps, pingMs, jitterMs, provider: 'cloudflare' };
}

export function runInternetTest(
  signal: AbortSignal,
  quick: boolean,
  onProgress: (progress: InternetTestProgress) => void,
  engineFactory: typeof SpeedTest = SpeedTest,
): Promise<InternetMeasurement> {
  const steps = internetMeasurements(quick);
  return new Promise((resolve, reject) => {
    const engine = new engineFactory({
      autoStart: false,
      logAimApiUrl: null,
      logMeasurementApiUrl: null,
      bandwidthPercentile: 0.5,
      measurements: steps,
    });
    let settled = false;
    let activePhase: 'download' | 'upload' | null = null;
    let phaseStartedAt: number | null = null;
    let transferredBytes = 0;
    let processedPoints = 0;
    let activeFraction = 0;
    const reportLiveThroughput = () => {
      if (!activePhase || phaseStartedAt == null || transferredBytes === 0) return;
      const elapsedSeconds = (Date.now() - phaseStartedAt) / 1000;
      if (elapsedSeconds > 0) onProgress({ phase: activePhase, fraction: activeFraction, valueMbps: (transferredBytes * 8) / elapsedSeconds / 1_000_000 });
    };
    const liveTimer = setInterval(reportLiveThroughput, 500);
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(liveTimer);
      signal.removeEventListener('abort', abort);
      fn();
    };
    const abort = () => {
      engine.pause();
      finish(() => reject(new DOMException('Aborted', 'AbortError')));
    };
    signal.addEventListener('abort', abort, { once: true });
    engine.onPhaseChange = ({ measurementId, measurement }) => {
      const phase = measurement.type === 'latency' ? 'ping' : measurement.type;
      if (phase === 'ping' || phase === 'download' || phase === 'upload') {
        if (phase === 'download' || phase === 'upload') {
          if (activePhase !== phase) {
            activePhase = phase;
            phaseStartedAt = Date.now();
            transferredBytes = 0;
            processedPoints = 0;
            activeFraction = 0;
          }
          activeFraction = (measurementId + 1) / steps.length;
        } else {
          activePhase = null;
          phaseStartedAt = 0;
          transferredBytes = 0;
          processedPoints = 0;
        }
        const bps = phase === 'download' ? engine.results.getDownloadBandwidth() : phase === 'upload' ? engine.results.getUploadBandwidth() : undefined;
        onProgress({ phase, fraction: activeFraction, valueMbps: bps && bps > 0 ? bps / 1_000_000 : null });
      }
    };
    engine.onResultsChange = ({ type }) => {
      if (type !== 'download' && type !== 'upload' || type !== activePhase) return;
      const points = type === 'download' ? engine.results.getDownloadBandwidthPoints() : engine.results.getUploadBandwidthPoints();
      const completedPoints = points.slice(processedPoints);
      for (const point of completedPoints) transferredBytes += point.bytes;
      processedPoints = points.length;
      const bps = type === 'download' ? engine.results.getDownloadBandwidth() : engine.results.getUploadBandwidth();
      if (bps && bps > 0) onProgress({ phase: type, fraction: activeFraction, valueMbps: bps / 1_000_000 });
      reportLiveThroughput();
    };
    engine.onFinish = (results) => finish(() => {
      try {
        resolve(finalMeasurement(results));
      } catch (error) {
        reject(error);
      }
    });
    engine.onError = (message, status) => finish(() => reject(new Error(connectionErrorMessage(message, status))));
    if (signal.aborted) abort();
    else engine.play();
  });
}
