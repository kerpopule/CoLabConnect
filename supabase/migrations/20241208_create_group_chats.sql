-- Create group_chats table
CREATE TABLE IF NOT EXISTS group_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,                              -- Optional name
  emojis TEXT[] NOT NULL,                 -- 1-3 emojis for display
  created_by UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create group_chat_members table
CREATE TABLE IF NOT EXISTS group_chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES group_chats(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  invited_by UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  UNIQUE(group_id, user_id)
);

-- Create group_messages table
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_group_chat_members_user_id ON group_chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_group_id ON group_chat_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_status ON group_chat_members(status);
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created_at ON group_messages(created_at DESC);

-- Enable RLS
ALTER TABLE group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for group_chats
-- Users can view groups they are accepted members of
CREATE POLICY "Users can view their groups" ON group_chats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_chat_members
      WHERE group_chat_members.group_id = group_chats.id
      AND group_chat_members.user_id = auth.uid()
      AND group_chat_members.status = 'accepted'
    )
    OR created_by = auth.uid()
  );

-- Users can create groups
CREATE POLICY "Users can create groups" ON group_chats
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- Admins can update group details
CREATE POLICY "Admins can update groups" ON group_chats
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM group_chat_members
      WHERE group_chat_members.group_id = group_chats.id
      AND group_chat_members.user_id = auth.uid()
      AND group_chat_members.role = 'admin'
      AND group_chat_members.status = 'accepted'
    )
  );

-- RLS Policies for group_chat_members
-- Users can view members of groups they belong to
CREATE POLICY "Users can view group members" ON group_chat_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_chat_members AS gcm
      WHERE gcm.group_id = group_chat_members.group_id
      AND gcm.user_id = auth.uid()
      AND (gcm.status = 'accepted' OR gcm.user_id = group_chat_members.user_id)
    )
    OR user_id = auth.uid()
  );

-- Users can insert members (invite connections)
CREATE POLICY "Users can invite members" ON group_chat_members
  FOR INSERT WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM group_chat_members AS gcm
      WHERE gcm.group_id = group_chat_members.group_id
      AND gcm.user_id = auth.uid()
      AND gcm.status = 'accepted'
    )
  );

-- Users can update their own membership (accept/decline invite)
CREATE POLICY "Users can update own membership" ON group_chat_members
  FOR UPDATE USING (user_id = auth.uid());

-- Admins can delete members (kick)
CREATE POLICY "Admins can remove members" ON group_chat_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM group_chat_members AS gcm
      WHERE gcm.group_id = group_chat_members.group_id
      AND gcm.user_id = auth.uid()
      AND gcm.role = 'admin'
      AND gcm.status = 'accepted'
    )
    OR user_id = auth.uid()
  );

-- RLS Policies for group_messages
-- Users can view messages in groups they are accepted members of
CREATE POLICY "Users can view group messages" ON group_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_chat_members
      WHERE group_chat_members.group_id = group_messages.group_id
      AND group_chat_members.user_id = auth.uid()
      AND group_chat_members.status = 'accepted'
    )
  );

-- Users can send messages to groups they are accepted members of
CREATE POLICY "Users can send group messages" ON group_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM group_chat_members
      WHERE group_chat_members.group_id = group_messages.group_id
      AND group_chat_members.user_id = auth.uid()
      AND group_chat_members.status = 'accepted'
    )
  );

-- Users can update their own messages
CREATE POLICY "Users can update own messages" ON group_messages
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own messages (soft delete)
CREATE POLICY "Users can delete own messages" ON group_messages
  FOR DELETE USING (user_id = auth.uid());

-- Function to delete DMs when connection is removed
CREATE OR REPLACE FUNCTION delete_dms_on_connection_removal()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete all private messages between the two users
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
  FOR EACH ROW
  EXECUTE FUNCTION delete_dms_on_connection_removal();
