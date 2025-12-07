-- Create chat-images storage bucket for chat image uploads
-- Run this in Supabase SQL editor or via Dashboard > Storage

-- Create the bucket (if doing via SQL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload chat images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-images' AND
  (storage.foldername(name))[1] = 'chat' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow anyone to view chat images (public bucket)
CREATE POLICY "Anyone can view chat images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-images');

-- Allow users to delete their own chat images
CREATE POLICY "Users can delete their own chat images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-images' AND
  (storage.foldername(name))[1] = 'chat' AND
  (storage.foldername(name))[2] = auth.uid()::text
);
