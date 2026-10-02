import { useMemo, useState } from 'react';
import { STATUS_COLORS, STATUS_LABELS, type LocationDTO, type LocationStatus } from '@campus/shared';
import { fmtAgo, fmtMbps, fmtMs } from '../../lib/format';
import { StatusDot } from '../../components/ui';

const W = 100;
const H = 100;

/** Campus heatmap (§10.2): each location is a circle at (map_x, map_y), coloured by status; buildings drawn as footprints. */
export function Heatmap({ locations, onSelect, selectedId, compact }: { locations: LocationDTO[]; onSelect?: (l: LocationDTO) => void; selectedId?: string | null; compact?: boolean }) {
  const [hover, setHover] = useState<LocationDTO | null>(null);
  const buildings = useMemo(() => {
    const m = new Map<string, LocationDTO[]>();
    for (const l of locations) m.set(l.building, [...(m.get(l.building) ?? []), l]);
    return [...m].map(([name, ls]) => {
      const xs = ls.map((l) => l.map_x);
      const ys = ls.map((l) => l.map_y * (H / 100));
            const w = Math.max(Math.max(...xs) - Math.min(...xs) + 18, 24);
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
      return { name, x: cx - w / 2, y: Math.min(...ys) - 8, w, h: Math.max(...ys) - Math.min(...ys) + 17 };
    });
  }, [locations]);

  const tip = hover;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full select-none rounded-lg bg-[#f6f8fb]" role="img" aria-label="Campus network heatmap">
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#e6eaf0" strokeWidth="0.2" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#grid)" />
        {/* campus paths */}
        <path d={`M 4 ${H * 0.55} C 30 ${H * 0.5}, 60 ${H * 0.62}, 96 ${H * 0.52}`} stroke="#dfe5ee" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d={`M 45 4 C 48 ${H * 0.35}, 42 ${H * 0.7}, 50 ${H - 4}`} stroke="#dfe5ee" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        {buildings.map((b) => (
          <g key={b.name}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="2.5" fill="#ffffff" stroke="#cdd5e1" strokeWidth="0.35" />
            {!compact && (
              <text x={b.x + 1.6} y={b.y + 2.9} fontSize="1.9" fill="#66728a" fontWeight="500">
                {b.name}
              </text>
            )}
          </g>
        ))}
        {locations.map((l) => {
          const x = l.map_x;
          const y = l.map_y * (H / 100);
          const color = STATUS_COLORS[l.current_status];
          const sel = selectedId === l.location_id || hover?.location_id === l.location_id;
          return (
            <g
              key={l.location_id}
              tabIndex={0}
              role="button"
              aria-label={`${l.location_name}: ${STATUS_LABELS[l.current_status]}${l.current_score != null ? `, score ${Math.round(l.current_score)}` : ''}${l.active_outage ? ', outage active' : ''}`}
              onMouseEnter={() => setHover(l)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(l)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect?.(l)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect?.(l)}
              className="cursor-pointer outline-none"
            >
              <circle cx={x} cy={y} r="7" fill="transparent" />
              {(l.active_outage || l.current_status === 'critical') && (
                <circle cx={x} cy={y} r="3.4" fill={color} opacity="0.5" className="origin-center animate-pulseRing" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
              )}
              <circle cx={x} cy={y} r={sel ? 4.6 : 3.8} fill={color} fillOpacity="0.16" />
              <circle cx={x} cy={y} r={sel ? 3 : 2.5} fill={color} stroke="#fff" strokeWidth="0.6" />
              {l.active_maintenance && <circle cx={x + 2.6} cy={y - 2.6} r="1.1" fill="#eda100" stroke="#fff" strokeWidth="0.35" />}
              <text x={x} y={y + 5.6} textAnchor="middle" fontSize={compact ? 1.9 : 2.05} fontWeight="500" fill="#14223b" paintOrder="stroke" stroke="#f6f8fb" strokeWidth="0.8">
                {l.location_name}
              </text>
              {!compact && l.current_score != null && (
                <text x={x} y={y + 7.9} textAnchor="middle" fontSize="1.75" fill="#66728a" paintOrder="stroke" stroke="#f6f8fb" strokeWidth="0.8">
                  {STATUS_LABELS[l.current_status]} · {Math.round(l.current_score)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 rounded-lg border border-line bg-white p-3 text-[12.5px] shadow-pop"
          style={{ left: `${Math.min(84, Math.max(16, tip.map_x))}%`, top: `${Math.min(70, (tip.map_y * (H / 100) / H) * 100 + 6)}%` }}
        >
          <div className="flex items-center gap-2 font-medium text-ink">
            <StatusDot status={tip.current_status} /> {tip.location_name}
          </div>
          <div className="mt-0.5 text-ink-3">{tip.building}</div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-ink-2">
            <span>Status</span>
            <span className="text-right font-medium">{STATUS_LABELS[tip.current_status]}{tip.current_score != null ? ` · ${Math.round(tip.current_score)}` : ''}</span>
            <span>Avg download</span>
            <span className="num text-right">{fmtMbps(tip.today.avg_download)} Mbps</span>
            <span>Avg ping</span>
            <span className="num text-right">{fmtMs(tip.today.avg_ping)} ms</span>
            <span>Tests / complaints</span>
            <span className="num text-right">{tip.today.tests} / {tip.today.complaints}</span>
          </div>
          {tip.active_outage && <div className="mt-2 font-medium text-st-critical">Outage active</div>}
          {tip.active_maintenance && <div className="mt-1 text-[#7a5d00]">Maintenance in progress</div>}
          <div className="mt-1.5 text-[11.5px] text-ink-4">Last tested {fmtAgo(tip.last_tested_at)}{tip.current_stale ? ' (stale)' : ''}</div>
        </div>
      )}
    </div>
  );
}

export function StatusLegend() {
  const items: LocationStatus[] = ['excellent', 'good', 'fair', 'poor', 'critical', 'unknown'];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
      {items.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <StatusDot status={s} /> {STATUS_LABELS[s]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[#eda100]" /> Maintenance
      </span>
    </div>
  );
}
