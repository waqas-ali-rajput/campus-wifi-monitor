export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();
let reachable = true;
export function onReachability(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function setReachable(v: boolean) {
  if (v !== reachable) {
    reachable = v;
    listeners.forEach((l) => l(v));
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

/** Single fetch wrapper: credentials, CSRF header, JSON, error normalisation (§10.3). */
export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'campus-wifi', ...(init.headers as Record<string, string>) };
  let body = init.body;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, body, headers, credentials: 'include' });
  } catch {
    setReachable(false);
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your Wi-Fi connection.');
  }
  setReachable(true);
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const e = (data as any)?.error;
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}

export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
