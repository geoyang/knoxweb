-- Set fred@eoyang.com as super admin in the auth.users table
-- This updates the is_super_admin field in the auth schema

UPDATE auth.users 
SET is_super_admin = true 
WHERE email = 'fred@eoyang.com';

-- Verify the change
SELECT id, email, is_super_admin, created_at 
FROM auth.users 
WHERE email = 'fred@eoyang.com';