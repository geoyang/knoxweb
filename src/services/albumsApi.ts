import { supabase, getAccessToken } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://quqlovduekdasldqadge.supabase.co';
const ALBUMS_API_URL = `${SUPABASE_URL}/functions/v1/admin-albums-api`;
const IMAGES_API_URL = `${SUPABASE_URL}/functions/v1/admin-images-api`;

// Structured error for upload limit violations
export class UploadLimitError extends Error {
  code: string;
  current: number;
  limit: number;

  constructor(message: string, code: string, current: number, limit: number) {
    super(message);
    this.name = 'UploadLimitError';
    this.code = code;
    this.current = current;
    this.limit = limit;
  }
}

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
  const accessToken = getAccessToken();

  if (!accessToken) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(`${ALBUMS_API_URL}?album_id=${albumId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
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
  const accessToken = getAccessToken();

  if (!accessToken) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(`${ALBUMS_API_URL}?action=remove_photo`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
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
export async function createAssetInLibrary(assetData: AssetData, skipLimitCheck?: boolean): Promise<{ success: boolean; id: string }> {
  const accessToken = getAccessToken();

  if (!accessToken) {
    throw new Error('User not authenticated');
  }

  const body = skipLimitCheck ? { ...assetData, skip_limit_check: true } : assetData;

  const response = await fetch(IMAGES_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('createAssetInLibrary error response:', data);
    if (data.code === 'PHOTO_LIMIT_REACHED' || data.code === 'VIDEO_LIMIT_REACHED') {
      throw new UploadLimitError(
        data.message || 'Upload limit reached',
        data.code,
        data.current ?? 0,
        data.limit ?? 0,
      );
    }
    const errorMessage = data.details ? `${data.error}: ${data.details}` : data.error || 'Failed to create asset';
    throw new Error(errorMessage);
  }

  return { success: true, id: data.id };
}
