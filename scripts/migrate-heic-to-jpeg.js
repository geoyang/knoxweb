#!/usr/bin/env node

/**
 * Migration script to convert existing HEIC files to web-compatible JPEGs
 *
 * This script:
 * 1. Finds all assets with HEIC URLs that don't have a web_uri
 * 2. Downloads each HEIC file from Supabase storage
 * 3. Converts it to JPEG
 * 4. Uploads the JPEG to storage
 * 5. Updates the assets table with the web_uri
 *
 * Usage: node scripts/migrate-heic-to-jpeg.js
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import heicConvert from 'heic-convert';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables.');
  console.error('Required: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nCreate a .env file with these values or set them in your environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Check if URL is a HEIC file
const isHeicUrl = (url) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith('.heic') || lower.endsWith('.heif');
};

// Extract storage path from full URL
const getStoragePath = (url) => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    // Path format: /storage/v1/object/public/assets/{path}
    const match = urlObj.pathname.match(/\/storage\/v1\/object\/public\/assets\/(.+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch (e) {
    return null;
  }
};

// Generate web path for JPEG version
const getWebPath = (originalPath) => {
  if (!originalPath) return null;

  // Split path into parts
  const parts = originalPath.split('/');
  const filename = parts.pop();
  const userId = parts[0];

  // Create web filename
  const webFilename = 'web_' + filename.replace(/\.(heic|heif)$/i, '.jpg');

  return `${userId}/web/${webFilename}`;
};

// Download file from Supabase storage
const downloadFile = async (storagePath) => {
  const { data, error } = await supabase.storage
    .from('assets')
    .download(storagePath);

  if (error) {
    throw new Error(`Failed to download ${storagePath}: ${error.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
};

// Convert HEIC to JPEG
const convertHeicToJpeg = async (heicBuffer) => {
  const jpegBuffer = await heicConvert({
    buffer: heicBuffer,
    format: 'JPEG',
    quality: 0.92
  });
  return Buffer.from(jpegBuffer);
};

// Upload JPEG to Supabase storage
const uploadJpeg = async (jpegBuffer, webPath) => {
  const { data, error } = await supabase.storage
    .from('assets')
    .upload(webPath, jpegBuffer, {
      contentType: 'image/jpeg',
      upsert: true
    });

  if (error) {
    throw new Error(`Failed to upload ${webPath}: ${error.message}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/assets/${data.path}`;
};

// Update asset with web_uri
const updateAssetWebUri = async (assetId, webUri) => {
  const { error } = await supabase
    .from('assets')
    .update({ web_uri: webUri })
    .eq('id', assetId);

  if (error) {
    throw new Error(`Failed to update asset ${assetId}: ${error.message}`);
  }
};

// Also update album_assets that reference this asset
const updateAlbumAssets = async (assetPath, webUri) => {
  // Find album_assets that have this path as asset_uri
  const { data: albumAssets, error: findError } = await supabase
    .from('album_assets')
    .select('id, asset_uri')
    .eq('asset_uri', assetPath);

  if (findError) {
    console.warn(`  Warning: Could not find album_assets for path: ${findError.message}`);
    return 0;
  }

  if (!albumAssets || albumAssets.length === 0) {
    return 0;
  }

  // Update with web_uri
  const { error: updateError } = await supabase
    .from('album_assets')
    .update({ web_uri: webUri })
    .in('id', albumAssets.map(a => a.id));

  if (updateError) {
    console.warn(`  Warning: Could not update album_assets: ${updateError.message}`);
    return 0;
  }

  return albumAssets.length;
};

// Main migration function
const migrateHeicFiles = async () => {
  console.log('\n🔄 HEIC to JPEG Migration Script\n');
  console.log('Connecting to Supabase...');

  // Find all HEIC assets without web_uri
  const { data: heicAssets, error: queryError } = await supabase
    .from('assets')
    .select('id, path, web_uri')
    .or('path.ilike.%.heic,path.ilike.%.heif')
    .is('web_uri', null);

  if (queryError) {
    console.error('❌ Failed to query assets:', queryError.message);
    process.exit(1);
  }

  // Also find assets with HEIC web_uri (incorrectly set)
  const { data: wrongWebUri, error: queryError2 } = await supabase
    .from('assets')
    .select('id, path, web_uri')
    .or('web_uri.ilike.%.heic,web_uri.ilike.%.heif');

  if (!queryError2 && wrongWebUri) {
    // Add to list if not already there
    for (const asset of wrongWebUri) {
      if (!heicAssets.find(a => a.id === asset.id)) {
        heicAssets.push(asset);
      }
    }
  }

  if (!heicAssets || heicAssets.length === 0) {
    console.log('✅ No HEIC files need migration!');
    return;
  }

  console.log(`Found ${heicAssets.length} HEIC file(s) to migrate.\n`);

  let successCount = 0;
  let errorCount = 0;
  let albumAssetsUpdated = 0;

  for (let i = 0; i < heicAssets.length; i++) {
    const asset = heicAssets[i];
    const progress = `[${i + 1}/${heicAssets.length}]`;

    console.log(`${progress} Processing: ${asset.id}`);

    try {
      // Get storage path from URL
      const storagePath = getStoragePath(asset.path);
      if (!storagePath) {
        console.log(`  ⏭️  Skipping - could not parse path: ${asset.path}`);
        continue;
      }

      // Check if it's actually a HEIC file
      if (!isHeicUrl(asset.path)) {
        console.log(`  ⏭️  Skipping - not a HEIC file`);
        continue;
      }

      // Generate web path
      const webPath = getWebPath(storagePath);
      if (!webPath) {
        console.log(`  ⏭️  Skipping - could not generate web path`);
        continue;
      }

      console.log(`  📥 Downloading HEIC...`);
      const heicBuffer = await downloadFile(storagePath);
      console.log(`  📥 Downloaded ${Math.round(heicBuffer.length / 1024)} KB`);

      console.log(`  🔄 Converting to JPEG...`);
      const jpegBuffer = await convertHeicToJpeg(heicBuffer);
      console.log(`  🔄 Converted to ${Math.round(jpegBuffer.length / 1024)} KB`);

      console.log(`  📤 Uploading JPEG...`);
      const webUri = await uploadJpeg(jpegBuffer, webPath);
      console.log(`  📤 Uploaded to: ${webPath}`);

      console.log(`  💾 Updating database...`);
      await updateAssetWebUri(asset.id, webUri);

      // Also update album_assets
      const albumCount = await updateAlbumAssets(asset.path, webUri);
      if (albumCount > 0) {
        console.log(`  💾 Updated ${albumCount} album_assets entries`);
        albumAssetsUpdated += albumCount;
      }

      console.log(`  ✅ Done!\n`);
      successCount++;

    } catch (err) {
      console.error(`  ❌ Error: ${err.message}\n`);
      errorCount++;
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📁 Album assets updated: ${albumAssetsUpdated}`);
  console.log('\nDone!\n');
};

// Run the migration
migrateHeicFiles().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
