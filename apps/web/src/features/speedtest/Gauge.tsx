import type { Phase } from './engine/runner';

const TICKS = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000];
const START = 135; // degrees, 0 = 3 o'clock, clockwise
const SWEEP = 270;

/** Piecewise-log position 0..1 of a Mbps value on the dial. */
export function dialPos(mbps: number) {
  if (!(mbps > 0)) return 0;
  for (let i = 1; i < TICKS.length; i++) {
    if (mbps <= TICKS[i]!) {
      const a = TICKS[i - 1]!;
      const b = TICKS[i]!;
      const f = a === 0 ? mbps / b : Math.log(mbps / a) / Math.log(b / a);
      return (i - 1 + f) / (TICKS.length - 1);
    }
  }
  return 1;
}

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};
function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export const PHASE_COLOR = { ping: '#1baf7a', download: '#2a78d6', upload: '#eb6834' } as const;

export function Gauge({ phase, value, unit, fraction, pingSamples }: { phase: Phase; value: number | null; unit: string; fraction: number; pingSamples: number[] }) {
  const cx = 160;
  const cy = 160;
  const r = 128;
  const isSpeed = phase === 'download' || phase === 'upload' || phase === 'done' || phase === 'saving';
  const color = phase === 'ping' ? PHASE_COLOR.ping : phase === 'upload' ? PHASE_COLOR.upload : PHASE_COLOR.download;
  const pos = isSpeed && value != null ? dialPos(value) : 0;
  const end = START + SWEEP * Math.max(0.002, pos);
  const label = { idle: 'Ready', ping: 'Measuring latency', download: 'Download', upload: 'Upload', saving: 'Saving result', done: 'Complete', error: 'Test failed' }[phase];
  const display = value == null ? '–' : value < 10 ? value.toFixed(1) : Math.round(value).toString();

  return (
    <svg viewBox="0 0 320 300" className="mx-auto block w-full max-w-[380px]" role="img" aria-label={`${label}${value != null ? `: ${display} ${unit}` : ''}`}>
      {/* track */}
      <path d={arc(cx, cy, r, START, START + SWEEP)} stroke="#e3e8ef" strokeWidth="16" fill="none" strokeLinecap="round" />
      {/* phase progress ring */}
      {phase !== 'idle' && phase !== 'done' && phase !== 'error' && (
        <path d={arc(cx, cy, r + 17, START, START + SWEEP * Math.max(0.003, Math.min(1, fraction)))} stroke={color} strokeOpacity="0.35" strokeWidth="3" fill="none" strokeLinecap="round" style={{ transition: 'all .2s linear' }} />
      )}
      {/* value arc */}
      {isSpeed && <path d={arc(cx, cy, r, START, end)} stroke={color} strokeWidth="16" fill="none" strokeLinecap="round" style={{ transition: 'all .15s linear' }} />}
      {/* ticks */}
      {TICKS.map((t, i) => {
        const deg = START + (SWEEP * i) / (TICKS.length - 1);
        const [x1, y1] = polar(cx, cy, r - 14, deg);
        const [x2, y2] = polar(cx, cy, r - 20, deg);
        const [lx, ly] = polar(cx, cy, r - 34, deg);
        return (
          <g key={t}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#98a1b3" strokeWidth="1.5" />
            <text x={lx} y={ly + 4} textAnchor="middle" fontSize="11" fill="#66728a" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {t}
            </text>
          </g>
        );
      })}
      {/* ping samples as a dot strip */}
      {phase === 'ping' && pingSamples.length > 0 && (
        <g>
          {pingSamples.slice(-20).map((s, i, arr) => {
            const max = Math.max(60, ...arr);
            return <rect key={i} x={110 + i * 5} y={232 - (s / max) * 26} width="3" height={(s / max) * 26 + 1} rx="1" fill={PHASE_COLOR.ping} />;
          })}
        </g>
      )}
      <text x={cx} y={cy - 2} textAnchor="middle" fontFamily='"IBM Plex Sans Condensed", sans-serif' fontWeight="600" fontSize="64" fill="#14223b" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {phase === 'idle' ? '' : display}
      </text>
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize="15" fill="#66728a">
        {phase === 'idle' ? '' : unit}
      </text>
      <text x={cx} y={phase === 'idle' ? cy + 6 : cy + 50} textAnchor="middle" fontSize={phase === 'idle' ? 18 : 13} fontWeight="500" fill={phase === 'idle' ? '#3d4a60' : color}>
        {phase === 'idle' ? 'Ready to test' : label}
      </text>
    </svg>
  );
}
