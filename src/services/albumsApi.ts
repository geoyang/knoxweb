import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://quqlovduekdasldqadge.supabase.co';
const ALBUMS_API_URL = `${SUPABASE_URL}/functions/v1/admin-albums-api`;
const IMAGES_API_URL = `${SUPABASE_URL}/functions/v1/admin-images-api`;

// Asset data for creating new assets via edge function
interface AssetData {
  needsCreation?: boolean;
  id?: string;
  path?: string;
  thumbnail?: string;
  web_uri?: string;
  asset_file_id?: string;
  created_at?: string;
  uploaded_at?: string;
  media_type?: string;
  uri?: string;
  mediaType?: string;
  latitude?: number;
  longitude?: number;
  location_name?: string;
  camera_make?: string;
  camera_model?: string;
  lens_make?: string;
  lens_model?: string;
  width?: number;
  height?: number;
  orientation?: number;
  aperture?: number;
  shutter_speed?: string;
  iso?: number;
  focal_length?: number;
  focal_length_35mm?: number;
  flash?: string;
  white_balance?: string;
  metadata?: Record<string, unknown>;
  thumbnail_uri?: string;
}

interface AddPhotosParams {
  albumId: string;
  assets: AssetData[];
}

interface RemovePhotoParams {
  albumId: string;
  assetId: string;
}

/**
 * Add photos to an album via edge function
 */
export async function addPhotosToAlbum({ albumId, assets }: AddPhotosParams): Promise<{ success: boolean; added: number }> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(`${ALBUMS_API_URL}?album_id=${albumId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'apikey': session.access_token,
    },
    body: JSON.stringify({ assets }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to add photos to album');
  }

  return { success: true, added: data.added || assets.length };
}

/**
 * Remove a photo from an album via edge function
 */
export async function removePhotoFromAlbum({ albumId, assetId }: RemovePhotoParams): Promise<boolean> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(`${ALBUMS_API_URL}?action=remove_photo`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'apikey': session.access_token,
    },
    body: JSON.stringify({
      album_id: albumId,
      asset_id: assetId,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to remove photo from album');
  }

  return true;
}

/**
 * Create an asset in the library (without adding to an album) via edge function
 * This ensures consistent asset creation between web and mobile apps
 */
export async function createAssetInLibrary(assetData: AssetData): Promise<{ success: boolean; id: string }> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(IMAGES_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'apikey': session.access_token,
    },
    body: JSON.stringify(assetData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to create asset');
  }

  return { success: true, id: data.id };
}
