import type { Role, UserDTO } from '@campus/shared';
import { AppError, forbidden, notFound } from '../../../shared/errors';
import { newId } from '../../../shared/ports';
import type { Clock } from '../../../shared/time';
import type { UserRepo } from '../infrastructure/UserRepo';
import type { ActivityRepo } from '../../activity/infrastructure/ActivityRepo';

export interface PasswordHasher {
  hash(p: string): string;
  verify(p: string, h: string): boolean;
}

export class UserService {
  constructor(
    private users: UserRepo,
    private activity: ActivityRepo,
    private hasher: PasswordHasher,
    private clock: Clock,
  ) {}

  create(input: { name: string; email: string; password: string; role: Role }, actorId: string | null): UserDTO {
    if (this.users.byEmail(input.email)) throw new AppError('CONFLICT', 'An account with this email already exists.', { email: ['Email already registered'] });
    const now = this.clock.now().toISOString();
    const user_id = newId();
    this.users.insert({
      user_id,
      name: input.name,
      email: input.email.toLowerCase(),
      password_hash: this.hasher.hash(input.password),
      role: input.role,
      created_at: now,
    });
    this.activity.log(actorId ?? user_id, actorId ? 'user.create' : 'user.register', 'user', user_id, { role: input.role, email: input.email }, now);
    return this.users.publicById(user_id)!;
  }

  update(
    id: string,
    patch: { name?: string; role?: Role; account_status?: 'active' | 'suspended'; new_password?: string },
    actorId: string,
  ): UserDTO {
    const u = this.users.byId(id);
    if (!u) throw notFound('User');
    if (patch.role && patch.role !== u.role && id === actorId) throw forbidden('You cannot change your own role.');
    const losesAdmin =
      u.role === 'admin' &&
      u.account_status === 'active' &&
      ((patch.role && patch.role !== 'admin') || patch.account_status === 'suspended');
    if (losesAdmin && this.users.countActiveAdmins() <= 1)
      throw new AppError('CONFLICT', 'The last active administrator cannot be demoted or suspended.');
    if (patch.account_status === 'suspended' && id === actorId) throw forbidden('You cannot suspend your own account.');
    const dbPatch: Record<string, string> = {};
    if (patch.name) dbPatch.name = patch.name;
    if (patch.role) dbPatch.role = patch.role;
    if (patch.account_status) dbPatch.account_status = patch.account_status;
    if (patch.new_password) dbPatch.password_hash = this.hasher.hash(patch.new_password);
    this.users.update(id, dbPatch as any);
    const meta: Record<string, unknown> = { ...patch };
    if (meta.new_password) meta.new_password = '[reset]';
    this.activity.log(actorId, 'user.update', 'user', id, meta, this.clock.now().toISOString());
    return this.users.publicById(id)!;
  }
}
