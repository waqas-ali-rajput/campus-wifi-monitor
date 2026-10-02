import { Check } from 'lucide-react';
import { COMPLAINT_STATUSES, COMPLAINT_STATUS_LABELS, type ComplaintStatus } from '@campus/shared';
import { cx } from '../../components/ui';

/** Submitted → Reviewed → Assigned → In Progress → Resolved */
export function StatusStepper({ status, compact }: { status: ComplaintStatus; compact?: boolean }) {
  const idx = COMPLAINT_STATUSES.indexOf(status);
  if (compact) {
    return (
      <div className="flex items-center gap-1" aria-label={`Status: ${COMPLAINT_STATUS_LABELS[status]}`} title={COMPLAINT_STATUS_LABELS[status]}>
        {COMPLAINT_STATUSES.map((s, i) => (
          <span key={s} className={cx('h-1.5 w-5 rounded-full', i <= idx ? (status === 'resolved' ? 'bg-st-excellent' : 'bg-accent') : 'bg-line')} />
        ))}
        <span className="ml-1.5 whitespace-nowrap text-[12.5px] font-medium text-ink-2">{COMPLAINT_STATUS_LABELS[status]}</span>
      </div>
    );
  }
  return (
    <ol className="flex w-full items-start" aria-label="Complaint progress">
      {COMPLAINT_STATUSES.map((s, i) => {
        const done = i < idx || status === 'resolved';
        const cur = i === idx && status !== 'resolved';
        return (
          <li key={s} className="flex flex-1 flex-col items-center text-center" aria-current={cur ? 'step' : undefined}>
            <div className="flex w-full items-center">
              <span className={cx('h-0.5 flex-1', i === 0 ? 'bg-transparent' : i <= idx ? 'bg-accent' : 'bg-line')} />
              <span
                className={cx(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-[12px] font-semibold',
                  done ? (status === 'resolved' ? 'border-st-excellent bg-st-excellent text-white' : 'border-accent bg-accent text-white') : cur ? 'border-accent bg-white text-accent' : 'border-line bg-white text-ink-4',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cx('h-0.5 flex-1', i === COMPLAINT_STATUSES.length - 1 ? 'bg-transparent' : i < idx ? 'bg-accent' : 'bg-line')} />
            </div>
            <span className={cx('mt-1.5 text-[11.5px] sm:text-[12.5px]', cur || done ? 'font-medium text-ink' : 'text-ink-4')}>{COMPLAINT_STATUS_LABELS[s as ComplaintStatus]}</span>
          </li>
        );
      })}
    </ol>
  );
}
