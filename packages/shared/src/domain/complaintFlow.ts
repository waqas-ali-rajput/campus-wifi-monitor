import { COMPLAINT_STATUSES, type ComplaintStatus, type Role } from '../constants';

/** Submitted → Reviewed → Assigned → In Progress → Resolved (forward only, one step at a time). */
export function nextStatus(from: ComplaintStatus): ComplaintStatus | null {
  const i = COMPLAINT_STATUSES.indexOf(from);
  return i >= 0 && i < COMPLAINT_STATUSES.length - 1 ? COMPLAINT_STATUSES[i + 1]! : null;
}

export type TransitionCheck =
  | { ok: true }
  | { ok: false; code: 'CONFLICT' | 'FORBIDDEN' | 'VALIDATION_ERROR'; message: string };

export function canTransition(
  from: ComplaintStatus,
  to: ComplaintStatus,
  actorRole: Role,
  isAssignee: boolean,
  opts: { assignedStaffProvided?: boolean } = {},
): TransitionCheck {
  if (actorRole === 'user') return { ok: false, code: 'FORBIDDEN', message: 'Only IT staff can update complaints.' };
  const expected = nextStatus(from);
  if (expected !== to)
    return {
      ok: false,
      code: 'CONFLICT',
      message: expected
        ? `A complaint in "${from}" can only move to "${expected}".`
        : 'This complaint is already resolved.',
    };
  if (to === 'assigned' && !opts.assignedStaffProvided)
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Choose an IT staff member to assign.' };
  if ((to === 'in_progress' || to === 'resolved') && actorRole === 'it_staff' && !isAssignee)
    return { ok: false, code: 'FORBIDDEN', message: 'Only the assignee, a manager or an admin can do this.' };
  return { ok: true };
}

/** The legal next statuses this actor may choose (for rendering buttons). */
export function nextStatuses(from: ComplaintStatus, actorRole: Role, isAssignee: boolean): ComplaintStatus[] {
  const n = nextStatus(from);
  if (!n) return [];
  const check = canTransition(from, n, actorRole, isAssignee, { assignedStaffProvided: true });
  return check.ok ? [n] : [];
}
