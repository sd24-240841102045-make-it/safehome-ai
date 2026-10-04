-- Migration 004: Home Sharing & Multi-User Access
-- SafeHome AI PostgreSQL RLS & Schema Expansion

CREATE TABLE IF NOT EXISTS home_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(home_id, user_id)
);

CREATE TABLE IF NOT EXISTS home_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    invite_code VARCHAR(32) NOT NULL UNIQUE,
    email VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    is_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_home_members_home ON home_members(home_id);
CREATE INDEX IF NOT EXISTS idx_home_members_user ON home_members(user_id);
CREATE INDEX IF NOT EXISTS idx_home_invites_code ON home_invites(invite_code);

-- Enable RLS
ALTER TABLE home_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for home_members
CREATE POLICY "Users can view members of homes they belong to"
    ON home_members FOR SELECT
    USING (
        home_id IN (
            SELECT hm.home_id FROM home_members hm WHERE hm.user_id = auth.uid()
            UNION
            SELECT h.id FROM homes h WHERE h.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners and admins can manage home members"
    ON home_members FOR ALL
    USING (
        home_id IN (
            SELECT hm.home_id FROM home_members hm WHERE hm.user_id = auth.uid() AND hm.role IN ('owner', 'admin')
            UNION
            SELECT h.id FROM homes h WHERE h.user_id = auth.uid()
        )
    );

-- RLS Policies for home_invites
CREATE POLICY "Members can view invites for their homes"
    ON home_invites FOR SELECT
    USING (
        home_id IN (
            SELECT hm.home_id FROM home_members hm WHERE hm.user_id = auth.uid()
            UNION
            SELECT h.id FROM homes h WHERE h.user_id = auth.uid()
        )
    );

CREATE POLICY "Owners and admins can create/manage invites"
    ON home_invites FOR ALL
    USING (
        home_id IN (
            SELECT hm.home_id FROM home_members hm WHERE hm.user_id = auth.uid() AND hm.role IN ('owner', 'admin')
            UNION
            SELECT h.id FROM homes h WHERE h.user_id = auth.uid()
        )
    );
