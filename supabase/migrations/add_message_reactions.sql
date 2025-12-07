-- Create message_reactions table for emoji reactions on messages
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('public', 'private')),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique reaction per user per message per emoji
  UNIQUE(message_id, user_id, emoji)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id, message_type);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON message_reactions(user_id);

-- Enable Row Level Security
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view reactions
CREATE POLICY "Anyone can view reactions"
  ON message_reactions
  FOR SELECT
  USING (true);

-- Allow authenticated users to add their own reactions
CREATE POLICY "Users can add their own reactions"
  ON message_reactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own reactions
CREATE POLICY "Users can delete their own reactions"
  ON message_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
