import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, History, Info, Play, RotateCcw, Square, Timer } from 'lucide-react';
import { MUET_CAMPUS, type InternetTestDTO } from '@campus/shared';
import { api, ApiError } from '../../api/client';
import { useAppConfig } from '../../api/hooks';
import { Button, Card, PageHeader, cx } from '../../components/ui';
import { fmtDateTime, fmtMbps, fmtMs } from '../../lib/format';
import { Gauge, PHASE_COLOR } from './Gauge';
import { checkCloudflareConnection, runInternetTest, type InternetTestProgress } from './engine/internet';
import type { Phase } from './engine/runner';

const provider = 'Cloudflare edge network';

export function SpeedTestPage() {
  const cfg = useAppConfig();
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<InternetTestProgress>({ phase: 'ping', fraction: 0, valueMbps: null });
  const [result, setResult] = useState<InternetTestDTO | null>(null);
  const [recent, setRecent] = useState<InternetTestDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectionCheck, setConnectionCheck] = useState<{ state: 'idle' | 'checking' | 'success' | 'error'; message: string }>({ state: 'idle', message: '' });
  const [consent, setConsent] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const quick = !!cfg.data?.speedtestQuick || new URLSearchParams(location.search).get('quick') === '1';
  const running = phase === 'ping' || phase === 'download' || phase === 'upload' || phase === 'saving';

  const refreshHistory = async () => {
    const data = await api<{ items: InternetTestDTO[] }>('/internet-tests?limit=5');
    setRecent(data.items);
  };

  useEffect(() => {
    void refreshHistory().catch(() => undefined);
    return () => abortRef.current?.abort();
  }, []);

  const checkConnection = async () => {
    setConnectionCheck({ state: 'checking', message: 'Checking Cloudflare from this browser…' });
    try {
      await checkCloudflareConnection();
      setConnectionCheck({ state: 'success', message: 'Cloudflare is reachable from this browser. You can retry the speed test.' });
    } catch (checkError) {
      setConnectionCheck({ state: 'error', message: checkError instanceof Error ? checkError.message : 'Cloudflare could not be reached from this browser.' });
    }
  };

  const start = async () => {
    if (!consent) return;
    setResult(null);
    setError(null);
    setProgress({ phase: 'ping', fraction: 0, valueMbps: null });
    setPhase('ping');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const measurement = await runInternetTest(ac.signal, quick, (next) => {
        setProgress((current) => ({ ...current, ...next }));
        setPhase(next.phase);
      });
      setPhase('saving');
      const stored = await api<InternetTestDTO>('/internet-tests', {
        method: 'POST',
        json: {
          provider: measurement.provider,
          download_mbps: measurement.downloadMbps,
          upload_mbps: measurement.uploadMbps,
          ping_ms: measurement.pingMs,
          jitter_ms: measurement.jitterMs,
        },
      });
      setResult(stored);
      setPhase('done');
      await refreshHistory();
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setPhase('idle');
        return;
      }
      setProgress({ phase: 'ping', fraction: 0, valueMbps: null });
      setPhase('error');
      setError(e instanceof ApiError && e.status === 429 ? e.message : e instanceof Error ? e.message : 'The internet speed test could not be completed. Please try again.');
    } finally {
      abortRef.current = null;
    }
  };

  const gaugeValue = phase === 'done' ? result?.download_mbps ?? null : phase === 'download' || phase === 'upload' ? progress.valueMbps : null;
  const gaugeUnit = phase === 'done' ? 'Mbps download' : phase === 'download' ? 'Mbps live download' : phase === 'upload' ? 'Mbps live upload' : 'Mbps';

  return (
    <>
      <PageHeader
        title="Internet speed test"
        subtitle="Measures this device’s internet connection to Cloudflare’s edge network. Results are personal and never update campus Wi-Fi health."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          <div className="border-b border-line p-4 sm:p-5">
            <p className="label">Campus context</p>
            <p className="font-medium">{MUET_CAMPUS.name} · Main campus</p>
            <p className="mt-1 text-[13px] text-ink-3">{MUET_CAMPUS.address}</p>
            <p className="mt-1 text-[12px] text-ink-4">{MUET_CAMPUS.latitude}, {MUET_CAMPUS.longitude}</p>
            <span className="mt-3 inline-flex rounded-full bg-[#fff6dc] px-2.5 py-1 text-[12px] font-medium text-[#6b5200]">Off-campus measurement</span>
          </div>
          <div className="px-4 pb-5 pt-3 sm:px-6">
            <Gauge phase={phase} value={gaugeValue} unit={gaugeUnit} fraction={progress.fraction} pingSamples={[]} />
            <InternetPhaseSteps phase={phase} />
            {error && (
              <div className="mt-4 rounded-lg bg-[#fdeaea] px-3 py-2.5 text-sm text-st-critical" role="alert">
                <p>{error}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={checkConnection} disabled={connectionCheck.state === 'checking'}>
                    {connectionCheck.state === 'checking' ? 'Checking connection…' : 'Check Cloudflare connection'}
                  </Button>
                  {connectionCheck.message && <p className="basis-full" role="status">{connectionCheck.message}</p>}
                </div>
              </div>
            )}
            <div className="mt-5 flex flex-col items-center gap-2">
              {!running && (
                <label className="flex max-w-md items-start gap-2 text-left text-[12.5px] leading-relaxed text-ink-3">
                  <input type="checkbox" className="mt-0.5" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                  I agree to send speed-test traffic to Cloudflare and understand its speed-test service may process measurement data.
                </label>
              )}
              {running ? (
                <Button size="lg" variant="secondary" onClick={() => abortRef.current?.abort()} icon={<Square className="h-4 w-4" />} disabled={phase === 'saving'}>Cancel test</Button>
              ) : (
                <Button size="lg" className="min-w-[220px]" onClick={start} disabled={!consent} icon={phase === 'done' || phase === 'error' ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5" />}>
                  {phase === 'done' || phase === 'error' ? 'Run again' : 'Run internet speed test'}
                </Button>
              )}
              <p className="text-center text-[12.5px] text-ink-3">
                {running ? `Measuring your connection to ${provider}. Keep this page open.` : `Usually takes ${quick ? 'under a minute' : 'about a minute'}.`}
              </p>
            </div>
          </div>
        </section>

        <div className="space-y-5">
          {result && <InternetResult result={result} />}
          <div className="card flex gap-2.5 p-3.5 text-[12.5px] leading-relaxed text-ink-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This test measures your current internet connection to {provider}, not MUET Wi-Fi. Cloudflare receives test traffic and may collect measurement data. This result is saved to your account only and is excluded from campus health, outage, and analytics data. No GPS or room location is collected.
            </p>
          </div>
          <RecentInternetTests tests={recent} />
          <Card title="On the MUET campus?" subtitle="Run a room-specific test against the campus server to help monitor campus Wi-Fi health.">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-ink-3">Use this only while connected to MUET Wi-Fi and physically at the selected room.</p>
              <Link to="/campus-test"><Button variant="secondary">Run campus Wi-Fi test</Button></Link>
            </div>
          </Card>
          <p className="text-[12px] text-ink-4">Campus Wi-Fi health results remain separate in <Link className="text-accent hover:underline" to="/history">campus test history</Link>.</p>
        </div>
      </div>
    </>
  );
}

function InternetPhaseSteps({ phase }: { phase: Phase }) {
  const activePhase = phase === 'saving' ? 'upload' : phase;
  const order = ['ping', 'download', 'upload'] as const;
  const activeIndex = order.indexOf(activePhase as (typeof order)[number]);
  const done = phase === 'done' || phase === 'saving';
  const steps = [
    { key: 'ping' as const, label: 'Latency', icon: <Timer className="h-4 w-4" /> },
    { key: 'download' as const, label: 'Download', icon: <ArrowDown className="h-4 w-4" /> },
    { key: 'upload' as const, label: 'Upload', icon: <ArrowUp className="h-4 w-4" /> },
  ];
  return (
    <ol className="mt-2 grid grid-cols-3 gap-2" aria-label="Test progress" aria-live="polite">
      {steps.map((step, index) => {
        const active = !done && index === activeIndex;
        const complete = done || index < activeIndex;
        return (
          <li key={step.key} className={cx('rounded-xl border px-3 py-2.5 transition-colors', active ? 'border-transparent bg-paper' : 'border-line')} style={active ? { boxShadow: `inset 0 0 0 1.5px ${PHASE_COLOR[step.key]}` } : undefined} aria-current={active ? 'step' : undefined}>
            <div className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: active || complete ? PHASE_COLOR[step.key] : '#98a1b3' }}>{step.icon} {step.label}</div>
            <div className="mt-0.5 font-cond text-[18px] font-semibold leading-tight text-ink-3">{complete ? 'Complete' : active ? 'Measuring' : 'Waiting'}</div>
          </li>
        );
      })}
    </ol>
  );
}

function InternetResult({ result }: { result: InternetTestDTO }) {
  return (
    <Card title="Completed internet measurement" subtitle={`Measured to ${provider} · ${fmtDateTime(result.tested_at)}`}>
      <p className="mb-3 text-[12.5px] text-ink-3">Off campus · Campus context: {result.campus_name}</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Download', fmtMbps(result.download_mbps), 'Mbps'],
          ['Upload', fmtMbps(result.upload_mbps), 'Mbps'],
          ['Latency', fmtMs(result.ping_ms), 'ms'],
          ['Jitter', fmtMs(result.jitter_ms), 'ms'],
        ].map(([label, value, unit]) => (
          <div key={label} className="rounded-lg bg-paper/70 px-3 py-2.5">
            <dt className="text-[12px] text-ink-3">{label}</dt>
            <dd className="font-cond text-[21px] font-semibold num">{value}<span className="ml-1 font-sans text-[11px] font-normal text-ink-3">{unit}</span></dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function RecentInternetTests({ tests }: { tests: InternetTestDTO[] }) {
  if (!tests.length) return null;
  return (
    <Card title="Your recent internet tests" actions={<span className="inline-flex items-center gap-1 text-[13px] text-ink-3"><History className="h-4 w-4" /> Personal history</span>} pad={false}>
      <ul>
        {tests.map((test) => (
          <li key={test.test_id} className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 text-[13.5px] last:border-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{test.provider === 'cloudflare' ? 'Cloudflare internet test' : 'Internet test'}</span>
              <span className="text-[12px] text-ink-3">{fmtDateTime(test.tested_at)} · Off campus</span>
            </span>
            <span className="num text-ink-2">{fmtMbps(test.download_mbps)} <span className="text-ink-4">Mbps</span></span>
            <span className="num w-14 text-right text-ink-2">{fmtMs(test.ping_ms)} <span className="text-ink-4">ms</span></span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
