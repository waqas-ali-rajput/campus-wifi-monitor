import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Info, Play, RotateCcw, Square, Timer } from 'lucide-react';
import { SPEED_TEST_FAILURE_MESSAGE, STATUS_COLORS, STATUS_LABELS, type HealthStatus } from '@campus/shared';
import { api, ApiError } from '../../api/client';
import { useAppConfig, useLocations } from '../../api/hooks';
import { Link } from 'react-router-dom';
import { LocationPicker } from '../../components/LocationPicker';
import { Button, Card, PageHeader, cx } from '../../components/ui';
import { fmtDateTime, fmtMbps, fmtMs, fmtPct } from '../../lib/format';
import { Gauge, PHASE_COLOR } from './Gauge';
import { runSpeedTest, SpeedTestError, type Phase } from './engine/runner';

const STORAGE_KEY = 'cw.lastLocation';

function readLocation(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('location') ?? localStorage.getItem(STORAGE_KEY);
  } catch {
    return new URLSearchParams(window.location.search).get('location');
  }
}

interface CampusResult {
  test_id: string;
  location_name: string;
  download_speed: number;
  upload_speed: number;
  ping: number;
  jitter: number;
  packet_loss: number;
  health_score: number;
  health_status: HealthStatus;
  tested_at: string;
}

export function CampusWifiTestPage() {
  const locations = useLocations();
  const config = useAppConfig();
  const [locationId, setLocationId] = useState<string | null>(readLocation);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fraction, setFraction] = useState(0);
  const [result, setResult] = useState<CampusResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const location = (locations.data?.items ?? []).find((item) => item.location_id === locationId) ?? null;
  const quick = !!config.data?.speedtestQuick || new URLSearchParams(window.location.search).get('quick') === '1';
  const running = ['ping', 'download', 'upload', 'saving'].includes(phase);

  useEffect(() => {
    if (locations.data && locationId && !location) setLocationId(null);
  }, [locations.data, locationId, location]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    if (!location) return;
    setResult(null);
    setError(null);
    setPhase('ping');
    setFraction(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const measured = await runSpeedTest({
        onPhase: (next) => {
          setPhase(next);
          setFraction(0);
        },
        onLive: (_current, _value, progress) => setFraction(progress),
      }, controller.signal, quick);
      setPhase('saving');
      const saved = await api<CampusResult>('/tests', {
        method: 'POST',
        json: {
          location_id: location.location_id,
          download_mbps: measured.downloadMbps,
          upload_mbps: measured.uploadMbps,
          ping_ms: Math.max(0.1, measured.ping.pingMs),
          jitter_ms: measured.ping.jitterMs,
          packet_loss_pct: measured.ping.lossPct,
          client_meta: { quick, scope: 'campus-server', ua: navigator.userAgent.slice(0, 120), conn: (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType },
        },
      });
      setResult(saved);
      setPhase('done');
    } catch (cause) {
      if ((cause as Error).name === 'AbortError') {
        setPhase('idle');
        return;
      }
      setFraction(0);
      setPhase('error');
      setError(cause instanceof SpeedTestError ? cause.detail : cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : SPEED_TEST_FAILURE_MESSAGE);
      if (cause instanceof SpeedTestError) {
        void api('/tests/failures', { method: 'POST', json: { location_id: location.location_id, reason: cause.reason, detail: cause.detail.slice(0, 400) } }).catch(() => undefined);
      }
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <>
      <PageHeader title="Campus Wi-Fi test" subtitle="Measures this device’s connection to the campus server and associates the completed result with the selected room." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          <div className="border-b border-line p-4 sm:p-5">
            <label className="label" htmlFor="campus-location">Campus room</label>
            <LocationPicker
              id="campus-location"
              locations={locations.data?.items ?? []}
              value={locationId}
              onChange={(id) => {
                setLocationId(id);
                try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage unavailable */ }
                setResult(null);
                setError(null);
                setPhase('idle');
              }}
            />
          </div>
          <div className="px-4 pb-5 pt-3 sm:px-6">
            <Gauge phase={phase} value={phase === 'done' ? result?.download_speed ?? null : null} unit={phase === 'done' ? 'Mbps download' : phase === 'ping' ? 'ms' : 'Mbps'} fraction={fraction} pingSamples={[]} />
            <CampusPhaseSteps phase={phase} />
            {error && <p className="mt-4 rounded-lg bg-[#fdeaea] px-3 py-2.5 text-sm text-st-critical" role="alert">{error} No incomplete result was stored.</p>}
            <div className="mt-5 flex flex-col items-center gap-2">
              {running ? (
                <Button size="lg" variant="secondary" onClick={() => abortRef.current?.abort()} icon={<Square className="h-4 w-4" />} disabled={phase === 'saving'}>Cancel test</Button>
              ) : (
                <Button size="lg" className="min-w-[220px]" onClick={start} disabled={!location} icon={phase === 'done' || phase === 'error' ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5" />}>
                  {phase === 'done' || phase === 'error' ? 'Run again' : 'Run campus Wi-Fi test'}
                </Button>
              )}
              <p className="text-[12.5px] text-ink-3">{!location ? 'Select the campus room where you are.' : running ? 'Keep this page open while the test runs.' : `Usually takes about ${quick ? '8' : '20'} seconds.`}</p>
            </div>
          </div>
        </section>
        <div className="space-y-5">
          {result && <CampusResult result={result} />}
          <div className="card flex gap-2.5 p-3.5 text-[12.5px] leading-relaxed text-ink-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>This test measures Wi-Fi plus the LAN path to this app’s server, not public internet/ISP speed. Run it while connected to MUET Wi-Fi and select the room you are physically in. Off-campus results should use the <Link className="text-accent hover:underline" to="/">internet speed test</Link> instead.</p>
          </div>
        </div>
      </div>
    </>
  );
}

function CampusPhaseSteps({ phase }: { phase: Phase }) {
  const index = ['ping', 'download', 'upload'].indexOf(phase);
  const finished = phase === 'saving' || phase === 'done';
  const steps = [
    { key: 'ping' as const, label: 'Ping', icon: <Timer className="h-4 w-4" /> },
    { key: 'download' as const, label: 'Download', icon: <ArrowDown className="h-4 w-4" /> },
    { key: 'upload' as const, label: 'Upload', icon: <ArrowUp className="h-4 w-4" /> },
  ];
  return (
    <ol className="mt-2 grid grid-cols-3 gap-2" aria-label="Campus test progress" aria-live="polite">
      {steps.map((step, i) => {
        const active = i === index;
        const complete = finished || index > i;
        return <li key={step.key} className={cx('rounded-xl border px-3 py-2.5', active && 'bg-paper')} style={active ? { boxShadow: `inset 0 0 0 1.5px ${PHASE_COLOR[step.key]}` } : undefined} aria-current={active ? 'step' : undefined}>
          <div className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: active || complete ? PHASE_COLOR[step.key] : '#98a1b3' }}>{step.icon} {step.label}</div>
          <div className="mt-0.5 text-[13px] text-ink-3">{complete ? 'Complete' : active ? 'Measuring' : 'Waiting'}</div>
        </li>;
      })}
    </ol>
  );
}

function CampusResult({ result }: { result: CampusResult }) {
  return <Card title={`Campus network at ${result.location_name}`} subtitle={`Tested ${fmtDateTime(result.tested_at)} · Campus server`}>
    <p className="mb-3 font-medium" style={{ color: STATUS_COLORS[result.health_status] }}>{STATUS_LABELS[result.health_status]} · Health score {Math.round(result.health_score)}/100</p>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {[
        ['Download', fmtMbps(result.download_speed), 'Mbps'],
        ['Upload', fmtMbps(result.upload_speed), 'Mbps'],
        ['Ping', fmtMs(result.ping), 'ms'],
        ['Jitter', fmtMs(result.jitter), 'ms'],
        ['Packet loss', fmtPct(result.packet_loss), ''],
      ].map(([label, value, unit]) => <div key={label} className="rounded-lg bg-paper/70 px-3 py-2.5">
        <dt className="text-[12px] text-ink-3">{label}</dt>
        <dd className="font-cond text-[21px] font-semibold num">{value}<span className="ml-1 font-sans text-[11px] font-normal text-ink-3">{unit}</span></dd>
      </div>)}
    </dl>
  </Card>;
}
