import type { NotificationDTO } from '@campus/shared';
import type { CompatDb } from '../../../infrastructure/db/compat';

export class NotificationRepo {
  constructor(private db: CompatDb) {}

  async insert(n: NotificationDTO) {
    await this.db
      .prepare(
        `INSERT INTO notifications(notification_id, user_id, type, title, body, entity_type, entity_id, is_read, created_at)
         VALUES (@notification_id, @user_id, @type, @title, @body, @entity_type, @entity_id, FALSE, @created_at)`,
      )
      .run(n);
  }
  async existsSince(type: string, entityId: string | null, userId: string, since: string): Promise<boolean> {
    return !!(await this.db
      .prepare(
        `SELECT 1 FROM notifications WHERE type = ? AND COALESCE(entity_id,'') = COALESCE(?, '') AND user_id = ? AND created_at >= ? LIMIT 1`,
      )
      .get(type, entityId, userId, since));
  }
  async list(userId: string, unreadOnly: boolean, limit: number, offset: number) {
    const w = unreadOnly ? 'AND is_read = FALSE' : '';
    const items = (await this.db
      .prepare(`SELECT * FROM notifications WHERE user_id = ? ${w} ORDER BY created_at DESC, notification_id DESC LIMIT ? OFFSET ?`)
      .all(userId, limit, offset)) as NotificationDTO[];
    const total = ((await this.db.prepare(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = ? ${w}`).get(userId)) as any).n;
    const unread = ((await this.db.prepare(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = ? AND is_read = FALSE`).get(userId)) as any).n;
    return { items, total, unread };
  }
  async markRead(id: string, userId: string): Promise<number> {
    const { changes } = await this.db.prepare('UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?').run(id, userId);
    return changes;
  }
  async markAll(userId: string): Promise<number> {
    const { changes } = await this.db.prepare('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE').run(userId);
    return changes;
  }
  async purgeReadBefore(before: string): Promise<number> {
    const { changes } = await this.db.prepare('DELETE FROM notifications WHERE is_read = TRUE AND created_at < ?').run(before);
    return changes;
  }
}