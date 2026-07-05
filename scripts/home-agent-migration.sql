-- Home Agent: User Identity & OAuth Token Storage
-- Run this migration in your Supabase SQL editor

-- Google OAuth tokens per user (encrypted at rest in application layer)
-- user_id stores the browser cookie (nanoid) directly
CREATE TABLE IF NOT EXISTS user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google_calendar',
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Optional: server-side chat history
CREATE TABLE IF NOT EXISTS home_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT,
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE user_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_agent_sessions ENABLE ROW LEVEL SECURITY;

-- Policies: allow service role full access (API routes use service role key)
CREATE POLICY "Service role access" ON user_oauth_tokens FOR ALL USING (true);
CREATE POLICY "Service role access" ON home_agent_sessions FOR ALL USING (true);

-- ============================================================
-- FIX: Run this if you already ran the old migration with UUID columns
-- ============================================================
-- DROP TABLE IF EXISTS user_oauth_tokens CASCADE;
-- DROP TABLE IF EXISTS home_agent_sessions CASCADE;
-- DROP TABLE IF EXISTS user_identities CASCADE;
-- Then re-run the CREATE TABLE statements above.
