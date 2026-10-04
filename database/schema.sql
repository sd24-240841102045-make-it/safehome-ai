-- ==============================================================================
-- SafeHome AI - Complete Canonical Database Schema (PostgreSQL / Supabase)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES TABLE (Linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'homeowner',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. HOMES TABLE
CREATE TABLE IF NOT EXISTS public.homes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    timezone TEXT DEFAULT 'UTC' NOT NULL,
    active_hours_start VARCHAR(5) DEFAULT '07:00' NOT NULL,
    active_hours_end VARCHAR(5) DEFAULT '23:00' NOT NULL,
    current_mode TEXT DEFAULT 'home' CHECK (current_mode IN ('home', 'away', 'disarmed', 'night')),
    mode_changed_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    arming_delay_s INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. DEVICES TABLE
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    home_id UUID REFERENCES public.homes(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    device_type TEXT DEFAULT 'phone_camera' NOT NULL,
    status TEXT DEFAULT 'offline' NOT NULL CHECK (status IN ('online', 'offline', 'streaming', 'degraded')),
    ip_address TEXT,
    user_agent TEXT,
    last_seen TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ,
    battery_level REAL,
    battery_charging BOOLEAN DEFAULT FALSE,
    network_online BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. DEVICE STATUS TABLE (Real-time telemetry)
CREATE TABLE IF NOT EXISTS public.device_status (
    device_id UUID PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    home_id UUID REFERENCES public.homes(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'degraded')),
    battery_level REAL,
    battery_charging BOOLEAN DEFAULT FALSE,
    network_online BOOLEAN DEFAULT TRUE,
    last_heartbeat_at TIMESTAMPTZ,
    last_frame_at TIMESTAMPTZ,
    fps REAL DEFAULT 0.0,
    latency_ms REAL DEFAULT 0.0,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. PAIRING CODES TABLE
CREATE TABLE IF NOT EXISTS public.pairing_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    home_id UUID REFERENCES public.homes(id) ON DELETE CASCADE,
    code VARCHAR(6) NOT NULL UNIQUE,
    device_name TEXT DEFAULT 'Android Phone Sensor' NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    home_id UUID REFERENCES public.homes(id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    object_class TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('person', 'animal', 'vehicle', 'other')),
    confidence NUMERIC(5, 4) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    frame_count INTEGER DEFAULT 1 NOT NULL,
    snapshot_path TEXT,
    is_unusual BOOLEAN DEFAULT FALSE NOT NULL,
    anomaly_score NUMERIC(5, 4) DEFAULT 0.0 NOT NULL,
    user_feedback TEXT CHECK (user_feedback IN ('correct', 'false_alert', 'unknown', 'expected', 'unexpected') OR user_feedback IS NULL),
    feedback_reason TEXT CHECK (feedback_reason IN ('wrong_detection', 'expected_activity', 'other') OR feedback_reason IS NULL),
    bbox_x REAL,
    bbox_y REAL,
    bbox_w REAL,
    bbox_h REAL,
    frame_width INTEGER,
    frame_height INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 7. ALERTS TABLE
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    category TEXT NOT NULL CHECK (category IN ('person', 'animal', 'vehicle', 'other')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    is_resolved BOOLEAN DEFAULT FALSE NOT NULL,
    resolved_at TIMESTAMPTZ,
    occurrence_count INTEGER DEFAULT 1 NOT NULL,
    dedupe_key TEXT,
    last_seen TIMESTAMPTZ,
    rule_id TEXT,
    suppressed_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. USER SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    expected_active_start VARCHAR(5) DEFAULT '07:00' NOT NULL,
    expected_active_end VARCHAR(5) DEFAULT '23:00' NOT NULL,
    notification_quiet_hours_start VARCHAR(5) DEFAULT '22:00' NOT NULL,
    notification_quiet_hours_end VARCHAR(5) DEFAULT '07:00' NOT NULL,
    confidence_threshold NUMERIC(3, 2) DEFAULT 0.50 NOT NULL,
    event_cooldown_sec INTEGER DEFAULT 30 NOT NULL,
    snapshot_retention_days INTEGER DEFAULT 7 NOT NULL,
    event_retention_days INTEGER DEFAULT 90 NOT NULL,
    save_snapshots BOOLEAN DEFAULT TRUE NOT NULL,
    opt_in_live_preview BOOLEAN DEFAULT FALSE NOT NULL,
    audio_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. MONITORING SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.monitoring_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    home_id UUID REFERENCES public.homes(id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0 NOT NULL,
    frame_count INTEGER DEFAULT 0 NOT NULL,
    drop_count INTEGER DEFAULT 0 NOT NULL,
    avg_fps REAL DEFAULT 0.0 NOT NULL,
    avg_latency_ms REAL DEFAULT 0.0 NOT NULL,
    end_reason TEXT DEFAULT 'clean_disconnect' CHECK (end_reason IN ('clean_disconnect', 'heartbeat_timeout', 'frame_timeout', 'error', 'user_stopped'))
);

-- 10. INCIDENTS TABLE
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    home_id UUID REFERENCES public.homes(id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE,
    incident_type TEXT NOT NULL CHECK (incident_type IN ('device_offline', 'heartbeat_timeout', 'frame_timeout', 'camera_error', 'tamper_suspected', 'low_battery')),
    severity TEXT NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
    opened_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    metadata JSONB
);

-- 11. RULES TABLE
CREATE TABLE IF NOT EXISTS public.rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    home_id UUID REFERENCES public.homes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    modes JSONB DEFAULT '["home", "away", "night"]'::jsonb,
    target_categories JSONB DEFAULT '["person"]'::jsonb,
    min_confidence REAL DEFAULT 0.50 NOT NULL,
    severity TEXT NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    action TEXT NOT NULL DEFAULT 'alert' CHECK (action IN ('alert', 'alarm', 'log_only')),
    cooldown_sec INTEGER DEFAULT 30 NOT NULL,
    is_default BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. MODE PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.mode_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('home', 'away', 'night', 'disarmed')),
    arming_delay_s INTEGER DEFAULT 0 NOT NULL,
    push_notifications_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    audible_alarm_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_home_mode_profile UNIQUE (home_id, mode)
);

-- 13. HOME MEMBERS & INVITES TABLES
CREATE TABLE IF NOT EXISTS public.home_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(home_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.home_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    invite_code VARCHAR(32) NOT NULL UNIQUE,
    email VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    is_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 14. SECURITY AUDIT LOG TABLE (Append-only audit trail)
CREATE TABLE IF NOT EXISTS public.security_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    home_id UUID REFERENCES public.homes(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 15. METRIC ROLLUPS TABLE
CREATE TABLE IF NOT EXISTS public.metric_rollups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL,
    period_type TEXT NOT NULL CHECK (period_type IN ('hourly', 'daily')),
    event_count INTEGER DEFAULT 0 NOT NULL,
    alert_count INTEGER DEFAULT 0 NOT NULL,
    avg_processing_time_ms REAL DEFAULT 0.0 NOT NULL,
    uptime_seconds INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_metric_rollup_period UNIQUE (home_id, device_id, period_start, period_type)
);

-- ==============================================================================
-- INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_events_user_id ON public.events (user_id);
CREATE INDEX IF NOT EXISTS idx_events_home_id ON public.events (home_id);
CREATE INDEX IF NOT EXISTS idx_events_started_at ON public.events (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_category ON public.events (category);
CREATE INDEX IF NOT EXISTS idx_events_is_unusual ON public.events (is_unusual);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_code ON public.pairing_codes (code);
CREATE INDEX IF NOT EXISTS idx_alerts_user_unread ON public.alerts (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_user ON public.monitoring_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_status_user ON public.device_status (user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_user_status ON public.incidents (user_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_rules_user_home ON public.rules (user_id, home_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_mode_profiles_home ON public.mode_profiles (home_id);
CREATE INDEX IF NOT EXISTS idx_home_members_home ON public.home_members (home_id);
CREATE INDEX IF NOT EXISTS idx_home_members_user ON public.home_members (user_id);
CREATE INDEX IF NOT EXISTS idx_home_invites_code ON public.home_invites (invite_code);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id ON public.security_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at ON public.security_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metric_rollups_period ON public.metric_rollups (home_id, period_start DESC);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mode_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can manage own homes" ON public.homes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own devices" ON public.devices FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own device status" ON public.device_status FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own pairing codes" ON public.pairing_codes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own events" ON public.events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own alerts" ON public.alerts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own monitoring sessions" ON public.monitoring_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own incidents" ON public.incidents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage rules for their homes" ON public.rules FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage mode profiles for their homes" ON public.mode_profiles FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own security audit logs" ON public.security_audit_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own security audit logs" ON public.security_audit_log FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create profile trigger on Supabase Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Homeowner'),
    'homeowner'
  );

  INSERT INTO public.homes (user_id, name, address, timezone)
  VALUES (new.id, 'My Home', 'Primary Residence', 'UTC');

  INSERT INTO public.user_settings (user_id)
  VALUES (new.id);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
