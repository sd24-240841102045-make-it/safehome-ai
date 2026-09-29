import { z } from 'zod';

// ==============================================================================
// 1. CLASS-TO-CATEGORY MAPPING (Specification 3)
// Note: COCO has no "package" class. "other" covers backpack, suitcase, handbag.
// ==============================================================================
export const CLASS_TO_CATEGORY_MAP: Record<string, 'person' | 'animal' | 'vehicle' | 'other'> = {
  person: 'person',
  dog: 'animal',
  cat: 'animal',
  bird: 'animal',
  horse: 'animal',
  sheep: 'animal',
  cow: 'animal',
  elephant: 'animal',
  bear: 'animal',
  zebra: 'animal',
  giraffe: 'animal',
  car: 'vehicle',
  motorcycle: 'vehicle',
  bicycle: 'vehicle',
  bus: 'vehicle',
  truck: 'vehicle',
  train: 'vehicle',
  airplane: 'vehicle',
  boat: 'vehicle',
  backpack: 'other',
  suitcase: 'other',
  handbag: 'other'
};

export const CategoryEnum = z.enum(['person', 'animal', 'vehicle', 'other']);
export type Category = z.infer<typeof CategoryEnum>;

export function mapClassToCategory(objectClass: string): Category {
  return CLASS_TO_CATEGORY_MAP[objectClass.toLowerCase()] || 'other';
}

// ==============================================================================
// 2. DETECTION SCHEMAS
// ==============================================================================
export const BoundingBoxSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

export const DetectionItemSchema = z.object({
  class: z.string(),
  confidence: z.number().min(0).max(1),
  bounding_box: BoundingBoxSchema
});

export const DetectRequestSchema = z.object({
  image: z.string().min(1, 'Base64 image string is required'),
  min_confidence: z.number().min(0).max(1).optional().default(0.50),
  motion_gate: z.boolean().optional().default(false)
});

export const DetectResponseSchema = z.object({
  detections: z.array(DetectionItemSchema),
  processing_time_ms: z.number().nonnegative(),
  model: z.string(),
  skipped_due_to_motion: z.boolean().optional().default(false)
});

// ==============================================================================
// 3. ANOMALY ANALYSIS SCHEMAS
// ==============================================================================
export const AnomalyAnalyzeRequestSchema = z.object({
  home_id: z.string().uuid().optional(),
  timezone: z.string().default('UTC'),
  time_windows: z.array(
    z.object({
      timestamp_utc: z.string().datetime(),
      hour: z.number().int().min(0).max(23),
      weekday: z.number().int().min(0).max(6),
      category: CategoryEnum,
      event_count: z.number().int().nonnegative(),
      user_feedback: z.enum(['expected', 'unexpected']).nullable().optional()
    })
  ),
  current_window: z.object({
    timestamp_utc: z.string().datetime(),
    hour: z.number().int().min(0).max(23),
    weekday: z.number().int().min(0).max(6),
    category: CategoryEnum,
    event_count: z.number().int().nonnegative(),
    is_quiet_hours: z.boolean().optional().default(false)
  })
});

export const AnomalyAnalyzeResponseSchema = z.object({
  status: z.enum(['analyzed', 'insufficient_data', 'error']),
  is_unusual: z.boolean(),
  anomaly_score: z.number().min(0).max(1),
  z_score: z.number().nullable().optional(),
  baseline: z.object({
    mean: z.number().nonnegative(),
    std: z.number().nonnegative(),
    sample_count: z.number().int().nonnegative(),
    days_spanned: z.number().int().nonnegative()
  }).nullable().optional(),
  reason: z.string()
});

// ==============================================================================
// 4. HEALTH CHECK SCHEMA
// ==============================================================================
export const HealthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'error']),
  backend: z.enum(['online', 'offline']),
  database: z.enum(['online', 'offline']),
  ai_service: z.enum(['online', 'offline']),
  timestamp: z.string().datetime()
});

// ==============================================================================
// 5. EVENT SCHEMAS
// ==============================================================================
export const CreateEventSchema = z.object({
  home_id: z.string().uuid().optional(),
  device_id: z.string().uuid().optional(),
  object_class: z.string().min(1),
  confidence: z.number().min(0).max(1),
  bounding_box: BoundingBoxSchema.optional(),
  snapshot_base64: z.string().optional()
});

export const EventFeedbackSchema = z.object({
  feedback: z.enum(['expected', 'unexpected']).nullable()
});

// ==============================================================================
// 6. PAIRING & DEVICE SCHEMAS
// ==============================================================================
export const CreatePairingCodeSchema = z.object({
  home_id: z.string().uuid().optional(),
  device_name: z.string().default('Android Phone Camera')
});

export const ExchangePairingCodeSchema = z.object({
  code: z.string().length(6, 'Pairing code must be 6 alphanumeric digits'),
  device_name: z.string().optional()
});

// ==============================================================================
// 7. USER SETTINGS SCHEMA
// ==============================================================================
export const UpdateSettingsSchema = z.object({
  expected_active_start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  expected_active_end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  confidence_threshold: z.number().min(0.1).max(0.99).optional(),
  event_cooldown_sec: z.number().int().min(5).max(300).optional(),
  snapshot_retention_days: z.number().int().min(1).max(365).optional(),
  event_retention_days: z.number().int().min(1).max(365).optional(),
  save_snapshots: z.boolean().optional(),
  opt_in_live_preview: z.boolean().optional()
});
