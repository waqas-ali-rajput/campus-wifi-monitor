import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/** Repository root = first ancestor folder that holds both `apps` and `packages`. */
export function findRoot(start = __dirname): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, 'apps')) && existsSync(path.join(dir, 'packages'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export const ROOT = findRoot();

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}

const schema = z.object({
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DB_PATH: z.string().default('./data/campus-wifi.db'),
  JWT_SECRET: z.string().optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  DISABLE_EVENT_STREAM: z.string().optional().transform((v) => v === 'true' || v === '1'),
  SERVERLESS_DEMO_MODE: z.string().optional().transform((v) => v === 'true' || v === '1'),
  CAMPUS_TZ: z.string().optional(),
  SPEEDTEST_QUICK: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  LLM_PROVIDER: z.enum(['none', 'ollama']).default('none'),
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.string().default('development'),
  DISABLE_RATE_LIMIT: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

export interface AppConfig {
  port: number;
  host: string;
  dbPath: string;
  jwtSecret?: string;
  trustProxyHops: number;
  disableEventStream: boolean;
  tz: string;
  speedtestQuick: boolean;
  llm: { provider: 'none' | 'ollama'; url: string; model?: string };
  logLevel: string;
  production: boolean;
  rateLimit: boolean;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  loadDotEnv();
  const env = schema.parse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')));
  if (env.NODE_ENV === 'production' && !env.JWT_SECRET) throw new Error('JWT_SECRET must be configured in production.');
  if (env.DISABLE_RATE_LIMIT) throw new Error('Rate limiting cannot be disabled.');
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
  const tz = env.CAMPUS_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const dbPath = env.SERVERLESS_DEMO_MODE ? '/tmp/campus-wifi-demo.db' : env.DB_PATH === ':memory:' ? ':memory:' : path.resolve(ROOT, env.DB_PATH);
  return {
    port: env.PORT,
    host: env.HOST,
    dbPath,
    jwtSecret: env.JWT_SECRET,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    disableEventStream: env.DISABLE_EVENT_STREAM || env.SERVERLESS_DEMO_MODE,
    tz,
    speedtestQuick: env.SPEEDTEST_QUICK,
    llm: { provider: env.LLM_PROVIDER, url: env.OLLAMA_URL, model: env.OLLAMA_MODEL },
    logLevel: env.LOG_LEVEL,
    production: env.NODE_ENV === 'production',
    rateLimit: !env.DISABLE_RATE_LIMIT,
    ...overrides,
  };
}
