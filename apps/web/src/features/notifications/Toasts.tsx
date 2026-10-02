import { useEffect, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, X } from 'lucide-react';
import { cx } from '../../components/ui';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: 'info' | 'ok' | 'danger';
  onClick?: () => void;
}
type Push = Omit<Toast, 'id'>;
const subs = new Set<(t: Toast) => void>();
let seq = 0;
export const pushToast = (t: Push) => subs.forEach((s) => s({ ...t, id: ++seq }));

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const s = (t: Toast) => {
      setItems((xs) => [...xs.slice(-3), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 6500);
    };
    subs.add(s);
    return () => void subs.delete(s);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pointer-events-auto flex animate-rise items-start gap-3 rounded-xl border bg-white p-3.5 shadow-pop',
            t.tone === 'danger' ? 'border-[#f3b7b7]' : t.tone === 'ok' ? 'border-[#a9dfbc]' : 'border-line',
            t.onClick && 'cursor-pointer',
          )}
          onClick={() => {
            t.onClick?.();
            setItems((xs) => xs.filter((x) => x.id !== t.id));
          }}
        >
          <span className={cx('mt-0.5', t.tone === 'danger' ? 'text-st-poor' : t.tone === 'ok' ? 'text-st-excellent' : 'text-accent')}>
            {t.tone === 'danger' ? <AlertTriangle className="h-5 w-5" /> : t.tone === 'ok' ? <CheckCircle2 className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t.title}</div>
            {t.body && <div className="mt-0.5 line-clamp-2 text-[13px] text-ink-3">{t.body}</div>}
          </div>
          <button
            className="rounded p-0.5 text-ink-4 hover:text-ink"
            aria-label="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              setItems((xs) => xs.filter((x) => x.id !== t.id));
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
