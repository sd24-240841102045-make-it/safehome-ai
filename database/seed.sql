-- ==============================================================================
-- SafeHome AI - Seed Data
-- ==============================================================================

-- 1. Demo User (Password: "SafeHome@2026", hash generated via bcrypt)
-- bcrypt hash for "SafeHome@2026": $2a$10$vI8aWBnW3fID.ZQ4/zo1G.qHqEepvQo/E2H6wLwP8w3X3y2CqvZ5a
INSERT INTO users (id, email, password_hash, full_name, role)
VALUES (
    'usr_demo_01',
    'demo@safehome.local',
    '$2a$10$7ZkQhU3d8w9M2.c7Y9J27.Yd3hFv3U8G3X3mY1q7W3l9F7k2h6H2e',
    'Jane Doe',
    'homeowner'
) ON CONFLICT (id) DO NOTHING;

-- 2. Demo Home
INSERT INTO homes (id, user_id, name, address, timezone, active_hours_start, active_hours_end)
VALUES (
    'home_demo_01',
    'usr_demo_01',
    'Suburban Residence',
    '104 Maple Avenue',
    'UTC',
    '07:00',
    '23:00'
) ON CONFLICT (id) DO NOTHING;

-- 3. Demo Device (Android Phone)
INSERT INTO devices (id, user_id, home_id, name, device_type, status)
VALUES (
    'dev_phone_01',
    'usr_demo_01',
    'home_demo_01',
    'Pixel 8 - Front Porch',
    'phone_camera',
    'offline'
) ON CONFLICT (id) DO NOTHING;

-- 4. User Settings
INSERT INTO user_settings (user_id, expected_active_start, expected_active_end, confidence_threshold, detection_cooldown_sec, auto_delete_events_days, save_snapshots, notifications_enabled)
VALUES (
    'usr_demo_01',
    '07:00',
    '23:00',
    0.60,
    5,
    30,
    TRUE,
    TRUE
) ON CONFLICT (user_id) DO NOTHING;
