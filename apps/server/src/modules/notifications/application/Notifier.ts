import type { NotificationType, Role } from '@campus/shared';
import { newId, type EventPublisher } from '../../../shared/ports';
import type { Clock } from '../../../shared/time';
import type { NotificationRepo } from '../infrastructure/NotificationRepo';
import type { UserRepo } from '../../users/infrastructure/UserRepo';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string | null;
  entityId?: string | null;
  recipients: string[];
}

/** Writes notification rows (deduped per type+entity+recipient for 10 minutes) and pushes them over SSE (§11.3). */
export class Notifier {
  constructor(
    private repo: NotificationRepo,
    private users: UserRepo,
    private events: EventPublisher,
    private clock: Clock,
  ) {}

  async usersWithRoles(...roles: Role[]): Promise<string[]> {
    return this.users.idsByRoles(roles);
  }
  async allActiveUsers(): Promise<string[]> {
    return this.users.allActiveIds();
  }

  async notify(n: NotifyInput): Promise<number> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - 10 * 60000).toISOString();
    let sent = 0;
    for (const userId of new Set(n.recipients)) {
      if (await this.repo.existsSince(n.type, n.entityId ?? null, userId, since)) continue;
      const row = {
        notification_id: newId(),
        user_id: userId,
        type: n.type,
        title: n.title,
        body: n.body ?? '',
        entity_type: n.entityType ?? null,
        entity_id: n.entityId ?? null,
        is_read: 0,
        created_at: now.toISOString(),
      };
      await this.repo.insert(row);
      this.events.publish('notification', row, { userIds: [userId] });
      sent++;
    }
    return sent;
  }
}