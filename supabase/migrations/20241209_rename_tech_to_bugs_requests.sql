-- Rename "Tech" topic to "Bugs & Requests" with bug emoji
-- Run this migration in Supabase SQL Editor

-- Update by multiple conditions to catch any variation
-- Using Unicode escape for the bug emoji (U+1F41B)
UPDATE topics
SET
  name = 'Bugs & Requests',
  icon = E'\U0001F41B',
  slug = 'bugs-requests'
WHERE slug = 'tech'
   OR name = 'Tech'
   OR name = 'Bugs & Requests';

-- Verify the update
SELECT id, slug, name, icon FROM topics ORDER BY created_at;
