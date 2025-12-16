-- Setup Supabase Storage bucket for image uploads
-- Run this in your Supabase SQL Editor if the 'images' bucket doesn't exist

-- Create the images bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for the images bucket

-- Policy: Users can upload images to their own folder
CREATE POLICY "Users can upload images to own folder" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Public can view images (for web display)
CREATE POLICY "Public can view images" ON storage.objects
FOR SELECT USING (bucket_id = 'images');

-- Policy: Users can delete their own images
CREATE POLICY "Users can delete own images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'images' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;