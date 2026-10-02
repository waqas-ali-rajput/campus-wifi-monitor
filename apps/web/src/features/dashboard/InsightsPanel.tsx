import { Link } from 'react-router-dom';
import { AlertTriangle, Activity, Clock, Sparkles, TrendingDown, Radar } from 'lucide-react';
import type { InsightDTO } from '@campus/shared';
import { useInsightSummary, useInsights, useRecommendations } from '../../api/hooks';
import { Card, QueryState, EmptyState, cx } from '../../components/ui';
import { fmtAgo } from '../../lib/format';

const KIND: Record<string, { label: string; icon: JSX.Element }> = {
  problem_detected: { label: 'Problem detected', icon: <AlertTriangle /> },
  anomaly: { label: 'Anomaly', icon: <Activity /> },
  trend_drop: { label: 'Performance trend', icon: <TrendingDown /> },
  outage_risk: { label: 'Outage prediction', icon: <Radar /> },
  peak_forecast: { label: 'Peak usage forecast', icon: <Clock /> },
};

export function InsightItem({ i }: { i: InsightDTO }) {
  const k = KIND[i.kind] ?? { label: i.kind, icon: <Sparkles /> };
  const data = (() => {
    try {
      return JSON.parse(i.data_json || '{}');
    } catch {
      return {};
    }
  })();
  const tip = i.kind === 'trend_drop' && data.recentMean != null ? `Recent average ${data.recentMean} vs usual ${data.usualMean}` : undefined;
  return (
    <li className="flex items-start gap-3 border-b border-line/70 px-4 py-3 last:border-0" title={tip}>
      <span
        className={cx(
          'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full [&_svg]:h-4 [&_svg]:w-4',
          i.severity === 'critical' ? 'bg-[#fdeaea] text-st-critical' : i.severity === 'warning' ? 'bg-[#fff6dc] text-[#8a6a00]' : 'bg-accent-soft text-accent',
        )}
      >
        {k.icon}
      </span>
      <div className="min-w-0 flex-1 text-[13.5px]">
        <div className="text-[12px] font-medium text-ink-3">
          {k.label}
          {i.location_name ? ` · ` : ''}
          {i.location_id && i.location_name && <Link className="hover:text-accent" to={`/it/locations/${i.location_id}`}>{i.location_name}</Link>}
        </div>
        <div className="text-ink">{i.message}</div>
        {tip && <div className="text-[12px] text-ink-3">{tip}</div>}
        <div className="text-[11.5px] text-ink-4">Updated {fmtAgo(i.updated_at)}</div>
      </div>
    </li>
  );
}

export function InsightsFeed({ locationId }: { locationId?: string }) {
  const q = useInsights(locationId);
  return (
    <Card title="Insights" subtitle="Automatic problem, anomaly, trend and outage-risk detection." pad={false}>
      <QueryState q={q} empty={!q.data?.items.length && <EmptyState icon={<Sparkles className="h-5 w-5" />} title="Nothing unusual right now" />}>
        <ul className="max-h-[420px] overflow-y-auto">{q.data?.items.map((i) => <InsightItem key={i.insight_id} i={i} />)}</ul>
      </QueryState>
    </Card>
  );
}

export function AiSummary() {
  const q = useInsightSummary();
  return (
    <section className="card relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1 bg-accent" />
      <div className="p-4 pl-5">
        <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-accent-ink">
          <Sparkles className="h-4 w-4" /> Network summary
          {q.data?.reworded && <span className="text-ink-4">(reworded locally)</span>}
        </div>
        <QueryState q={q}>
          {q.data?.reworded ? (
            <p className="text-[14.5px] leading-relaxed">{q.data.text}</p>
          ) : (
            <ul className="space-y-1.5 text-[14.5px] leading-relaxed">
              {q.data?.locationSentences.map((s: any) => (
                <li key={s.sentence} className="font-medium text-ink">{s.sentence}</li>
              ))}
              {q.data?.campusSentences.map((s: string) => (
                <li key={s} className="text-ink-2">{s}</li>
              ))}
            </ul>
          )}
        </QueryState>
      </div>
    </section>
  );
}

export function Recommendations({ limit = 5 }: { limit?: number }) {
  const q = useRecommendations();
  return (
    <Card title="Inspect first" subtitle="Ranked by current health, poor-result history, complaints and outages." pad={false}>
      <QueryState q={q}>
        <ol>
          {q.data?.items.slice(0, limit).map((r) => (
            <li key={r.locationId} className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 last:border-0">
              <span className="font-cond w-5 text-center text-[18px] font-semibold text-ink-4 num">{r.rank}</span>
              <div className="min-w-0 flex-1">
                <Link to={`/it/locations/${r.locationId}`} className="font-medium hover:text-accent">{r.locationName}</Link>
                <div className="truncate text-[12.5px] text-ink-3" title={r.reason}>{r.reason}</div>
              </div>
              <div className="w-24 shrink-0">
                <div className="flex justify-between text-[11.5px] text-ink-3"><span>Priority</span><span className="num font-medium text-ink">{r.priority}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.priority)}%`, background: r.priority >= 60 ? '#ef4444' : r.priority >= 35 ? '#eab308' : '#22c55e' }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </QueryState>
    </Card>
  );
}
