export const ROLES = ['user', 'it_staff', 'manager', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  user: 'Student / Staff',
  it_staff: 'IT Support Staff',
  manager: 'Network / IT Manager',
  admin: 'Administrator',
};

export const HEALTH_STATUSES = ['excellent', 'good', 'fair', 'poor', 'critical'] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];
export type LocationStatus = HealthStatus | 'unknown';

export const STATUS_LABELS: Record<LocationStatus, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  critical: 'Critical',
  unknown: 'Unknown',
};

/** §10.3 design tokens — heatmap: green good, yellow fair, red poor. */
export const STATUS_COLORS: Record<LocationStatus, string> = {
  excellent: '#15803d',
  good: '#22c55e',
  fair: '#eab308',
  poor: '#ef4444',
  critical: '#991b1b',
  unknown: '#9ca3af',
};

export const COMPLAINT_TYPES = [
  'no_internet',
  'slow_internet',
  'high_ping',
  'frequent_disconnection',
  'weak_signal',
  'website_service_unavailable',
  'other',
] as const;
export type ComplaintType = (typeof COMPLAINT_TYPES)[number];

export const COMPLAINT_TYPE_LABELS: Record<ComplaintType, string> = {
  no_internet: 'No Internet',
  slow_internet: 'Slow Internet',
  high_ping: 'High Ping',
  frequent_disconnection: 'Frequent Disconnection',
  weak_signal: 'Weak Signal',
  website_service_unavailable: 'Website / Service Unavailable',
  other: 'Other',
};

export const COMPLAINT_STATUSES = ['submitted', 'reviewed', 'assigned', 'in_progress', 'resolved'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  submitted: 'Submitted',
  reviewed: 'Reviewed',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

export const FAILURE_REASONS = ['unreachable', 'download_failed', 'upload_failed', 'timeout', 'other'] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export const SPEED_TEST_FAILURE_MESSAGE =
  'Speed test could not be completed. Please check your connection and try again.';

export const MUET_CAMPUS = {
  name: 'Mehran University of Engineering & Technology',
  address: 'Indus Highway, Jamshoro 76062, Sindh, Pakistan',
  latitude: 25.4081,
  longitude: 68.2603,
} as const;

export const INSIGHT_KINDS = [
  'problem_detected',
  'anomaly',
  'trend_drop',
  'outage_risk',
  'peak_forecast',
  'summary',
  'recommendation',
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export const NOTIFICATION_TYPES = [
  'complaint_submitted',
  'complaint_assigned',
  'complaint_resolved',
  'location_degraded',
  'outage_detected',
  'maintenance_scheduled',
  'network_recovered',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const OUTAGE_RULE_LABELS: Record<string, string> = {
  R1: 'Complaint cluster',
  R2: 'Speed-test failure cluster',
  R3: 'Sustained critical results',
  manual: 'Opened manually',
};

/** Fixed role → capability table (§7.2). "Manage permissions" = change a user's role. */
export const PERMISSIONS = [
  'tests.run',
  'status.view',
  'complaints.create',
  'tests.viewAll',
  'complaints.viewAll',
  'complaints.transition',
  'complaints.note',
  'maintenance.manage',
  'outages.resolve',
  'dashboard.view',
  'insights.view',
  'analytics.view',
  'analytics.compare',
  'analytics.staffActivity',
  'reports.view',
  'locations.manage',
  'users.manage',
  'settings.read',
  'settings.write',
  'activity.view',
  'server.info',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const base: Permission[] = ['tests.run', 'status.view', 'complaints.create'];
const staff: Permission[] = [
  ...base,
  'tests.viewAll',
  'complaints.viewAll',
  'complaints.transition',
  'complaints.note',
  'maintenance.manage',
  'outages.resolve',
  'dashboard.view',
  'insights.view',
  'analytics.view',
  'analytics.compare',
];
const manager: Permission[] = [
  ...staff,
  'analytics.staffActivity',
  'reports.view',
  'locations.manage',
  'settings.read',
  'activity.view',
];
const admin: Permission[] = [...manager, 'users.manage', 'settings.write', 'server.info'];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  user: new Set(base),
  it_staff: new Set(staff),
  manager: new Set(manager),
  admin: new Set(admin),
};

export function hasPermission(role: Role, p: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(p) ?? false;
}
