import type { Role, UserDTO } from '@campus/shared';
import type { CompatDb } from '../../../infrastructure/db/compat';

export interface UserRow extends UserDTO {
  password_hash: string;
}

const PUBLIC = 'user_id, name, email, role, account_status, created_at';

export class UserRepo {
  constructor(private db: CompatDb) {}

  async byEmail(email: string): Promise<UserRow | undefined> {
    return (await this.db.prepare('SELECT * FROM users WHERE email = ?').get(email)) as UserRow | undefined;
  }
  async byId(id: string): Promise<UserRow | undefined> {
    return (await this.db.prepare('SELECT * FROM users WHERE user_id = ?').get(id)) as UserRow | undefined;
  }
  async publicById(id: string): Promise<UserDTO | undefined> {
    return (await this.db.prepare(`SELECT ${PUBLIC} FROM users WHERE user_id = ?`).get(id)) as UserDTO | undefined;
  }
  async insert(u: { user_id: string; name: string; email: string; password_hash: string; role: Role; created_at: string }) {
    await this.db
      .prepare(
        'INSERT INTO users(user_id, name, email, password_hash, role, created_at) VALUES (@user_id, @name, @email, @password_hash, @role, @created_at)',
      )
      .run(u);
  }
  async update(id: string, patch: Partial<{ name: string; role: Role; account_status: string; password_hash: string }>) {
    const cols = Object.keys(patch);
    if (!cols.length) return;
    await this.db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE user_id = @id`).run({ ...patch, id });
  }
  async list(f: { q?: string; role?: string }): Promise<Array<UserDTO & { tests: number; complaints: number }>> {
    const where: string[] = [];
    const p: unknown[] = [];
    // Postgres LIKE is case-sensitive; ILIKE matches the previous SQLite behaviour.
    if (f.q) (where.push('(u.name ILIKE ? OR u.email ILIKE ?)'), p.push(`%${f.q}%`, `%${f.q}%`));
    if (f.role) (where.push('u.role = ?'), p.push(f.role));
    return (await this.db
      .prepare(
        `SELECT ${PUBLIC.split(', ').map((c) => 'u.' + c).join(', ')},
          (SELECT COUNT(*)::int FROM speed_tests t WHERE t.user_id = u.user_id) AS tests,
          (SELECT COUNT(*)::int FROM complaints c WHERE c.user_id = u.user_id) AS complaints
         FROM users u ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'it_staff' THEN 2 ELSE 3 END, u.name`,
      )
      .all(...p)) as any;
  }
  async countActiveAdmins(): Promise<number> {
    return ((await this.db.prepare(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND account_status = 'active'`).get()) as any).n;
  }
  async idsByRoles(roles: Role[]): Promise<string[]> {
    return (
      (await this.db
        .prepare(`SELECT user_id FROM users WHERE account_status = 'active' AND role IN (${roles.map(() => '?').join(',')})`)
        .all(...roles)) as any[]
    ).map((r) => r.user_id);
  }
  async allActiveIds(): Promise<string[]> {
    return ((await this.db.prepare(`SELECT user_id FROM users WHERE account_status = 'active'`).all()) as any[]).map((r) => r.user_id);
  }
  async staff(): Promise<UserDTO[]> {
    return (await this.db
      .prepare(`SELECT ${PUBLIC} FROM users WHERE role = 'it_staff' AND account_status = 'active' ORDER BY name`)
      .all()) as UserDTO[];
  }
}