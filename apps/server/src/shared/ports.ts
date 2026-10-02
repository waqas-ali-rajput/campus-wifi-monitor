import type { Role } from '@campus/shared';

/** Ports used by application services; implemented in infrastructure. */
export interface Audience {
  all?: boolean;
  userIds?: string[];
  roles?: Role[];
}

export interface EventPublisher {
  publish(event: string, data: unknown, audience?: Audience): void;
}

export interface LlmProvider {
  readonly enabled: boolean;
  rewrite(text: string): Promise<string>;
}

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export const newId = () => crypto.randomUUID();
