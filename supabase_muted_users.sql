-- Create muted_users table for tracking which users have muted which other users in group chats
-- This only applies to group/public chats, not DMs

CREATE TABLE IF NOT EXISTS muted_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure a user can only mute another user once
  UNIQUE(user_id, muted_user_id)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_muted_users_user_id ON muted_users(user_id);
CREATE INDEX IF NOT EXISTS idx_muted_users_muted_user_id ON muted_users(muted_user_id);

-- Enable RLS
ALTER TABLE muted_users ENABLE ROW LEVEL SECURITY;

-- Users can only see their own mutes
CREATE POLICY "Users can view their own mutes" ON muted_users
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own mutes
CREATE POLICY "Users can mute others" ON muted_users
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own mutes
CREATE POLICY "Users can unmute others" ON muted_users
  FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON muted_users TO authenticated;
GRANT ALL ON muted_users TO service_role;
