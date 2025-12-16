-- Transfer ownership of all albums, circles, and related data to fred@eoyang.com
-- User ID: 187f60f5-a79a-41cc-b944-1521e1f64b84

-- 1. Update all circles to be owned by fred@eoyang.com
UPDATE circles 
SET owner_id = '187f60f5-a79a-41cc-b944-1521e1f64b84', 
    date_modified = NOW()
WHERE owner_id != '187f60f5-a79a-41cc-b944-1521e1f64b84';

-- 2. Update all albums to be owned by fred@eoyang.com  
UPDATE albums 
SET user_id = '187f60f5-a79a-41cc-b944-1521e1f64b84',
    date_modified = NOW()
WHERE user_id != '187f60f5-a79a-41cc-b944-1521e1f64b84';

-- 3. Update all album shares to be shared by fred@eoyang.com
UPDATE album_shares 
SET shared_by = '187f60f5-a79a-41cc-b944-1521e1f64b84',
    date_modified = NOW()
WHERE shared_by != '187f60f5-a79a-41cc-b944-1521e1f64b84';

-- 4. Update all circle invitations to be invited by fred@eoyang.com
UPDATE circle_users 
SET invited_by = '187f60f5-a79a-41cc-b944-1521e1f64b84',
    date_modified = NOW()
WHERE invited_by != '187f60f5-a79a-41cc-b944-1521e1f64b84';

-- Verification queries to check the results:

-- Check circles ownership
SELECT id, name, owner_id, date_modified 
FROM circles 
WHERE owner_id = '187f60f5-a79a-41cc-b944-1521e1f64b84';

-- Check albums ownership  
SELECT id, title, user_id, date_modified
FROM albums 
WHERE user_id = '187f60f5-a79a-41cc-b944-1521e1f64b84';

-- Check album shares
SELECT id, album_id, shared_by, date_modified
FROM album_shares 
WHERE shared_by = '187f60f5-a79a-41cc-b944-1521e1f64b84';

-- Check circle invitations
SELECT id, circle_id, invited_by, date_modified
FROM circle_users 
WHERE invited_by = '187f60f5-a79a-41cc-b944-1521e1f64b84';

-- Summary counts
SELECT 
    'circles' as table_name,
    COUNT(*) as owned_count
FROM circles 
WHERE owner_id = '187f60f5-a79a-41cc-b944-1521e1f64b84'

UNION ALL

SELECT 
    'albums' as table_name,
    COUNT(*) as owned_count
FROM albums 
WHERE user_id = '187f60f5-a79a-41cc-b944-1521e1f64b84'

UNION ALL

SELECT 
    'album_shares' as table_name,
    COUNT(*) as owned_count
FROM album_shares 
WHERE shared_by = '187f60f5-a79a-41cc-b944-1521e1f64b84'

UNION ALL

SELECT 
    'circle_invitations' as table_name,
    COUNT(*) as owned_count
FROM circle_users 
WHERE invited_by = '187f60f5-a79a-41cc-b944-1521e1f64b84';