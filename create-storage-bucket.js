#!/usr/bin/env node

// Script to create Supabase storage bucket for Knox web uploads
// Run this with: node create-storage-bucket.js

import { createClient } from '@supabase/supabase-js';

// Configuration from .env
const supabaseUrl = 'https://quqlovduekdasldqadge.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1cWxvdmR1ZWtkYXNsZHFhZGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NzQ5MjgsImV4cCI6MjA4MTE1MDkyOH0.bePrytQ_iJtzBjjkguFSCBrIpgzZlhBeOrbmsmzo5x4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createImagesBucket() {
  console.log('🔍 Checking existing buckets...');
  
  try {
    // First, list existing buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Error listing buckets:', listError);
      return;
    }
    
    console.log('📦 Existing buckets:', buckets.map(b => b.name));
    
    // Check if 'assets' bucket already exists
    const assetsBucket = buckets.find(bucket => bucket.id === 'assets' || bucket.name === 'assets');
    
    if (assetsBucket) {
      console.log('✅ Assets bucket already exists!');
      console.log('Bucket details:', assetsBucket);
      return;
    }
    
    console.log('📁 Bucket not visible in list, but you said it exists. Let me test direct upload...');
    
    console.log('📁 Assets bucket not found. Let me try to test upload access...');
    
    // Test if we can upload to assets bucket even if it's not listed
    console.log('🧪 Testing upload to assets bucket...');
    const testFile = new Blob(['test content for Knox web'], { type: 'text/plain' });
    const testFileName = `test-web-upload-${Date.now()}.txt`;
    
    const { data: testUpload, error: testUploadError } = await supabase.storage
      .from('assets')
      .upload(testFileName, testFile);
      
    if (testUploadError) {
      console.error('❌ Cannot upload to assets bucket:', testUploadError);
      console.log('💡 This confirms the bucket does not exist or lacks permissions.');
      console.log('📋 You need to create the "assets" bucket in Supabase Dashboard:');
      console.log('1. Go to: https://supabase.com/dashboard/project/quqlovduekdasldqadge/storage/buckets');
      console.log('2. Click "New bucket"');
      console.log('3. Name: "assets" (not "images")');
      console.log('4. Set as "Public bucket"');
      console.log('5. Max file size: 50MB');
      console.log('6. Allowed MIME types: image/*, video/*');
    } else {
      console.log('✅ Upload to assets bucket successful!');
      console.log('Upload details:', testUpload);
      
      // Test getting public URL
      const { data: urlData } = supabase.storage
        .from('assets')
        .getPublicUrl(testUpload.path);
      console.log('📍 Public URL:', urlData.publicUrl);
      
      // Clean up test file
      await supabase.storage.from('assets').remove([testUpload.path]);
      console.log('🗑️ Test file cleaned up');
    }
    
    return;
    
    // Create the images bucket
    const { data: newBucket, error: createError } = await supabase.storage.createBucket('images', {
      public: true,
      allowedMimeTypes: ['image/*', 'video/*'],
      fileSizeLimit: 52428800, // 50MB
    });
    
    if (createError) {
      console.error('❌ Error creating bucket:', createError);
      
      if (createError.message.includes('row-level security policy')) {
        console.log('\n💡 The bucket creation failed due to RLS policies.');
        console.log('📋 You need to create the bucket manually in Supabase Dashboard:');
        console.log('1. Go to: https://supabase.com/dashboard/project/quqlovduekdasldqadge/storage/buckets');
        console.log('2. Click "New bucket"');
        console.log('3. Name: "images"');
        console.log('4. Set as "Public bucket"');
        console.log('5. Max file size: 50MB');
        console.log('6. Allowed MIME types: image/*, video/*');
      }
      
      return;
    }
    
    console.log('✅ Successfully created images bucket!');
    console.log('Bucket details:', newBucket);
    
    // Test upload to verify everything works
    console.log('🧪 Testing bucket access...');
    const testFile2 = new Blob(['test'], { type: 'text/plain' });
    const testFileName2 = `test/${Date.now()}_test.txt`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('images')
      .upload(testFileName2, testFile2);
    
    if (uploadError) {
      console.error('❌ Error testing upload:', uploadError);
    } else {
      console.log('✅ Bucket is working! Test file uploaded:', uploadData);
      
      // Clean up test file
      await supabase.storage.from('images').remove([testFileName2]);
      console.log('🗑️ Test file cleaned up');
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the script
createImagesBucket()
  .then(() => {
    console.log('\n🎉 Storage setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });