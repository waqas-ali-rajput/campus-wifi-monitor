import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, Table2, BarChart3, X } from 'lucide-react';
import { STATUS_COLORS, STATUS_LABELS, type LocationStatus } from '@campus/shared';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// ---------- Button ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-ink shadow-sm disabled:bg-ink-4',
  secondary: 'bg-white text-ink border border-line-strong hover:border-ink-4 hover:bg-paper/60',
  ghost: 'text-ink-2 hover:bg-ink/5',
  quiet: 'text-accent hover:bg-accent-soft',
  danger: 'bg-st-critical text-white hover:bg-[#7f1515]',
};
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
  const sz = size === 'sm' ? 'h-8 px-3 text-[13px] gap-1.5' : size === 'lg' ? 'h-12 px-6 text-base gap-2' : 'h-10 px-4 text-sm gap-2';
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 select-none', sz, variants[variant], className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ---------- Status ----------
export function StatusDot({ status, size = 10 }: { status: LocationStatus; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: STATUS_COLORS[status] }} />;
}
export function StatusBadge({ status, score, stale, size = 'md' }: { status: LocationStatus; score?: number | null; stale?: boolean; size?: 'sm' | 'md' }) {
  const color = STATUS_COLORS[status];
  return (
    <span
      className={cx('inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap', size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-[13px]')}
      style={{ borderColor: `${color}55`, background: `${color}14`, color: status === 'fair' ? '#7a5d00' : status === 'good' ? '#13742f' : color }}
      title={stale ? 'Based on older tests (no tests in the last 2 hours)' : undefined}
    >
      <StatusDot status={status} size={8} />
      {STATUS_LABELS[status]}
      {score != null && <span className="num opacity-80">· {Math.round(score)}</span>}
      {stale && <span className="opacity-70">(stale)</span>}
    </span>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'ok'; className?: string }) {
  const tones = {
    neutral: 'bg-paper text-ink-2 border-line',
    accent: 'bg-accent-soft text-accent-ink border-accent/20',
    warn: 'bg-[#fff6dc] text-[#7a5d00] border-[#f2d27a]',
    danger: 'bg-[#fdeaea] text-st-critical border-[#f3b7b7]',
    ok: 'bg-[#e6f6ec] text-[#13742f] border-[#a9dfbc]',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

// ---------- Layout bits ----------
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-[70ch] text-[14px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true, subtitle }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {subtitle && <p className="text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-3" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-paper text-ink-3">{icon ?? <Inbox className="h-5 w-5" />}</div>
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorPanel({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#f3b7b7] bg-[#fdf3f3] p-4 text-sm text-[#7f1515]" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{msg}</div>
      {retry && (
        <button onClick={retry} className="font-medium underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}

/** Loading / error / empty wrapper used by every list. */
export function QueryState({ q, empty, children }: { q: { isLoading: boolean; error: unknown; refetch: () => unknown }; empty?: boolean | ReactNode; children: ReactNode }) {
  if (q.isLoading) return <Spinner />;
  if (q.error) return <div className="p-4"><ErrorPanel error={q.error} retry={() => q.refetch()} /></div>;
  if (empty) return <>{empty === true ? <EmptyState title="Nothing here yet" /> : empty}</>;
  return <>{children}</>;
}

// ---------- Forms ----------
export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-[13px] text-st-critical">{error}</p> : hint ? <p className="mt-1 text-[12.5px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md', label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }>; size?: 'sm' | 'md'; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line-strong bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[13px]',
            value === o.value ? 'bg-ink text-white' : 'text-ink-2 hover:bg-paper',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-[13px] text-ink-3">
      <span className="num">
        {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" icon={<ChevronLeft className="h-4 w-4" />} />
        <span className="num px-1">
          {page} / {pages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" icon={<ChevronRight className="h-4 w-4" />} />
      </div>
    </div>
  );
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={cx('max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white shadow-pop animate-rise sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-paper" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------- Chart frame with an accessible table alternative ----------
export function ChartFrame({ title, subtitle, table, children, actions, height = 260, legend }: { title: string; subtitle?: ReactNode; table: { columns: string[]; rows: Array<Array<ReactNode>> }; children: ReactNode; actions?: ReactNode; height?: number; legend?: ReactNode }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Card
      title={title}
      subtitle={subtitle}
      actions={
        <>
          {actions}
          <Segmented
            size="sm"
            label={`${title} view`}
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: <BarChart3 className="h-3.5 w-3.5" aria-label="Chart" /> },
              { value: 'table', label: <Table2 className="h-3.5 w-3.5" aria-label="Table" /> },
            ]}
          />
        </>
      }
    >
      {view === 'chart' ? (
        <>
          {legend && <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">{legend}</div>}
          <div style={{ height }}>{children}</div>
        </>
      ) : (
        <div className="max-h-[320px] overflow-auto">
          <table className="table-base">
            <thead>
              <tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>{r.map((v, j) => <td key={j} className="num">{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function LegendItem({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={line ? 'h-0.5 w-4 rounded' : 'h-2.5 w-2.5 rounded-sm'} style={{ background: color }} />
      {label}
    </span>
  );
}

/** Tooltip body for Recharts — text in ink, colour only on the swatch. */
export function ChartTooltip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] shadow-pop">
      <div className="mb-1 font-medium text-ink">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-ink-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color || p.fill || p.stroke }} />
          <span>{p.name}</span>
          <span className="num ml-auto pl-3 font-medium text-ink">{fmt ? fmt(p.value, p.dataKey) : p.value ?? '–'}</span>
        </div>
      ))}
    </div>
  );
}

export const AXIS = { stroke: '#98a1b3', fontSize: 11.5, tickLine: false, axisLine: false } as const;
export const GRID = { stroke: '#e6eaf0', vertical: false } as const;
