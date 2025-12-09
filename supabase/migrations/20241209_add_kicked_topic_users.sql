-- Create table to track users kicked from general topic chats
CREATE TABLE IF NOT EXISTS kicked_topic_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  kicked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  kicked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  reason TEXT,
  UNIQUE(topic_id, user_id)
);

-- Enable RLS
ALTER TABLE kicked_topic_users ENABLE ROW LEVEL SECURITY;

-- Anyone can view kicked users (to check if they're kicked)
CREATE POLICY "Anyone can view kicked users"
  ON kicked_topic_users
  FOR SELECT
  USING (true);

-- Only admin (steve.darlow@gmail.com) can kick/unkick users
-- Note: In production, you might want a proper admin table instead
CREATE POLICY "Admin can manage kicked users"
  ON kicked_topic_users
  FOR ALL
  USING (
    auth.jwt() ->> 'email' = 'steve.darlow@gmail.com'
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_kicked_topic_users_topic_user
  ON kicked_topic_users(topic_id, user_id);
CREATE INDEX IF NOT EXISTS idx_kicked_topic_users_user
  ON kicked_topic_users(user_id);
