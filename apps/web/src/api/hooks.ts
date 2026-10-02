import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  ComplaintDTO,
  ComplaintEventDTO,
  DashboardSummary,
  InsightDTO,
  LocationDTO,
  MaintenanceDTO,
  NotificationDTO,
  OutageDTO,
  Paged,
  SpeedTestDTO,
  UserDTO,
  ComplaintStatus,
} from '@campus/shared';
import { api, qs } from './client';

export type Filters = Record<string, string | number | undefined>;

// ---- locations / status ----
export const useLocations = (f: Filters = {}) =>
  useQuery({ queryKey: ['locations', f], queryFn: () => api<{ items: LocationDTO[]; buildings: string[] }>(`/locations${qs(f)}`) });
export const useLocationDetail = (id?: string) =>
  useQuery({ queryKey: ['locations', 'detail', id], enabled: !!id, queryFn: () => api<any>(`/locations/${id}`) });
export const useCampusStatus = () =>
  useQuery({ queryKey: ['dashboard', 'campus-status'], queryFn: () => api<{ locations: LocationDTO[]; outages: OutageDTO[]; recent: any[] }>('/dashboard/campus-status') });
export const useSummary = () => useQuery({ queryKey: ['dashboard', 'summary'], queryFn: () => api<DashboardSummary>('/dashboard/summary') });
export const useAppConfig = () =>
  useQuery({ queryKey: ['config'], staleTime: Infinity, queryFn: () => api<{ speedtestQuick: boolean; tz: string; llm: boolean; production: boolean; disableEventStream: boolean }>('/config') });

// ---- tests ----
export const useTests = (f: Filters) =>
  useQuery({ queryKey: ['tests', f], placeholderData: keepPreviousData, queryFn: () => api<Paged<SpeedTestDTO>>(`/tests${qs(f)}`) });

// ---- complaints ----
export const useComplaints = (f: Filters) =>
  useQuery({ queryKey: ['complaints', f], placeholderData: keepPreviousData, queryFn: () => api<Paged<ComplaintDTO>>(`/complaints${qs(f)}`) });
export type ComplaintDetail = ComplaintDTO & {
  related_test: SpeedTestDTO | null;
  events: ComplaintEventDTO[];
  allowed_next: ComplaintStatus[];
  staff: UserDTO[];
};
export const useComplaint = (id?: string) =>
  useQuery({ queryKey: ['complaints', 'detail', id], enabled: !!id, queryFn: () => api<ComplaintDetail>(`/complaints/${id}`) });

// ---- outages / maintenance ----
export const useOutages = (status?: 'active' | 'resolved') =>
  useQuery({ queryKey: ['outages', status ?? 'all'], queryFn: () => api<{ items: OutageDTO[] }>(`/outages${qs({ status })}`) });
export const useMaintenance = () => useQuery({ queryKey: ['maintenance'], queryFn: () => api<{ items: MaintenanceDTO[] }>('/maintenance') });

// ---- insights ----
export const useInsights = (locationId?: string) =>
  useQuery({ queryKey: ['insights', 'list', locationId], queryFn: () => api<{ items: InsightDTO[] }>(`/insights${qs({ location_id: locationId })}`) });
export const useInsightSummary = () => useQuery({ queryKey: ['insights', 'summary'], queryFn: () => api<any>('/insights/summary') });
export const useRecommendations = () => useQuery({ queryKey: ['insights', 'recommendations'], queryFn: () => api<{ items: any[] }>('/insights/recommendations') });
export const usePredictions = (locationId?: string) =>
  useQuery({ queryKey: ['insights', 'predictions', locationId], queryFn: () => api<any>(`/insights/predictions${qs({ location_id: locationId })}`) });

// ---- analytics ----
export const useAnalytics = <T = any>(path: string, f: Filters = {}, enabled = true) =>
  useQuery({ queryKey: ['analytics', path, f], enabled, placeholderData: keepPreviousData, queryFn: () => api<T>(`/analytics/${path}${qs(f)}`) });

// ---- notifications ----
export const useNotifications = (limit = 10, unread = false) =>
  useQuery({
    queryKey: ['notifications', limit, unread],
    queryFn: () => api<{ items: NotificationDTO[]; total: number; unread: number }>(`/notifications${qs({ limit, unread: unread ? 1 : undefined })}`),
  });

// ---- admin ----
export const useUsers = (f: Filters = {}) => useQuery({ queryKey: ['admin', 'users', f], queryFn: () => api<{ items: any[] }>(`/admin/users${qs(f)}`) });
export const useStaff = (enabled = true) => useQuery({ queryKey: ['staff'], enabled, queryFn: () => api<{ items: UserDTO[] }>('/staff') });
export const useSettings = () => useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<any>('/admin/settings') });
export const useActivity = (f: Filters) =>
  useQuery({ queryKey: ['admin', 'activity', f], placeholderData: keepPreviousData, queryFn: () => api<Paged<any>>(`/admin/activity-logs${qs(f)}`) });

/** Mutation that invalidates the given query-key prefixes on success. */
export function useApiMutation<TVars, TOut = any>(fn: (v: TVars) => Promise<TOut>, invalidate: string[][] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k })),
  });
}
