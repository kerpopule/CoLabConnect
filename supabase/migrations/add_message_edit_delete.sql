-- Add edited_at and deleted_at columns to messages table
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add edited_at and deleted_at columns to private_messages table
ALTER TABLE private_messages
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for soft-deleted messages (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON messages(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_private_messages_deleted_at ON private_messages(deleted_at) WHERE deleted_at IS NOT NULL;

-- Add RLS policies to allow users to update their own messages
-- (They can only update content, edited_at, and deleted_at fields)

-- Policy for messages table - allow update of own messages
CREATE POLICY IF NOT EXISTS "Users can update own messages" ON messages
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy for private_messages table - allow update of own messages
CREATE POLICY IF NOT EXISTS "Users can update own private messages" ON private_messages
FOR UPDATE USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id);
