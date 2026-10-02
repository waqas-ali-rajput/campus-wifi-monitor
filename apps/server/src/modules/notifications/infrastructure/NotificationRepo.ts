import type { NotificationDTO } from '@campus/shared';
import type { Db } from '../../../infrastructure/db/connection';

export class NotificationRepo {
  constructor(private db: Db) {}

  insert(n: NotificationDTO) {
    this.db
      .prepare(
        `INSERT INTO notifications(notification_id, user_id, type, title, body, entity_type, entity_id, is_read, created_at)
         VALUES (@notification_id, @user_id, @type, @title, @body, @entity_type, @entity_id, 0, @created_at)`,
      )
      .run(n);
  }
  existsSince(type: string, entityId: string | null, userId: string, since: string): boolean {
    return !!this.db
      .prepare(
        `SELECT 1 FROM notifications WHERE type = ? AND COALESCE(entity_id,'') = COALESCE(?, '') AND user_id = ? AND created_at >= ? LIMIT 1`,
      )
      .get(type, entityId, userId, since);
  }
  list(userId: string, unreadOnly: boolean, limit: number, offset: number) {
    const w = unreadOnly ? 'AND is_read = 0' : '';
    const items = this.db
      .prepare(`SELECT * FROM notifications WHERE user_id = ? ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(userId, limit, offset) as NotificationDTO[];
    const total = (this.db.prepare(`SELECT COUNT(*) n FROM notifications WHERE user_id = ? ${w}`).get(userId) as any).n;
    const unread = (this.db.prepare(`SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND is_read = 0`).get(userId) as any).n;
    return { items, total, unread };
  }
  markRead(id: string, userId: string) {
    return this.db.prepare('UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?').run(id, userId).changes;
  }
  markAll(userId: string) {
    return this.db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(userId).changes;
  }
  purgeReadBefore(before: string) {
    return this.db.prepare('DELETE FROM notifications WHERE is_read = 1 AND created_at < ?').run(before).changes;
  }
}
