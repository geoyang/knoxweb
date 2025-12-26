import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://quqlovduekdasldqadge.supabase.co';
const ALBUMS_API_URL = `${SUPABASE_URL}/functions/v1/admin-albums-api`;

interface AddPhotosParams {
  albumId: string;
  assets: Array<{
    id: string;
    uri: string;
    mediaType: string;
    thumbnail_uri?: string;
    web_uri?: string;
  }>;
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
