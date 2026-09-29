-- ==============================================================================
-- SafeHome AI - Official Database Schema (Supabase PostgreSQL + Supabase Auth)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE (Linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT DEFAULT 'homeowner',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. HOMES TABLE (with IANA Timezone support)
CREATE TABLE IF NOT EXISTS public.homes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    timezone TEXT DEFAULT 'UTC' NOT NULL, -- e.g. 'America/New_York', 'Asia/Kolkata', 'Europe/London'
    active_hours_start VARCHAR(5) DEFAULT '07:00' NOT NULL,
    active_hours_end VARCHAR(5) DEFAULT '23:00' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. DEVICES TABLE (Phones, Webcams, Sensor Nodes)
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    home_id UUID REFERENCES public.homes(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    device_type TEXT DEFAULT 'phone_camera' NOT NULL, -- 'phone_camera', 'laptop_webcam'
    status TEXT DEFAULT 'offline' NOT NULL,          -- 'online', 'offline', 'streaming'
    ip_address TEXT,
    user_agent TEXT,
    last_seen TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. PAIRING CODES TABLE (Short-lived 5-minute single-use pairing for mobile camera)
CREATE TABLE IF NOT EXISTS public.pairing_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    home_id UUID REFERENCES public.homes(id) ON DELETE CASCADE,
    code VARCHAR(6) NOT NULL,
    device_name TEXT DEFAULT 'Android Phone Sensor' NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. EVENTS TABLE (De-duplicated & Cooldown-Aggregated Detections)
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    home_id UUID REFERENCES public.homes(id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,                          -- e.g. 'person_detected', 'vehicle_detected'
    object_class TEXT NOT NULL,                        -- e.g. 'person', 'dog', 'car', 'bicycle'
    category TEXT NOT NULL,                            -- 'person', 'animal', 'vehicle', 'other'
    confidence NUMERIC(5, 4) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    frame_count INTEGER DEFAULT 1 NOT NULL,
    snapshot_path TEXT,
    is_unusual BOOLEAN DEFAULT FALSE NOT NULL,
    anomaly_score NUMERIC(5, 4) DEFAULT 0.0 NOT NULL,
    user_feedback TEXT CHECK (user_feedback IN ('expected', 'unexpected') OR user_feedback IS NULL),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 6. ALERTS TABLE (INFO, WARNING, CRITICAL)
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    category TEXT NOT NULL,                            -- 'person', 'animal', 'vehicle', 'other'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. USER SETTINGS TABLE (Retention periods, thresholds, privacy controls)
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    expected_active_start VARCHAR(5) DEFAULT '07:00' NOT NULL,
    expected_active_end VARCHAR(5) DEFAULT '23:00' NOT NULL,
    confidence_threshold NUMERIC(3, 2) DEFAULT 0.50 NOT NULL,
    event_cooldown_sec INTEGER DEFAULT 30 NOT NULL,
    snapshot_retention_days INTEGER DEFAULT 7 NOT NULL,
    event_retention_days INTEGER DEFAULT 90 NOT NULL,
    save_snapshots BOOLEAN DEFAULT TRUE NOT NULL,
    opt_in_live_preview BOOLEAN DEFAULT FALSE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- INDEXES (Specified in Data Model section)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_events_user_id ON public.events (user_id);
CREATE INDEX IF NOT EXISTS idx_events_home_id ON public.events (home_id);
CREATE INDEX IF NOT EXISTS idx_events_started_at ON public.events (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_category ON public.events (category);
CREATE INDEX IF NOT EXISTS idx_events_is_unusual ON public.events (is_unusual);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_code ON public.pairing_codes (code);
CREATE INDEX IF NOT EXISTS idx_alerts_user_unread ON public.alerts (user_id, is_read, created_at DESC);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Profiles: users read and update own profile
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Homes: users manage own homes
CREATE POLICY "Users can manage own homes" ON public.homes FOR ALL USING (auth.uid() = user_id);

-- Devices: users manage own devices
CREATE POLICY "Users can manage own devices" ON public.devices FOR ALL USING (auth.uid() = user_id);

-- Pairing codes: users manage own pairing codes
CREATE POLICY "Users can manage own pairing codes" ON public.pairing_codes FOR ALL USING (auth.uid() = user_id);

-- Events: users view and manage own events
CREATE POLICY "Users can manage own events" ON public.events FOR ALL USING (auth.uid() = user_id);

-- Alerts: users view and manage own alerts
CREATE POLICY "Users can manage own alerts" ON public.alerts FOR ALL USING (auth.uid() = user_id);

-- Settings: users manage own settings
CREATE POLICY "Users can manage own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id);

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
