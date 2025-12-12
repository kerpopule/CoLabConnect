-- CoLab Connect Database Schema
-- For Staging Environment Setup
-- Generated from production schema analysis

-- ============================================
-- CORE TABLES
-- ============================================

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT,
  company TEXT,
  bio TEXT,
  avatar_url TEXT,
  tags TEXT[],
  social_links JSONB,
  phone TEXT,
  show_email BOOLEAN DEFAULT true,
  show_phone BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Topics (chat rooms)
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages (group chat messages in topics)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  image_url TEXT,
  reply_to_id UUID REFERENCES messages(id),
  reply_to_user_id UUID REFERENCES profiles(id)
);

-- Private messages (DMs)
CREATE TABLE IF NOT EXISTS private_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  receiver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  image_url TEXT,
  reply_to_id UUID REFERENCES private_messages(id),
  reply_to_user_id UUID REFERENCES profiles(id)
);

-- Connections (follow/connect system)
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- ============================================
-- NOTIFICATION & PREFERENCES TABLES
-- ============================================

-- Push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  dm_notifications BOOLEAN DEFAULT true,
  connection_notifications BOOLEAN DEFAULT true,
  group_notifications BOOLEAN DEFAULT true,
  topic_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DM settings
CREATE TABLE IF NOT EXISTS dm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  muted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Muted users (for DMs)
CREATE TABLE IF NOT EXISTS muted_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  muted_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, muted_user_id)
);

-- ============================================
-- TOPIC-RELATED TABLES
-- ============================================

-- Topic follows
CREATE TABLE IF NOT EXISTS topic_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

-- Topic settings
CREATE TABLE IF NOT EXISTS topic_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  muted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

-- Topic read status
CREATE TABLE IF NOT EXISTS topic_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

-- Kicked topic users
CREATE TABLE IF NOT EXISTS kicked_topic_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  kicked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(topic_id, user_id)
);

-- Message reactions
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- ============================================
-- GROUP CHAT TABLES
-- ============================================

-- Group chats
CREATE TABLE IF NOT EXISTS group_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  emojis TEXT[] NOT NULL,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group chat members
CREATE TABLE IF NOT EXISTS group_chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES group_chats(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  invited_by UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  display_order INTEGER DEFAULT 0,
  UNIQUE(group_id, user_id)
);

-- Group messages
CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES group_chats(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  reply_to_id UUID REFERENCES group_messages(id),
  reply_to_user_id UUID REFERENCES profiles(id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_topic_id ON messages(topic_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);

-- Private messages indexes
CREATE INDEX IF NOT EXISTS idx_private_messages_sender ON private_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_receiver ON private_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_private_messages_created_at ON private_messages(created_at DESC);

-- Connections indexes
CREATE INDEX IF NOT EXISTS idx_connections_follower ON connections(follower_id);
CREATE INDEX IF NOT EXISTS idx_connections_following ON connections(following_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status);

-- Group chat indexes
CREATE INDEX IF NOT EXISTS idx_group_chat_members_user_id ON group_chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_group_id ON group_chat_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_status ON group_chat_members(status);
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created_at ON group_messages(created_at DESC);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE muted_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_read_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE kicked_topic_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Profiles policies
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can delete their own profile" ON profiles FOR DELETE USING (auth.uid() = id);

-- Topics policies
CREATE POLICY "Topics are viewable by everyone" ON topics FOR SELECT USING (true);

-- Messages policies
CREATE POLICY "Messages are viewable by authenticated users" ON messages FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert messages" ON messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own messages" ON messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own messages" ON messages FOR DELETE USING (auth.uid() = user_id);

-- Private messages policies
CREATE POLICY "Users can view own private messages" ON private_messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can send private messages" ON private_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can update own sent messages" ON private_messages FOR UPDATE
  USING (auth.uid() = sender_id);
CREATE POLICY "Users can delete own messages" ON private_messages FOR DELETE
  USING (auth.uid() = sender_id);

-- Connections policies
CREATE POLICY "Users can view own connections" ON connections FOR SELECT
  USING (auth.uid() = follower_id OR auth.uid() = following_id);
CREATE POLICY "Users can create connection requests" ON connections FOR INSERT
  WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can update connections they're part of" ON connections FOR UPDATE
  USING (auth.uid() = follower_id OR auth.uid() = following_id);
CREATE POLICY "Users can delete connections they're part of" ON connections FOR DELETE
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- Push subscriptions policies
CREATE POLICY "Users can view own subscriptions" ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subscriptions" ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own subscriptions" ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- Notification preferences policies
CREATE POLICY "Users can view own preferences" ON notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON notification_preferences FOR UPDATE USING (auth.uid() = user_id);

-- DM settings policies
CREATE POLICY "Users can view own DM settings" ON dm_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own DM settings" ON dm_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own DM settings" ON dm_settings FOR UPDATE USING (auth.uid() = user_id);

-- Muted users policies
CREATE POLICY "Users can view own muted users" ON muted_users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can mute users" ON muted_users FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unmute users" ON muted_users FOR DELETE USING (auth.uid() = user_id);

-- Topic follows policies
CREATE POLICY "Users can view own topic follows" ON topic_follows FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can follow topics" ON topic_follows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own follows" ON topic_follows FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can unfollow topics" ON topic_follows FOR DELETE USING (auth.uid() = user_id);

-- Topic settings policies
CREATE POLICY "Users can view own topic settings" ON topic_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own topic settings" ON topic_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own topic settings" ON topic_settings FOR UPDATE USING (auth.uid() = user_id);

-- Topic read status policies
CREATE POLICY "Users can view own read status" ON topic_read_status FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own read status" ON topic_read_status FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own read status" ON topic_read_status FOR UPDATE USING (auth.uid() = user_id);

-- Kicked topic users policies
CREATE POLICY "Users can view kicked users" ON kicked_topic_users FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can kick users" ON kicked_topic_users FOR INSERT WITH CHECK (auth.uid() = kicked_by);

-- Message reactions policies
CREATE POLICY "Users can view reactions" ON message_reactions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can add reactions" ON message_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove own reactions" ON message_reactions FOR DELETE USING (auth.uid() = user_id);

-- Group chats policies
CREATE POLICY "Users can view their groups" ON group_chats FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM group_chat_members
    WHERE group_chat_members.group_id = group_chats.id
    AND group_chat_members.user_id = auth.uid()
    AND group_chat_members.status = 'accepted'
  )
  OR created_by = auth.uid()
);
CREATE POLICY "Users can create groups" ON group_chats FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "Admins can update groups" ON group_chats FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM group_chat_members
    WHERE group_chat_members.group_id = group_chats.id
    AND group_chat_members.user_id = auth.uid()
    AND group_chat_members.role = 'admin'
    AND group_chat_members.status = 'accepted'
  )
);

-- Group chat members policies
CREATE POLICY "Users can view group members" ON group_chat_members FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM group_chat_members AS gcm
    WHERE gcm.group_id = group_chat_members.group_id
    AND gcm.user_id = auth.uid()
    AND (gcm.status = 'accepted' OR gcm.user_id = group_chat_members.user_id)
  )
  OR user_id = auth.uid()
);
CREATE POLICY "Users can invite members" ON group_chat_members FOR INSERT WITH CHECK (
  invited_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM group_chat_members AS gcm
    WHERE gcm.group_id = group_chat_members.group_id
    AND gcm.user_id = auth.uid()
    AND gcm.status = 'accepted'
  )
);
CREATE POLICY "Users can update own membership" ON group_chat_members FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Admins can remove members" ON group_chat_members FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM group_chat_members AS gcm
    WHERE gcm.group_id = group_chat_members.group_id
    AND gcm.user_id = auth.uid()
    AND gcm.role = 'admin'
    AND gcm.status = 'accepted'
  )
  OR user_id = auth.uid()
);

-- Group messages policies
CREATE POLICY "Users can view group messages" ON group_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM group_chat_members
    WHERE group_chat_members.group_id = group_messages.group_id
    AND group_chat_members.user_id = auth.uid()
    AND group_chat_members.status = 'accepted'
  )
);
CREATE POLICY "Users can send group messages" ON group_messages FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM group_chat_members
    WHERE group_chat_members.group_id = group_messages.group_id
    AND group_chat_members.user_id = auth.uid()
    AND group_chat_members.status = 'accepted'
  )
);
CREATE POLICY "Users can update own messages" ON group_messages FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own messages" ON group_messages FOR DELETE USING (user_id = auth.uid());

-- ============================================
-- TRIGGERS & FUNCTIONS
-- ============================================

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(profiles.name, EXCLUDED.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to delete DMs when connection is removed
CREATE OR REPLACE FUNCTION delete_dms_on_connection_removal()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM private_messages
  WHERE (sender_id = OLD.follower_id AND receiver_id = OLD.following_id)
     OR (sender_id = OLD.following_id AND receiver_id = OLD.follower_id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to delete DMs when connection is deleted
DROP TRIGGER IF EXISTS trigger_delete_dms_on_connection_removal ON connections;
CREATE TRIGGER trigger_delete_dms_on_connection_removal
  BEFORE DELETE ON connections
  FOR EACH ROW EXECUTE FUNCTION delete_dms_on_connection_removal();

-- ============================================
-- SEED DATA - DEFAULT TOPICS
-- ============================================

INSERT INTO topics (slug, name, icon, description, display_order) VALUES
  ('general', 'General', '💬', 'General discussion and community chat', 1),
  ('intros', 'Intros', '👋', 'Introduce yourself to the community', 2),
  ('events', 'Events', '📅', 'Community events and meetups', 3),
  ('hiring', 'Hiring', '💼', 'Job postings and opportunities', 4),
  ('resources', 'Resources', '📚', 'Helpful resources and tools', 5),
  ('bugs-requests', 'Bugs & Requests', '🐛', 'Bug reports and feature requests', 6)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- STORAGE BUCKETS
-- ============================================

-- Note: Storage buckets need to be created via Supabase Dashboard or API
-- Required buckets:
-- - avatars (public)
-- - chat-images (authenticated access)
