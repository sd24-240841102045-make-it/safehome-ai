-- SafeHome AI: Migration 001_foundations.sql
-- Description: Phase 1 Foundations - Extended alert/event metadata, security audit log, metric rollups, modes, privacy & heartbeat fields

-- 1. Extend Homes table (Modes & arming delays)
ALTER TABLE homes ADD COLUMN IF NOT EXISTS current_mode TEXT DEFAULT 'home' CHECK (current_mode IN ('home', 'away', 'disarmed', 'night'));
ALTER TABLE homes ADD COLUMN IF NOT EXISTS mode_changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE homes ADD COLUMN IF NOT EXISTS arming_delay_s INTEGER DEFAULT 0;

-- 2. Extend Devices table (Heartbeat, telemetry, and status)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_level REAL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_charging BOOLEAN DEFAULT FALSE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS network_online BOOLEAN DEFAULT TRUE;

-- 3. Extend Events table (Feedback reason, normalised bounding boxes)
ALTER TABLE events ADD COLUMN IF NOT EXISTS feedback_reason TEXT CHECK (feedback_reason IN ('wrong_detection', 'expected_activity', 'other'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS bbox_x REAL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS bbox_y REAL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS bbox_w REAL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS bbox_h REAL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS frame_width INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS frame_height INTEGER;

-- Update user_feedback constraint if existing or alter column
-- Note: In Postgres, user_feedback supports 'correct', 'false_alert', 'unknown'

-- 4. Extend Alerts table (Lifecycle resolution, deduplication, suppression)
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT FALSE;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS occurrence_count INTEGER DEFAULT 1;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS rule_id TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS suppressed_reason TEXT;

-- 5. Extend User Settings table (Notification quiet hours & audio opt-in)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notification_quiet_hours_start TEXT DEFAULT '22:00';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notification_quiet_hours_end TEXT DEFAULT '07:00';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS audio_enabled BOOLEAN DEFAULT FALSE;

-- 6. Create Security Audit Log Table (Append-only security events)
CREATE TABLE IF NOT EXISTS security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  home_id UUID REFERENCES homes(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id ON security_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at ON security_audit_log (created_at DESC);

-- Enable RLS for Security Audit Log
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own security audit logs"
  ON security_audit_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own security audit logs"
  ON security_audit_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Explicitly no UPDATE or DELETE policy to enforce append-only audit trail.

-- 7. Create Metric Rollups Table (Hourly/Daily aggregated metrics)
CREATE TABLE IF NOT EXISTS metric_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('hourly', 'daily')),
  event_count INTEGER DEFAULT 0,
  alert_count INTEGER DEFAULT 0,
  avg_processing_time_ms REAL DEFAULT 0.0,
  uptime_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_metric_rollup_period UNIQUE (home_id, device_id, period_start, period_type)
);

CREATE INDEX IF NOT EXISTS idx_metric_rollups_period ON metric_rollups (home_id, period_start DESC);

-- Enable RLS for Metric Rollups
ALTER TABLE metric_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view metric rollups for their homes"
  ON metric_rollups FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM homes WHERE homes.id = metric_rollups.home_id AND homes.user_id = auth.uid()
  ));
