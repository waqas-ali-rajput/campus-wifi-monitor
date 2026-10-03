import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Role } from '@campus/shared';

export const hashPassword = (p: string) => bcrypt.hashSync(p, 10);
export const verifyPassword = (p: string, hash: string) => bcrypt.compareSync(p, hash);

export interface SessionPayload {
  sub: string;
  role: Role;
}

export class JwtService {
  constructor(private secret: string) {}
  sign(p: SessionPayload): string {
    return jwt.sign(p, this.secret, { expiresIn: '8h' });
  }
  verify(token: string): SessionPayload | null {
    try {
      return jwt.verify(token, this.secret) as SessionPayload;
    } catch {
      return null;
    }
  }
}

/** JWT secret: env → <dataDir>/.jwt-secret → generate & store. `null` dataDir = ephemeral (tests). */
export function resolveJwtSecret(envSecret: string | undefined, dataDir: string | null): string {
  if (envSecret) return envSecret;
  if (dataDir === null) return 'test-secret-' + randomBytes(8).toString('hex');
  const file = path.join(dataDir, '.jwt-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(path.dirname(file), { recursive: true });
  const s = randomBytes(48).toString('hex');
  writeFileSync(file, s, { mode: 0o600 });
  return s;
}
