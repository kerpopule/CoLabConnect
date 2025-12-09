-- Add display_order column to topics table for admin-controlled ordering
ALTER TABLE topics ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Set initial order based on current expected order
UPDATE topics SET display_order = 0 WHERE slug = 'general';
UPDATE topics SET display_order = 1 WHERE slug = 'hiring';
UPDATE topics SET display_order = 2 WHERE slug = 'fundraising';
UPDATE topics SET display_order = 3 WHERE slug = 'bugs-requests';
UPDATE topics SET display_order = 4 WHERE slug = 'events';

-- For any other topics, set order based on created_at
UPDATE topics
SET display_order = (
  SELECT COUNT(*)
  FROM topics t2
  WHERE t2.created_at < topics.created_at
) + 5
WHERE display_order = 0 AND slug NOT IN ('general', 'hiring', 'fundraising', 'bugs-requests', 'events');

-- Create index for faster ordering queries
CREATE INDEX IF NOT EXISTS idx_topics_display_order ON topics(display_order);

-- Verify the update
SELECT id, slug, name, display_order FROM topics ORDER BY display_order;
