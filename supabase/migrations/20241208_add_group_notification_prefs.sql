-- Add notifications_enabled column to group_chat_members
-- Defaults to true for new members (notifications ON by default)
ALTER TABLE group_chat_members
ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true;
