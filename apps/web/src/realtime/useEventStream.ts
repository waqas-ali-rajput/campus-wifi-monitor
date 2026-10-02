import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NotificationDTO } from '@campus/shared';

export type LiveState = 'connecting' | 'live' | 'offline';

/** SSE stream (§11.4) → invalidates TanStack Query keys and surfaces notifications as toasts. */
export function useEventStream(enabled: boolean, onNotification: (n: NotificationDTO) => void) {
  const qc = useQueryClient();
  const [state, setState] = useState<LiveState>('connecting');
  const cb = useRef(onNotification);
  cb.current = onNotification;

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource('/api/events', { withCredentials: true });
    let wasOffline = false;
    let pending: number | undefined;
    const keys = new Set<string>();
    // coalesce bursts of events into one refetch round
    const invalidate = (...k: string[]) => {
      k.forEach((x) => keys.add(x));
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        keys.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
        keys.clear();
      }, 250);
    };
    es.addEventListener('hello', () => {
      setState('live');
      if (wasOffline) qc.invalidateQueries();
      wasOffline = false;
    });
    es.onerror = () => {
      setState('offline');
      wasOffline = true;
    };
    es.addEventListener('dashboard.updated', () => invalidate('dashboard', 'locations', 'tests', 'analytics', 'insights'));
    es.addEventListener('complaint.updated', () => invalidate('complaints', 'dashboard', 'analytics'));
    es.addEventListener('outage.opened', () => invalidate('outages', 'dashboard', 'locations'));
    es.addEventListener('outage.resolved', () => invalidate('outages', 'dashboard', 'locations'));
    es.addEventListener('insight.updated', () => invalidate('insights'));
    es.addEventListener('notification', (e) => {
      invalidate('notifications');
      try {
        cb.current(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore malformed */
      }
    });
    return () => {
      window.clearTimeout(pending);
      es.close();
    };
  }, [enabled, qc]);

  return state;
}
