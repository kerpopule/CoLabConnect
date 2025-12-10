-- Migration: Add mute settings for DMs, Topics, and Groups
-- This enables users to mute specific chats to stop badges AND push notifications

-- 1. Add muted column to group_chat_members (groups already have notifications_enabled)
ALTER TABLE group_chat_members ADD COLUMN IF NOT EXISTS muted BOOLEAN DEFAULT false;

-- 2. Create dm_settings table for DM-specific mute/notification preferences
CREATE TABLE IF NOT EXISTS dm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  other_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  muted BOOLEAN DEFAULT false,
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, other_user_id)
);

-- 3. Create topic_settings table for topic-specific mute/notification preferences
CREATE TABLE IF NOT EXISTS topic_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE NOT NULL,
  muted BOOLEAN DEFAULT false,
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

-- Indexes for dm_settings
CREATE INDEX IF NOT EXISTS idx_dm_settings_user_id ON dm_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_settings_other_user_id ON dm_settings(other_user_id);
CREATE INDEX IF NOT EXISTS idx_dm_settings_user_other ON dm_settings(user_id, other_user_id);

-- Indexes for topic_settings
CREATE INDEX IF NOT EXISTS idx_topic_settings_user_id ON topic_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_topic_settings_topic_id ON topic_settings(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_settings_user_topic ON topic_settings(user_id, topic_id);

-- Enable RLS on dm_settings
ALTER TABLE dm_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for dm_settings
CREATE POLICY "Users can view own dm settings" ON dm_settings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own dm settings" ON dm_settings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own dm settings" ON dm_settings
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own dm settings" ON dm_settings
  FOR DELETE USING (user_id = auth.uid());

-- Enable RLS on topic_settings
ALTER TABLE topic_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for topic_settings
CREATE POLICY "Users can view own topic settings" ON topic_settings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own topic settings" ON topic_settings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own topic settings" ON topic_settings
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own topic settings" ON topic_settings
  FOR DELETE USING (user_id = auth.uid());

-- Enable realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE dm_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE topic_settings;
