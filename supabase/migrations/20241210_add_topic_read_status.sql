-- Create topic_read_status table for cross-device sync of topic read timestamps
-- This replaces the localStorage-based tracking for topics
CREATE TABLE IF NOT EXISTS topic_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE NOT NULL,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_topic_read_status_user_id ON topic_read_status(user_id);
CREATE INDEX IF NOT EXISTS idx_topic_read_status_topic_id ON topic_read_status(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_read_status_user_topic ON topic_read_status(user_id, topic_id);

-- Enable RLS
ALTER TABLE topic_read_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own read status
CREATE POLICY "Users can view own topic read status" ON topic_read_status
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own read status
CREATE POLICY "Users can insert own topic read status" ON topic_read_status
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own read status
CREATE POLICY "Users can update own topic read status" ON topic_read_status
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own read status
CREATE POLICY "Users can delete own topic read status" ON topic_read_status
  FOR DELETE USING (user_id = auth.uid());

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE topic_read_status;
