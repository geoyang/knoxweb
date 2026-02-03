import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!

// DEBUG: Log what values Vite baked into the build
console.log('[Supabase Init] URL:', supabaseUrl)
console.log('[Supabase Init] Anon Key (first 20):', supabaseAnonKey?.substring(0, 20))
console.log('[Supabase Init] Functions URL will be:', supabaseUrl ? `${supabaseUrl}/functions/v1` : 'UNDEFINED')

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'public',
  },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    timeout: 10000,
  }
})

/**
 * Get the access token from localStorage without calling getSession().
 * This is faster and avoids timeout issues with the Supabase auth API.
 */
export function getAccessToken(): string | null {
  try {
    const projectRef = supabaseUrl.split('//')[1]?.split('.')[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.access_token || null;
    }
  } catch {
    // Fall back to null if parsing fails
  }
  return null;
}

export type Database = {
  public: {
    Tables: {
      circles: {
        Row: {
          id: string
          name: string
          description: string | null
          owner_id: string
          date_created: string
          date_modified: string
          is_active: boolean
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          owner_id: string
          date_created?: string
          date_modified?: string
          is_active?: boolean
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          owner_id?: string
          date_created?: string
          date_modified?: string
          is_active?: boolean
        }
      }
      circle_users: {
        Row: {
          id: string
          circle_id: string
          user_id: string | null
          email: string | null
          role: 'read_only' | 'contributor' | 'editor' | 'admin'
          status: 'pending' | 'accepted' | 'declined' | 'removed'
          invited_by: string
          date_invited: string
          date_responded: string | null
          date_modified: string
        }
        Insert: {
          id?: string
          circle_id: string
          user_id?: string | null
          email?: string | null
          role?: 'read_only' | 'contributor' | 'editor' | 'admin'
          status?: 'pending' | 'accepted' | 'declined' | 'removed'
          invited_by: string
          date_invited?: string
          date_responded?: string | null
          date_modified?: string
        }
        Update: {
          id?: string
          circle_id?: string
          user_id?: string | null
          email?: string | null
          role?: 'read_only' | 'contributor' | 'editor' | 'admin'
          status?: 'pending' | 'accepted' | 'declined' | 'removed'
          invited_by?: string
          date_invited?: string
          date_responded?: string | null
          date_modified?: string
        }
      }
      albums: {
        Row: {
          id: string
          title: string
          description: string | null
          user_id: string
          keyphoto: string | null
          date_created: string
          date_modified: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          user_id: string
          keyphoto?: string | null
          date_created?: string
          date_modified?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          user_id?: string
          keyphoto?: string | null
          date_created?: string
          date_modified?: string
        }
      }
      album_shares: {
        Row: {
          id: string
          album_id: string
          circle_id: string
          shared_by: string
          role: 'read_only' | 'contributor' | 'editor' | 'admin'
          date_shared: string
          date_modified: string
          is_active: boolean
        }
        Insert: {
          id?: string
          album_id: string
          circle_id: string
          shared_by: string
          role?: 'read_only' | 'contributor' | 'editor' | 'admin'
          date_shared?: string
          date_modified?: string
          is_active?: boolean
        }
        Update: {
          id?: string
          album_id?: string
          circle_id?: string
          shared_by?: string
          role?: 'read_only' | 'contributor' | 'editor' | 'admin'
          date_shared?: string
          date_modified?: string
          is_active?: boolean
        }
      }
      album_assets: {
        Row: {
          id: string
          album_id: string
          asset_id: string
          asset_uri: string
          asset_type: 'image' | 'video'
          display_order: number
          date_added: string
        }
        Insert: {
          id?: string
          album_id: string
          asset_id: string
          asset_uri: string
          asset_type: 'image' | 'video'
          display_order?: number
          date_added?: string
        }
        Update: {
          id?: string
          album_id?: string
          asset_id?: string
          asset_uri?: string
          asset_type?: 'image' | 'video'
          display_order?: number
          date_added?: string
        }
      }
      profiles: {
        Row: {
          id: string
          full_name: string | null
          email: string | null
          date_created: string
          date_modified: string
        }
        Insert: {
          id: string
          full_name?: string | null
          email?: string | null
          date_created?: string
          date_modified?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          email?: string | null
          date_created?: string
          date_modified?: string
        }
      }
    }
  }
}