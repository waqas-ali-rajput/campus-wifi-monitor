import type { FailureReason } from '@campus/shared';
import { runPing, type PingResult } from './ping';
import { runDownload } from './download';
import { runUpload } from './upload';

export type Phase = 'idle' | 'ping' | 'download' | 'upload' | 'saving' | 'done' | 'error';

export class SpeedTestError extends Error {
  constructor(public reason: FailureReason, public detail: string) {
    super(detail);
  }
}

export interface RawResult {
  ping: PingResult;
  downloadMbps: number;
  uploadMbps: number;
}

export interface RunnerCallbacks {
  onPhase: (p: Phase) => void;
  onLive: (phase: 'ping' | 'download' | 'upload', value: number, fraction: number) => void;
}

/** Runs Ping → Download → Upload strictly in order (§5.1). Quick mode ≈ 1/3 of the durations. */
export async function runSpeedTest(cb: RunnerCallbacks, signal: AbortSignal, quick = false): Promise<RawResult> {
  const k = quick ? 1 / 3 : 1;
  cb.onPhase('ping');
  const ping = await runPing({
    count: quick ? 10 : 20,
    signal,
    onSample: (rtt, i) => rtt != null && cb.onLive('ping', rtt, (i + 1) / (quick ? 10 : 20)),
  });
  if (ping.ok === 0) throw new SpeedTestError('unreachable', 'No internet / server unreachable: none of the ping probes got an answer.');

  cb.onPhase('download');
  let downloadMbps: number;
  try {
    downloadMbps = (
      await runDownload({ durationMs: 8000 * k, warmupMs: 1500 * k, signal, onProgress: (v, f) => cb.onLive('download', v, f) })
    ).mbps;
  } catch (e) {
    if (signal.aborted) throw e;
    throw new SpeedTestError('download_failed', `The download measurement failed (${(e as Error).message}).`);
  }

  cb.onPhase('upload');
  let uploadMbps: number;
  try {
    uploadMbps = (await runUpload({ durationMs: 6000 * k, warmupMs: 1000 * k, signal, onProgress: (v, f) => cb.onLive('upload', v, f) })).mbps;
  } catch (e) {
    if (signal.aborted) throw e;
    throw new SpeedTestError('upload_failed', `The upload measurement failed (${(e as Error).message}).`);
  }
  return { ping, downloadMbps, uploadMbps };
}
