import type {
  ComplaintStatus,
  ComplaintType,
  HealthStatus,
  LocationStatus,
  Role,
} from './constants';

export interface UserDTO {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  account_status: 'active' | 'suspended';
  created_at: string;
}

export interface LocationDTO {
  location_id: string;
  location_name: string;
  building: string;
  floor: number | null;
  description: string;
  current_status: LocationStatus;
  current_score: number | null;
  current_stale: number;
  map_x: number;
  map_y: number;
  latitude: number | null;
  longitude: number | null;
  last_tested_at: string | null;
  today: {
    tests: number;
    avg_download: number | null;
    avg_upload: number | null;
    avg_ping: number | null;
    complaints: number;
  };
  latest: SpeedTestDTO | null;
  active_outage: boolean;
  active_maintenance: boolean;
}

export interface InternetTestDTO {
  test_id: string;
  user_id: string;
  provider: 'cloudflare';
  campus_name: string;
  scope: 'off_campus';
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number;
  tested_at: string;
}

export interface SpeedTestDTO {
  test_id: string;
  user_id: string;
  user_name?: string;
  location_id: string;
  location_name?: string;
  building?: string;
  download_speed: number;
  upload_speed: number;
  ping: number;
  jitter: number;
  packet_loss: number;
  base_score: number;
  health_score: number;
  health_status: HealthStatus;
  during_maintenance: number;
  is_seed: number;
  tested_at: string;
}

export interface ComplaintDTO {
  complaint_id: string;
  user_id: string;
  user_name?: string;
  location_id: string;
  location_name?: string;
  building?: string;
  location_status?: LocationStatus;
  complaint_type: ComplaintType;
  description: string;
  related_test_id: string | null;
  status: ComplaintStatus;
  assigned_staff: string | null;
  assigned_name?: string | null;
  ai_category: ComplaintType | null;
  ai_confidence: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface ComplaintEventDTO {
  event_id: string;
  complaint_id: string;
  actor_id: string;
  actor_name?: string;
  kind: 'created' | 'status_change' | 'assignment' | 'note';
  from_status: ComplaintStatus | null;
  to_status: ComplaintStatus | null;
  note: string;
  created_at: string;
}

export interface OutageDTO {
  outage_id: string;
  location_id: string;
  location_name?: string;
  building?: string;
  status: 'active' | 'resolved';
  cause_rule?: string;
  message: string;
  complaint_count?: number;
  failure_count?: number;
  explanation?: string;
  detected_at: string;
  resolved_at: string | null;
  resolved_by_name?: string | null;
}

export interface MaintenanceDTO {
  maintenance_id: string;
  location_id: string | null;
  location_name?: string | null;
  title: string;
  notes: string;
  starts_at: string;
  ends_at: string;
  created_by: string;
  created_by_name?: string;
  is_active?: boolean;
}

export interface NotificationDTO {
  notification_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: number;
  created_at: string;
}

export interface InsightDTO {
  insight_id: string;
  kind: string;
  location_id: string | null;
  location_name?: string | null;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  data_json: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DashboardSummary {
  testsToday: number;
  avgDownload: number | null;
  avgUpload: number | null;
  avgPing: number | null;
  avgLoss: number | null;
  poorLocations: number;
  openComplaints: number;
  resolvedComplaints: number;
  resolvedToday: number;
  currentOutages: number;
}

export interface ApiError {
  error: { code: string; message: string; details?: Record<string, string[]> };
}
