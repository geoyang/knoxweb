#!/usr/bin/env node

// Script to create the assets bucket for Knox web uploads
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://quqlovduekdasldqadge.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1cWxvdmR1ZWtkYXNsZHFhZGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NzQ5MjgsImV4cCI6MjA4MTE1MDkyOH0.bePrytQ_iJtzBjjkguFSCBrIpgzZlhBeOrbmsmzo5x4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createAssetsBucket() {
  console.log('🚀 Creating assets bucket...');
  
  try {
    // Create the assets bucket
    const { data: bucket, error: createError } = await supabase.storage.createBucket('assets', {
      public: true,
      allowedMimeTypes: ['image/*', 'video/*'],
      fileSizeLimit: 52428800, // 50MB
    });
    
    if (createError) {
      console.error('❌ Error creating bucket:', createError);
      
      if (createError.message.includes('already exists')) {
        console.log('✅ Bucket already exists, continuing with test...');
      } else if (createError.message.includes('row-level security')) {
        console.log('\n💡 Bucket creation failed due to RLS policies.');
        console.log('📋 You need to create the bucket manually in Supabase Dashboard:');
        console.log('1. Go to: https://supabase.com/dashboard/project/quqlovduekdasldqadge/storage/buckets');
        console.log('2. Click "New bucket"');
        console.log('3. Name: "assets"');
        console.log('4. Set as "Public bucket" ✅');
        console.log('5. Max file size: 50MB');
        console.log('6. Allowed MIME types: image/*, video/*');
        console.log('\n🔧 Then run these SQL commands in the SQL Editor:');
        console.log(`
-- Enable RLS on storage.objects
alter table storage.objects enable row level security;

-- Allow authenticated users to upload to assets bucket
create policy "Allow authenticated upload to assets bucket"
on storage.objects for insert
to authenticated
with check (bucket_id = 'assets');

-- Allow public read access to assets bucket
create policy "Allow public read access to assets bucket"  
on storage.objects for select
to public
using (bucket_id = 'assets');

-- Allow authenticated users to update their own files
create policy "Allow authenticated update own files in assets"
on storage.objects for update  
to authenticated
using (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow authenticated users to delete their own files
create policy "Allow authenticated delete own files in assets"
on storage.objects for delete
to authenticated  
using (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);
        `);
        return;
      } else {
        return;
      }
    } else {
      console.log('✅ Successfully created assets bucket!');
      console.log('Bucket details:', bucket);
    }
    
    // Test upload to verify everything works
    console.log('🧪 Testing bucket access...');
    const testFile = new Blob(['test content for Knox web'], { type: 'text/plain' });
    const testFileName = `test-web-upload-${Date.now()}.txt`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('assets')
      .upload(testFileName, testFile);
    
    if (uploadError) {
      console.error('❌ Error testing upload:', uploadError);
      console.log('💡 You may need to configure RLS policies manually.');
    } else {
      console.log('✅ Bucket is working! Test file uploaded:', uploadData);
      
      // Test getting public URL
      const { data: urlData } = supabase.storage
        .from('assets')
        .getPublicUrl(uploadData.path);
      console.log('📍 Public URL:', urlData.publicUrl);
      
      // Clean up test file
      await supabase.storage.from('assets').remove([uploadData.path]);
      console.log('🗑️ Test file cleaned up');
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the script
createAssetsBucket()
  .then(() => {
    console.log('\n🎉 Assets bucket setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });