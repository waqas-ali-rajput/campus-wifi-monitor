import type { UserDTO } from '@campus/shared';
import { AppError } from '../../../shared/errors';
import type { Clock } from '../../../shared/time';
import type { UserRepo } from '../../users/infrastructure/UserRepo';
import type { PasswordHasher, UserService } from '../../users/application/UserService';
import type { ActivityRepo } from '../../activity/infrastructure/ActivityRepo';

export interface TokenSigner {
  sign(p: { sub: string; role: UserDTO['role'] }): string;
}

export class AuthService {
  constructor(
    private users: UserRepo,
    private userService: UserService,
    private hasher: PasswordHasher,
    private tokens: TokenSigner,
    private activity: ActivityRepo,
    private clock: Clock,
  ) {}

  login(email: string, password: string): { token: string; user: UserDTO } {
    const u = this.users.byEmail(email.trim());
    if (!u || !this.hasher.verify(password, u.password_hash))
      throw new AppError('UNAUTHENTICATED', 'Email or password is incorrect.');
    if (u.account_status !== 'active') throw new AppError('FORBIDDEN', 'This account is suspended. Contact the administrator.');
    if (u.role !== 'user') this.activity.log(u.user_id, 'auth.login', 'user', u.user_id, {}, this.clock.now().toISOString());
    const user = this.users.publicById(u.user_id)!;
    return { token: this.tokens.sign({ sub: u.user_id, role: u.role }), user };
  }

  register(input: { name: string; email: string; password: string }) {
    const user = this.userService.create({ ...input, role: 'user' }, null);
    return { token: this.tokens.sign({ sub: user.user_id, role: user.role }), user };
  }

  changePassword(userId: string, oldPassword: string, newPassword: string) {
    const u = this.users.byId(userId);
    if (!u || !this.hasher.verify(oldPassword, u.password_hash))
      throw new AppError('VALIDATION_ERROR', 'Current password is incorrect.', { oldPassword: ['Current password is incorrect'] });
    this.users.update(userId, { password_hash: this.hasher.hash(newPassword) });
    this.activity.log(userId, 'auth.change_password', 'user', userId, {}, this.clock.now().toISOString());
  }
}
