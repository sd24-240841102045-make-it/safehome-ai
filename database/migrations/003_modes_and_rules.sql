-- SafeHome AI: Migration 003_modes_and_rules.sql
-- Description: Phase 3 Modes & Typed Rules Engine

-- 1. Rules Table (Closed typed rule definitions)
CREATE TABLE IF NOT EXISTS rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  home_id UUID REFERENCES homes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT TRUE,
  modes JSONB DEFAULT '["home", "away", "night"]',
  target_categories JSONB DEFAULT '["person"]',
  min_confidence REAL DEFAULT 0.50,
  severity TEXT NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  action TEXT NOT NULL DEFAULT 'alert' CHECK (action IN ('alert', 'alarm', 'log_only')),
  cooldown_sec INTEGER DEFAULT 30,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rules_user_home ON rules (user_id, home_id, is_enabled);

-- Enable RLS for Rules
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage rules for their homes"
  ON rules FOR ALL
  USING (auth.uid() = user_id);

-- 2. Mode Profiles & Arming Delay Configuration
CREATE TABLE IF NOT EXISTS mode_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('home', 'away', 'night', 'disarmed')),
  arming_delay_s INTEGER DEFAULT 0,
  push_notifications_enabled BOOLEAN DEFAULT TRUE,
  audible_alarm_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_home_mode_profile UNIQUE (home_id, mode)
);

CREATE INDEX IF NOT EXISTS idx_mode_profiles_home ON mode_profiles (home_id);

-- Enable RLS for Mode Profiles
ALTER TABLE mode_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage mode profiles for their homes"
  ON mode_profiles FOR ALL
  USING (auth.uid() = user_id);
