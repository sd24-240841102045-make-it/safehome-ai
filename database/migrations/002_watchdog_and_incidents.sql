-- SafeHome AI: Migration 002_watchdog_and_incidents.sql
-- Description: Phase 2 Watchdog, Monitoring Sessions, Device Status, and Incident Management

-- 1. Monitoring Sessions Table
CREATE TABLE IF NOT EXISTS monitoring_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  home_id UUID REFERENCES homes(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  frame_count INTEGER DEFAULT 0,
  drop_count INTEGER DEFAULT 0,
  avg_fps REAL DEFAULT 0.0,
  avg_latency_ms REAL DEFAULT 0.0,
  end_reason TEXT DEFAULT 'clean_disconnect' CHECK (end_reason IN ('clean_disconnect', 'heartbeat_timeout', 'frame_timeout', 'error', 'user_stopped'))
);

CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_user ON monitoring_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_device ON monitoring_sessions (device_id, started_at DESC);

-- Enable RLS for Monitoring Sessions
ALTER TABLE monitoring_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own monitoring sessions"
  ON monitoring_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own monitoring sessions"
  ON monitoring_sessions FOR ALL
  USING (auth.uid() = user_id);

-- 2. Device Realtime Status Table
CREATE TABLE IF NOT EXISTS device_status (
  device_id UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  home_id UUID REFERENCES homes(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'degraded')),
  battery_level REAL,
  battery_charging BOOLEAN DEFAULT FALSE,
  network_online BOOLEAN DEFAULT TRUE,
  last_heartbeat_at TIMESTAMPTZ,
  last_frame_at TIMESTAMPTZ,
  fps REAL DEFAULT 0.0,
  latency_ms REAL DEFAULT 0.0,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_status_user ON device_status (user_id);

-- Enable RLS for Device Status
ALTER TABLE device_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their device statuses"
  ON device_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their device statuses"
  ON device_status FOR ALL
  USING (auth.uid() = user_id);

-- 3. Incidents Table (System health & connection failure events)
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  home_id UUID REFERENCES homes(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  incident_type TEXT NOT NULL CHECK (incident_type IN ('device_offline', 'heartbeat_timeout', 'frame_timeout', 'camera_error', 'tamper_suspected', 'low_battery')),
  severity TEXT NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  opened_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_incidents_user_status ON incidents (user_id, status, opened_at DESC);

-- Enable RLS for Incidents
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own incidents"
  ON incidents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own incidents"
  ON incidents FOR ALL
  USING (auth.uid() = user_id);
