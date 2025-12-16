-- Add super_admin column to profiles table
-- This migration adds a boolean super_admin column to the profiles table
-- with a default value of false for all existing users

ALTER TABLE profiles 
ADD COLUMN super_admin BOOLEAN DEFAULT false NOT NULL;

-- Add a comment to document the column purpose
COMMENT ON COLUMN profiles.super_admin IS 'Indicates if the user has super admin privileges to access all admin features including user management';

-- Optional: Create an index on the super_admin column for faster queries
CREATE INDEX idx_profiles_super_admin ON profiles(super_admin) WHERE super_admin = true;

-- Example: Set the first user as super admin (replace with actual user ID)
-- UPDATE profiles SET super_admin = true WHERE id = 'your-user-id-here';