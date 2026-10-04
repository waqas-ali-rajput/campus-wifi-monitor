import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NotificationDTO } from '@campus/shared';
import { api } from '../api/client';

export type AutoRefreshState = 'live' | 'paused';
const INTERVAL_MS = 15_000;

export function useAutoRefresh(enabled: boolean, onNotification: (n: NotificationDTO) => void) {
  const qc = useQueryClient();
  const [state, setState] = useState<AutoRefreshState>('live');
  const cb = useRef(onNotification);
  cb.current = onNotification;

  useEffect(() => {
    if (!enabled) return;
    const seen = new Set<string>();
    let seeded = false;
    let timer: number | undefined;
    let stopped = false;

    const checkNotifications = async () => {
      try {
        // GET /notifications responds with a bare array (see routes.ts), not { items }.
        const res = await api<NotificationDTO[]>('/notifications?unread=1&limit=20');
        const fresh = res.filter((n) => !seen.has(n.notification_id));
        fresh.forEach((n) => seen.add(n.notification_id));
        if (seeded) fresh.reverse().forEach((n) => cb.current(n));
        seeded = true;
      } catch {
        /* offline or signed out */
      }
    };

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === 'visible') {
        setState('live');
        await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'config' });
        await checkNotifications();
      } else setState('paused');
      timer = window.setTimeout(tick, INTERVAL_MS);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        void tick();
      }
    };

    void checkNotifications();
    timer = window.setTimeout(tick, INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, qc]);

  return state;
}