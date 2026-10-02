import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, MessageSquareText, Sparkles, StickyNote } from 'lucide-react';
import { COMPLAINT_STATUS_LABELS, COMPLAINT_TYPE_LABELS, type ComplaintStatus } from '@campus/shared';
import { api, ApiError } from '../../api/client';
import { useApiMutation, useComplaint } from '../../api/hooks';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Button, Card, ErrorPanel, PageHeader, Spinner, StatusBadge } from '../../components/ui';
import { fmtDateTime, fmtMbps, fmtMs, fmtPct, fmtTime } from '../../lib/format';
import { StatusStepper } from './StatusStepper';
import { pushToast } from '../notifications/Toasts';

const ACTION: Record<ComplaintStatus, string> = {
  submitted: 'Submit',
  reviewed: 'Mark as reviewed',
  assigned: 'Assign',
  in_progress: 'Start investigation',
  resolved: 'Mark as resolved',
};

export function ComplaintDetailPage() {
  const { id } = useParams();
  const { can, user } = useAuth();
  const q = useComplaint(id);
  const staffView = can('complaints.transition');
  const [assignee, setAssignee] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const transition = useApiMutation(
    (v: { to: ComplaintStatus; assigned_staff?: string; note?: string }) => api(`/complaints/${id}/transition`, { method: 'POST', json: v }),
    [['complaints'], ['dashboard'], ['analytics']],
  );
  const addNote = useApiMutation((v: { note: string }) => api(`/complaints/${id}/notes`, { method: 'POST', json: v }), [['complaints']]);

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorPanel error={q.error} retry={() => q.refetch()} />;
  const c = q.data;
  const next = c.allowed_next[0];
  const nextAny = (['submitted', 'reviewed', 'assigned', 'in_progress', 'resolved'] as ComplaintStatus[])[['submitted', 'reviewed', 'assigned', 'in_progress', 'resolved'].indexOf(c.status) + 1];

  const doTransition = async (to: ComplaintStatus) => {
    setErr(null);
    try {
      await transition.mutateAsync({ to, assigned_staff: to === 'assigned' ? assignee || undefined : undefined, note: note.trim() || undefined });
      setNote('');
      pushToast({ title: `Complaint ${COMPLAINT_STATUS_LABELS[to].toLowerCase()}`, tone: to === 'resolved' ? 'ok' : 'info' });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Update failed');
    }
  };

  return (
    <>
      <Link to={staffView ? '/it/complaints' : '/complaints'} className="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {staffView ? 'Complaint queue' : 'My complaints'}
      </Link>
      <PageHeader
        title={`${COMPLAINT_TYPE_LABELS[c.complaint_type]} · ${c.location_name}`}
        subtitle={`Reported by ${c.user_name} on ${fmtDateTime(c.created_at)} · ${c.building}`}
        actions={c.location_status && <StatusBadge status={c.location_status} />}
      />
      <div className="card mb-5 px-4 py-5 sm:px-8">
        <StatusStepper status={c.status} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Description">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{c.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>{COMPLAINT_TYPE_LABELS[c.complaint_type]}</Badge>
              {staffView && c.ai_category && (
                <Badge tone={c.ai_category !== c.complaint_type ? 'accent' : 'neutral'}>
                  <Sparkles className="h-3 w-3" /> AI suggests: {COMPLAINT_TYPE_LABELS[c.ai_category]} ({Math.round((c.ai_confidence ?? 0) * 100)}%)
                </Badge>
              )}
              {c.assigned_name && <Badge tone="accent">Assigned to {c.assigned_name}</Badge>}
            </div>
          </Card>

          {c.related_test ? (
            <Card title="Attached speed test" subtitle={`${c.related_test.location_name} · ${fmtTime(c.related_test.tested_at)}`} actions={<StatusBadge status={c.related_test.health_status} score={c.related_test.health_score} size="sm" />}>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Download', `${fmtMbps(c.related_test.download_speed)} Mbps`],
                  ['Upload', `${fmtMbps(c.related_test.upload_speed)} Mbps`],
                  ['Ping', `${fmtMs(c.related_test.ping)} ms`],
                  ['Packet loss', fmtPct(c.related_test.packet_loss)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-paper/70 px-3 py-2">
                    <dt className="text-[12px] text-ink-3">{k}</dt>
                    <dd className="font-cond text-[20px] font-semibold num">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : (
            <Card title="Attached speed test"><p className="text-sm text-ink-3">No speed test was attached to this complaint.</p></Card>
          )}

          <Card title="Timeline" pad={false}>
            <ol className="relative px-4 py-3">
              {c.events.map((e, i) => (
                <li key={e.event_id} className="relative flex gap-3 pb-4 last:pb-1">
                  {i < c.events.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-line" />}
                  <span className="relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line bg-white text-ink-3">
                    {e.kind === 'note' ? <StickyNote className="h-3.5 w-3.5" /> : e.kind === 'created' ? <MessageSquareText className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1 text-[13.5px]">
                    <div>
                      <b className="font-medium">{e.actor_name}</b>{' '}
                      <span className="text-ink-2">
                        {e.kind === 'created' ? 'submitted the complaint' : e.kind === 'note' ? 'added a note' : `moved it to ${COMPLAINT_STATUS_LABELS[e.to_status!]}`}
                      </span>
                    </div>
                    {e.note && <div className="mt-1 rounded-lg bg-paper/70 px-3 py-2 text-ink-2">{e.note}</div>}
                    <div className="mt-0.5 text-[12px] text-ink-4">{fmtDateTime(e.created_at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {staffView ? (
          <div className="space-y-5">
            <Card title="Update status" subtitle="Complaints move one step at a time.">
              {c.status === 'resolved' ? (
                <p className="text-sm text-ink-2">Resolved {fmtDateTime(c.resolved_at)}. The reporter has been notified.</p>
              ) : (
                <div className="space-y-3">
                  {nextAny === 'assigned' && (
                    <div>
                      <label className="label" htmlFor="assignee">Assign to</label>
                      <select id="assignee" className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                        <option value="">Choose IT staff…</option>
                        {c.staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}{s.user_id === user?.user_id ? ' (me)' : ''}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="label" htmlFor="tnote">Note (optional)</label>
                    <textarea id="tnote" rows={3} className="input" placeholder={nextAny === 'resolved' ? 'What fixed it?' : 'Investigation or maintenance note'} value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                  {err && <p className="text-sm text-st-critical">{err}</p>}
                  {next ? (
                    <Button className="w-full" onClick={() => doTransition(next)} loading={transition.isPending} disabled={next === 'assigned' && !assignee}>
                      {ACTION[next]}
                    </Button>
                  ) : (
                    <p className="rounded-lg bg-paper px-3 py-2 text-[13px] text-ink-3">
                      The next step ({COMPLAINT_STATUS_LABELS[nextAny!]}) can only be done by the assignee, a manager or an admin.
                    </p>
                  )}
                  <Button
                    variant="secondary"
                    className="w-full"
                    icon={<StickyNote className="h-4 w-4" />}
                    disabled={!note.trim()}
                    loading={addNote.isPending}
                    onClick={async () => {
                      await addNote.mutateAsync({ note: note.trim() });
                      setNote('');
                    }}
                  >
                    Add note only
                  </Button>
                </div>
              )}
            </Card>
            <Card title="Location">
              <p className="text-sm text-ink-2">{c.location_name} · {c.building}</p>
              <Link to={`/it/locations/${c.location_id}`} className="mt-2 inline-block text-[13px] font-medium text-accent hover:underline">Open location health</Link>
            </Card>
          </div>
        ) : (
          <Card title="What happens next">
            <p className="text-sm leading-relaxed text-ink-2">
              IT support reviews every complaint, assigns it to a technician and marks it resolved once fixed. You'll get a notification at each important step.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
