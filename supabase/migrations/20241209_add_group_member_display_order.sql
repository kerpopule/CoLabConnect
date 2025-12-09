-- Add display_order column to group_chat_members table for per-user ordering
ALTER TABLE group_chat_members ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Create index for faster ordering queries
CREATE INDEX IF NOT EXISTS idx_group_chat_members_display_order ON group_chat_members(user_id, display_order);
