-- Add DELETE policies to connections table so users can cancel/decline requests

-- Allow users to delete their own outgoing pending requests (cancel)
CREATE POLICY "Users can delete own outgoing requests" ON connections
  FOR DELETE USING (follower_id = auth.uid());

-- Allow users to delete incoming requests (decline)
CREATE POLICY "Users can delete incoming requests" ON connections
  FOR DELETE USING (following_id = auth.uid());
