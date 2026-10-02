import { z } from 'zod';
import { COMPLAINT_STATUSES, COMPLAINT_TYPES, FAILURE_REASONS, HEALTH_STATUSES, ROLES } from '../constants';

const finite = z.number().finite();
const id = z.string().min(1).max(64);
const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date')
  .optional();

// ---------- auth & users ----------
export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Enter a valid email address').max(120),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
export const createUserSchema = registerSchema.extend({ role: z.enum(ROLES) });
export const patchUserSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    role: z.enum(ROLES).optional(),
    account_status: z.enum(['active', 'suspended']).optional(),
    new_password: z.string().min(8).max(128).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

// ---------- locations ----------
const locationCoordinatesSchema = z.object({
  location_name: z.string().trim().min(2, 'Name is required').max(80),
  building: z.string().trim().min(1, 'Building is required').max(80),
  floor: z.number().int().min(-5).max(100).nullable().optional(),
  description: z.string().trim().max(500).optional().default(''),
  map_x: finite.min(0).max(100).default(50),
  map_y: finite.min(0).max(100).default(50),
  latitude: finite.min(-90).max(90).nullable().optional().default(null),
  longitude: finite.min(-180).max(180).nullable().optional().default(null),
});
const coordinatesPaired = <T extends { latitude?: number | null; longitude?: number | null }>(value: T) => {
  const latitudeProvided = value.latitude !== undefined;
  const longitudeProvided = value.longitude !== undefined;
  return latitudeProvided === longitudeProvided && ((value.latitude == null) === (value.longitude == null));
};
export const locationCreateSchema = locationCoordinatesSchema.refine(coordinatesPaired, {
  message: 'Enter both latitude and longitude, or leave both blank.',
  path: ['latitude'],
});
export const locationPatchSchema = locationCoordinatesSchema.partial().refine(coordinatesPaired, {
  message: 'Update both latitude and longitude together.',
  path: ['latitude'],
});
export const locationQuerySchema = z.object({
  building: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional(),
});

// ---------- speed tests ----------
export const internetTestSchema = z.object({
  download_mbps: finite.gt(0).max(100000),
  upload_mbps: finite.gt(0).max(100000),
  ping_ms: finite.gt(0).max(5000),
  jitter_ms: finite.min(0).max(5000),
  provider: z.literal('cloudflare'),
});

export const submitTestSchema = z
  .object({
    location_id: id,
    download_mbps: finite.min(0).max(10000),
    upload_mbps: finite.min(0).max(10000),
    ping_ms: finite.gt(0).max(5000),
    jitter_ms: finite.min(0).max(5000).default(0),
    packet_loss_pct: finite.min(0).max(100).default(0),
    client_meta: z.record(z.unknown()).optional(),
  })
  .refine((v) => !(v.download_mbps === 0 && v.upload_mbps === 0), {
    message: 'A test with zero download and upload is a failed test, not a result.',
    path: ['download_mbps'],
  });
export const submitFailureSchema = z.object({
  location_id: id,
  reason: z.enum(FAILURE_REASONS),
  detail: z.string().max(500).optional().default(''),
});

const paging = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
};
export const testsQuerySchema = z.object({
  location_id: z.string().optional(),
  building: z.string().optional(),
  from: isoDate,
  to: isoDate,
  status: z.enum(HEALTH_STATUSES).optional(),
  user_id: z.string().optional(),
  ...paging,
});

// ---------- complaints ----------
export const classifySchema = z.object({ description: z.string().max(1000) });
export const complaintCreateSchema = z.object({
  location_id: id,
  complaint_type: z.enum(COMPLAINT_TYPES),
  description: z.string().trim().min(5, 'Describe the problem in at least 5 characters').max(1000),
  related_test_id: z.string().max(64).nullable().optional(),
});
export const complaintQuerySchema = z.object({
  location_id: z.string().optional(),
  building: z.string().optional(),
  complaint_type: z.enum(COMPLAINT_TYPES).optional(),
  status: z.enum([...COMPLAINT_STATUSES, 'open'] as [string, ...string[]]).optional(),
  network_status: z.string().optional(),
  assigned_staff: z.string().optional(),
  from: isoDate,
  to: isoDate,
  q: z.string().max(100).optional(),
  mine: z.coerce.boolean().optional(),
  ...paging,
});
export const transitionSchema = z.object({
  to: z.enum(COMPLAINT_STATUSES),
  assigned_staff: z.string().optional(),
  note: z.string().trim().max(1000).optional(),
});
export const noteSchema = z.object({ note: z.string().trim().min(1, 'Write a note').max(1000) });

// ---------- maintenance ----------
export const maintenanceSchema = z
  .object({
    location_id: z.string().nullable().optional(),
    title: z.string().trim().min(3).max(120),
    notes: z.string().trim().max(1000).optional().default(''),
    starts_at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid start'),
    ends_at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid end'),
  })
  .refine((v) => Date.parse(v.ends_at) > Date.parse(v.starts_at), { message: 'End must be after start', path: ['ends_at'] });

// ---------- settings ----------
const pos = finite.min(0);
export const healthConfigSchema = z.object({
  caps: z.object({ downloadMbps: finite.gt(0), uploadMbps: finite.gt(0) }),
  ping: z.object({ best: pos, worst: finite.gt(0) }),
  loss: z.object({ best: pos, worst: finite.gt(0) }),
  weights: z.object({ download: pos, upload: pos, ping: pos, loss: pos }),
  penalty: z.object({
    perFailure: pos, maxFailure: pos, perComplaint: pos, maxComplaint: pos, windowHours: finite.gt(0),
  }),
  bands: z.object({ excellent: finite.gt(0), good: finite.gt(0), fair: finite.gt(0), poor: finite.gt(0) }),
  location: z.object({
    windowMinutes: finite.gt(0), maxTests: finite.gt(0), halfLifeMinutes: finite.gt(0), staleHours: finite.gt(0),
  }),
});
export const outageConfigSchema = z.object({
  r1: z.object({ minUsers: finite.gt(0), windowMinutes: finite.gt(0), minAiConfidence: finite.min(0).max(1) }),
  r2: z.object({ minFailures: finite.gt(0), minUsers: finite.gt(0), windowMinutes: finite.gt(0) }),
  r3: z.object({ consecutiveCritical: finite.gt(0) }),
  recovery: z.object({ consecutiveGood: finite.gt(0), minScore: finite.gt(0) }),
});
export const insightsConfigSchema = z.object({
  anomaly: z.object({
    minSamples: finite.gt(0), zThreshold: finite.gt(0), minDropPct: pos, pingFactor: finite.gt(0),
    minLossPct: pos, baselineDays: finite.gt(0), excludeRecentMinutes: pos,
  }),
  problem: z.object({ lookback: finite.gt(0), minPoor: finite.gt(0), criticalAt: finite.gt(0), windowHours: finite.gt(0) }),
  trend: z.object({ recent: finite.gt(0), ratio: finite.gt(0), minSamples: finite.gt(0), days: finite.gt(0) }),
});

export const analyticsQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  location_id: z.string().optional(),
  building: z.string().optional(),
  days: z.coerce.number().int().min(1).max(90).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type SubmitTestInput = z.infer<typeof submitTestSchema>;
export type ComplaintCreateInput = z.infer<typeof complaintCreateSchema>;
export type LocationCreateInput = z.infer<typeof locationCreateSchema>;
export type MaintenanceInput = z.infer<typeof maintenanceSchema>;
