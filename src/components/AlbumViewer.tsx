import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Memory } from '../services/memoriesApi';
import { MemoryInputBar } from './MemoryInputBar';
import { ReactionBar } from './ReactionBar';
import { supabase } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';

// Public memories API helper (no auth required, uses invite ID for access)
const publicMemoriesApi = {
  async getMemories(inviteId: string, assetId: string): Promise<{ success: boolean; memories?: Memory[]; error?: string }> {
    try {
      const supabaseUrl = getSupabaseUrl();
      const supabaseAnonKey = getSupabaseAnonKey();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/public-memories?invite_id=${inviteId}&asset_id=${assetId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to load memories' };
      }
      return { success: true, memories: data.memories || [] };
    } catch (error) {
      console.error('Error fetching public memories:', error);
      return { success: false, error: 'Network error' };
    }
  },

  async getMemoryCount(inviteId: string, assetId: string): Promise<number> {
    try {
      const supabaseUrl = getSupabaseUrl();
      const supabaseAnonKey = getSupabaseAnonKey();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/public-memories?invite_id=${inviteId}&asset_id=${assetId}&count=true`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await response.json();
      return data.count || 0;
    } catch (error) {
      console.error('Error fetching memory count:', error);
      return 0;
    }
  },

  async getMemoryCounts(inviteId: string, assetIds: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    const batchSize = 10;
    for (let i = 0; i < assetIds.length; i += batchSize) {
      const batch = assetIds.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (id) => {
          const count = await publicMemoriesApi.getMemoryCount(inviteId, id);
          return { id, count };
        })
      );
      results.forEach(({ id, count }) => {
        counts[id] = count;
      });
    }
    return counts;
  },
};

interface Circle {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
}

interface CircleInvite {
  id: string;
  circle_id?: string;
  email: string;
  role: string;
  status: string;
  date_invited: string;
  circle?: Circle;
}

interface AlbumOwner {
  id: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
}

interface Album {
  id: string;
  title: string;
  description: string;
  keyphoto: string;
  date_created: string;
  share_role: string;
  date_shared: string;
  assets: AlbumAsset[];
  keyphotUrl?: string;
  owner?: AlbumOwner;
}

interface AssetTag {
  id: string;
  type: 'person' | 'object';
  value: string;
  contact_id?: string;
}

interface AlbumAsset {
  id: string;
  album_id: string;
  asset_id: string;
  asset_uri: string;
  web_uri: string;
  asset_type: 'image' | 'video';
  display_order: number;
  date_added: string;
  path?: string | null;
  thumbnail?: string | null;
  // Metadata fields
  created_at?: string;
  width?: number;
  height?: number;
  latitude?: number;
  longitude?: number;
  location_name?: string;
  camera_make?: string;
  camera_model?: string;
  lens_make?: string;
  lens_model?: string;
  orientation?: number;
  aperture?: number;
  shutter_speed?: string;
  iso?: number;
  focal_length?: number;
  focal_length_35mm?: number;
  flash?: string;
  white_balance?: string;
  // Tags
  tags?: AssetTag[];
}

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  avatar_url?: string;
}

interface AccountStatus {
  requiresAccount: boolean;
  hasAccount: boolean;
  profile: UserProfile | null;
}

interface AlbumData {
  invite: CircleInvite;
  account: AccountStatus;
  albums: Album[];
  stats: {
    total_albums: number;
    total_photos: number;
  };
}

export const AlbumViewer: React.FC = () => {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const [albumData, setAlbumData] = useState<AlbumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AlbumAsset | null>(null);

  // Memories state
  const [memoriesAssetId, setMemoriesAssetId] = useState<string | null>(null);
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({});
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);

  // Photo info/metadata state
  const [infoAsset, setInfoAsset] = useState<AlbumAsset | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; asset: AlbumAsset } | null>(null);

  // Handle context menu (right-click / long-press)
  const handleContextMenu = useCallback((e: React.MouseEvent, asset: AlbumAsset) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, asset });
  }, []);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Format metadata value for display
  const formatMetadataValue = (key: string, value: any): string => {
    if (value === null || value === undefined) return '-';

    switch (key) {
      case 'created_at':
      case 'date_added':
        return new Date(value).toLocaleString();
      case 'aperture':
        return `f/${value}`;
      case 'focal_length':
      case 'focal_length_35mm':
        return `${value}mm`;
      case 'iso':
        return `ISO ${value}`;
      case 'width':
      case 'height':
        return `${value}px`;
      default:
        return String(value);
    }
  };

  // Get metadata fields to display (excluding lat/long, using location_name instead)
  const getMetadataFields = (asset: AlbumAsset) => {
    const fields: { label: string; value: string }[] = [];

    if (asset.created_at) fields.push({ label: 'Date Taken', value: formatMetadataValue('created_at', asset.created_at) });
    if (asset.date_added) fields.push({ label: 'Date Added', value: formatMetadataValue('date_added', asset.date_added) });
    if (asset.width && asset.height) fields.push({ label: 'Dimensions', value: `${asset.width} × ${asset.height}` });
    if (asset.location_name) fields.push({ label: 'Location', value: asset.location_name });
    if (asset.camera_make || asset.camera_model) {
      const camera = [asset.camera_make, asset.camera_model].filter(Boolean).join(' ');
      fields.push({ label: 'Camera', value: camera });
    }
    if (asset.lens_make || asset.lens_model) {
      const lens = [asset.lens_make, asset.lens_model].filter(Boolean).join(' ');
      fields.push({ label: 'Lens', value: lens });
    }
    if (asset.aperture) fields.push({ label: 'Aperture', value: formatMetadataValue('aperture', asset.aperture) });
    if (asset.shutter_speed) fields.push({ label: 'Shutter Speed', value: asset.shutter_speed });
    if (asset.iso) fields.push({ label: 'ISO', value: formatMetadataValue('iso', asset.iso) });
    if (asset.focal_length) fields.push({ label: 'Focal Length', value: formatMetadataValue('focal_length', asset.focal_length) });
    if (asset.focal_length_35mm) fields.push({ label: 'Focal Length (35mm)', value: formatMetadataValue('focal_length_35mm', asset.focal_length_35mm) });
    if (asset.flash) fields.push({ label: 'Flash', value: asset.flash });
    if (asset.white_balance) fields.push({ label: 'White Balance', value: asset.white_balance });

    return fields;
  };

  // Load memories when panel is opened
  useEffect(() => {
    const loadMemories = async () => {
      if (!memoriesAssetId || !inviteId) return;
      setLoadingMemories(true);
      const result = await publicMemoriesApi.getMemories(inviteId, memoriesAssetId);
      if (result.success && result.memories) {
        setMemories(result.memories);
      } else {
        setMemories([]);
      }
      setLoadingMemories(false);
    };
    loadMemories();
  }, [memoriesAssetId, inviteId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Auth state for logout
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Check if user is logged in
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[AlbumViewer] Session check:', !!session, session?.user?.email);
      setIsLoggedIn(!!session);
    };
    checkAuth();
  }, []);

  // Registration form state
  const [showRegistration, setShowRegistration] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registrationSent, setRegistrationSent] = useState(false);
  const [regForm, setRegForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  });
  const [regError, setRegError] = useState<string | null>(null);

  // Inline registration prompt state (for "Add Memory" from read-only users)
  const [showInlineRegistration, setShowInlineRegistration] = useState(false);

  const isWebAccessibleUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    // Include data: URIs for base64 thumbnails
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:');
  };

  // Get URL for displaying in the web viewer (highest quality web-compatible image)
  const getDisplayUrl = (asset: AlbumAsset): string | null => {
    // Priority 1: path (highest quality web URL)
    if (asset.web_uri && (asset.web_uri.startsWith('http://') || asset.web_uri.startsWith('https://'))) {
      return asset.web_uri;
    }
    // // Priority 2: asset_uri
    // if (asset.asset_uri && (asset.asset_uri.startsWith('http://') || asset.asset_uri.startsWith('https://'))) {
    //   return asset.asset_uri;
    // }
    // Priority 3: thumbnail as fallback
    if (asset.thumbnail && isWebAccessibleUrl(asset.thumbnail)) {
      return asset.thumbnail;
    }
    return null;
  };

  // Get URL for downloading the original file (could be HEIC, video, etc.)
  const getOriginalUrl = (asset: AlbumAsset): string | null => {
    // path contains the original file URL (HEIC, video, etc.)
    if (asset.path && isWebAccessibleUrl(asset.path)) return asset.path;
    // Fall back to asset_uri if path is not available
    if (isWebAccessibleUrl(asset.asset_uri)) return asset.asset_uri;
    return null;
  };

  // Get thumbnail URL for grid display
  const getThumbnailUrl = (asset: AlbumAsset): string | null => {
    // Prefer base64 thumbnail first (fastest loading)
    if (asset.thumbnail?.startsWith('data:')) return asset.thumbnail;
    // Then try thumbnail URL
    if (isWebAccessibleUrl(asset.thumbnail)) return asset.thumbnail!;
    // Fall back to display URL
    return getDisplayUrl(asset);
  };

  // Get keyphoto URL for an album
  const getKeyphotoUrl = (album: Album): string | null => {
    // If keyphoto URL is provided and is accessible (including base64)
    if (album.keyphotUrl && isWebAccessibleUrl(album.keyphotUrl)) {
      return album.keyphotUrl;
    }
    // Fall back to first asset in album
    if (album.assets.length > 0) {
      return getThumbnailUrl(album.assets[0]);
    }
    return null;
  };

  const loadAlbumData = async (isRefresh = false) => {
    if (!inviteId) {
      setError('No invitation ID provided');
      setLoading(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    }

    try {
      // Call the edge function to securely fetch album data
      const supabaseUrl = getSupabaseUrl();
      const supabaseAnonKey = getSupabaseAnonKey();

      const response = await fetch(
        `${supabaseUrl}/functions/v1/public-album-view?inviteId=${inviteId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load album data');
      }

      const responseData = await response.json();
      console.log('Edge function response:', responseData);

      // Validate response has invite data
      if (!responseData.invite) {
        console.error('Missing invite data:', responseData);
        throw new Error('Invalid response from server');
      }

      // Map the response to match our expected format
      setAlbumData({
        invite: {
          id: responseData.invite.id,
          circle_id: responseData.invite.circle?.id,
          email: responseData.invite.email,
          role: responseData.invite.role,
          status: responseData.invite.status,
          date_invited: responseData.invite.date_invited,
          circle: responseData.invite.circle,
        },
        account: responseData.account || {
          requiresAccount: false,
          hasAccount: false,
          profile: null,
        },
        albums: responseData.albums || [],
        stats: responseData.stats || { total_albums: 0, total_photos: 0 },
      });
      setError(null);

      // Show registration if account is required but not created
      if (responseData.account?.requiresAccount && !responseData.account?.hasAccount) {
        setShowRegistration(true);
      } else {
        setShowRegistration(false);
      }
    } catch (err) {
      console.error('Error loading album data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load album');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    loadAlbumData(true);
  };

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
  };

  const handleLogoutConfirm = () => {
    setLoggingOut(true);
    supabase.auth.signOut().then(() => {
      window.location.href = '/login';
    }).catch((err) => {
      console.error('[AlbumViewer] Logout error:', err);
      window.location.href = '/login';
    });
  };

  const handleRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    // Validation
    if (!regForm.firstName.trim() || !regForm.lastName.trim()) {
      setRegError('First and last name are required');
      return;
    }
    if (!regForm.phone.trim()) {
      setRegError('Phone number is required');
      return;
    }

    setRegistering(true);

    try {
      const supabaseUrl = getSupabaseUrl();
      const supabaseAnonKey = getSupabaseAnonKey();

      const response = await fetch(
        `${supabaseUrl}/functions/v1/create-circle-account`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inviteId,
            firstName: regForm.firstName.trim(),
            lastName: regForm.lastName.trim(),
            phone: regForm.phone.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create account');
      }

      // Success - show verification sent message
      setRegistrationSent(true);
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setRegistering(false);
    }
  };

  useEffect(() => {
    loadAlbumData();
  }, [inviteId]);

  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Loading shared albums...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-2">Unable to Load Albums</h2>
          <p className="text-lg">{error}</p>
        </div>
      </div>
    );
  }

  if (!albumData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white">
          <p className="text-lg">No album data found</p>
        </div>
      </div>
    );
  }

  const { invite, account, albums, stats } = albumData;
  const isReadOnly = invite.role === 'read_only';
  const canEdit = !isReadOnly && account?.hasAccount;

  // Registration Form View
  if (showRegistration && account?.requiresAccount && !account?.hasAccount) {
    // Show verification sent confirmation
    if (registrationSent) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
            <div className="text-6xl mb-4">📧</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Check Your Email</h1>
            <p className="text-gray-600 mb-4">
              We've sent a verification link to:
            </p>
            <p className="font-semibold text-blue-600 text-lg mb-6">{invite.email}</p>
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                Click the link in the email to complete your registration and access <strong>{invite.circle?.name}</strong>.
              </p>
            </div>
            <p className="text-sm text-gray-500">
              Didn't receive the email? Check your spam folder or{' '}
              <button
                onClick={() => setRegistrationSent(false)}
                className="text-blue-600 hover:underline"
              >
                try again
              </button>
            </p>
          </div>
        </div>
      );
    }

    // Show registration form
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">👋</div>
            <h1 className="text-2xl font-bold text-gray-800">Create Your Kizu Account</h1>
            <p className="text-gray-600 mt-2">
              You've been invited to <strong>{invite.circle?.name || 'a circle'}</strong> as an <strong className="capitalize">{invite.role?.replace('_', ' ')}</strong>
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Complete your profile to access editing features
            </p>
          </div>

          <form onSubmit={handleRegistration} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  type="text"
                  value={regForm.firstName}
                  onChange={(e) => setRegForm({ ...regForm, firstName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input
                  type="text"
                  value={regForm.lastName}
                  onChange={(e) => setRegForm({ ...regForm, lastName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
              <input
                type="tel"
                value={regForm.phone}
                onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+1 (555) 123-4567"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={invite.email}
                disabled
                className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
              />
              <p className="text-xs text-gray-500 mt-1">We'll send a verification link to this email</p>
            </div>

            {regError && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                {regError}
              </div>
            )}

            <button
              type="submit"
              disabled={registering}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {registering ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sending Verification...
                </>
              ) : (
                'Send Verification Email'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            By creating an account, you agree to Kizu's Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    );
  }

  // Albums Grid View (Main View)
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-10 relative">
          {/* Header Actions */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="bg-white/20 hover:bg-white/30 rounded-full p-3 transition-all disabled:opacity-50"
              title="Refresh"
            >
              <svg
                className={`w-5 h-5 text-white ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>

            {/* Sign Out Button */}
            <button
              onClick={handleLogoutClick}
              className="bg-white/20 hover:bg-white/30 rounded-full p-3 transition-all"
              title="Sign Out"
            >
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>

          <div className="text-center">
            <div className="text-5xl mb-3">👥</div>
            <h1 className="text-3xl font-bold mb-2">{invite.circle?.name || 'Shared Album'}</h1>
            {invite.circle?.description && (
              <p className="text-lg opacity-90 mb-4">{invite.circle.description}</p>
            )}

            <div className="bg-white/10 backdrop-blur-lg rounded-lg px-4 py-2 inline-block">
              <p className="text-sm font-medium">
                {isReadOnly ? '👁️ View-only access' : canEdit ? '✏️ Editor access' : '👤 Member access'}
              </p>
              {invite.email && (
                <p className="text-xs opacity-75 mt-1">{invite.email}</p>
              )}
            </div>
            {canEdit && account?.profile && (
              <p className="text-sm mt-2 opacity-75">
                Signed in as {account.profile.first_name} {account.profile.last_name}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Stats and Editor Controls */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex justify-center items-center gap-8 mb-8">
          <div className="bg-white rounded-lg px-6 py-4 shadow-md text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.total_albums}</div>
            <div className="text-gray-600 text-sm">Albums</div>
          </div>
          <div className="bg-white rounded-lg px-6 py-4 shadow-md text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.total_photos}</div>
            <div className="text-gray-600 text-sm">Photos</div>
          </div>

          {/* Add Album Button for Editors */}
          {canEdit && (
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-4 shadow-md flex items-center gap-2 transition-colors"
              onClick={() => alert('Add Album feature coming soon! This will allow you to create new albums.')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="font-medium">Add Album</span>
            </button>
          )}
        </div>

        {/* Albums Grid */}
        {albums.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4 opacity-50">📁</div>
            <h3 className="text-2xl font-bold text-gray-700 mb-2">No Albums Shared Yet</h3>
            <p className="text-gray-500">Albums will appear here when they're shared with this circle.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {albums.map(album => {
              const keyphotoUrl = getKeyphotoUrl(album);
              const photoCount = album.assets.filter(a => getThumbnailUrl(a) !== null).length;

              return (
                <div
                  key={album.id}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
                  onClick={() => navigate(`/album/${inviteId}/${album.id}`)}
                >
                  {/* Album Cover */}
                  <div className="aspect-square bg-gray-100 overflow-hidden flex items-center justify-center">
                    {keyphotoUrl ? (
                      <img
                        src={keyphotoUrl}
                        alt={album.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-blue-50 flex items-center justify-center">
                        <svg className="w-12 h-12 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Album Info */}
                  <div className="p-3">
                    <h3 className="font-semibold text-gray-800 truncate text-sm">{album.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {photoCount} photo{photoCount !== 1 ? 's' : ''} • {new Date(album.date_created).toLocaleDateString()}
                    </p>
                    {/* Owner info */}
                    {album.owner && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {album.owner.avatar_url ? (
                          <img
                            src={album.owner.avatar_url}
                            alt={album.owner.full_name || 'Owner'}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[8px] font-medium">
                            {(album.owner.full_name || album.owner.email || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <span className="text-[10px] text-gray-500 truncate">
                          {album.owner.full_name || album.owner.email || 'Unknown'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-12 border-t mt-12">
          <p className="text-gray-600">
            Powered by <span className="font-bold text-blue-600">Kizu</span>
          </p>
          <p className="text-gray-500 text-sm">Secure photo sharing for families and teams</p>
          <a
            href="https://kizu.app"
            className="inline-block mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Get Kizu for Free
          </a>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            {loggingOut ? (
              <>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Signing out...</p>
              </>
            ) : (
              <>
                <div className="text-5xl mb-4">👋</div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Sign Out?</h3>
                <p className="text-gray-600 mb-6">Are you sure you want to sign out?</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowLogoutModal(false)}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleLogoutConfirm}
                    className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Album Detail View - Standalone page for viewing a single album
export const AlbumDetailView: React.FC = () => {
  const { inviteId, albumId } = useParams<{ inviteId: string; albumId: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AlbumAsset | null>(null);

  // Account and invite state
  const [accountInfo, setAccountInfo] = useState<AccountStatus | null>(null);
  const [inviteInfo, setInviteInfo] = useState<CircleInvite | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check if user is logged in
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
    };
    checkAuth();
  }, []);

  // Memories state
  const [memoriesAssetId, setMemoriesAssetId] = useState<string | null>(null);
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({});
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [showInlineRegistration, setShowInlineRegistration] = useState(false);
  const [inlineRegEmail, setInlineRegEmail] = useState('');
  const [inlineRegName, setInlineRegName] = useState('');

  // Determine if user can add memories
  const isReadOnly = inviteInfo?.role === 'read_only';
  const canAddMemory = !isReadOnly && accountInfo?.hasAccount;

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      window.location.reload();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Debug logging
  console.log('[AlbumDetailView] Debug:', {
    inviteInfo,
    accountInfo,
    isReadOnly,
    canAddMemory,
    hasAccount: accountInfo?.hasAccount,
    role: inviteInfo?.role,
  });

  // Fetch album data
  useEffect(() => {
    const fetchAlbum = async () => {
      if (!inviteId) return;

      try {
        const supabaseUrl = getSupabaseUrl();
        const supabaseAnonKey = getSupabaseAnonKey();
        const response = await fetch(
          `${supabaseUrl}/functions/v1/public-album-view?inviteId=${inviteId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to load album');
        }

        const data = await response.json();

        // Debug: Log the API response
        console.log('[AlbumDetailView] API Response:', {
          account: data.account,
          invite: data.invite,
          albumsCount: data.albums?.length,
        });

        // Store account and invite info for permission checks
        if (data.account) {
          console.log('[AlbumDetailView] Setting accountInfo:', data.account);
          setAccountInfo(data.account);
        } else {
          console.log('[AlbumDetailView] No account data in response');
        }
        if (data.invite) {
          console.log('[AlbumDetailView] Setting inviteInfo, role:', data.invite.role);
          setInviteInfo({
            id: data.invite.id,
            circle_id: data.invite.circle?.id,
            email: data.invite.email,
            role: data.invite.role,
            status: data.invite.status,
            date_invited: data.invite.date_invited,
            circle: data.invite.circle,
          });
        } else {
          console.log('[AlbumDetailView] No invite data in response');
        }

        const foundAlbum = data.albums?.find((a: Album) => a.id === albumId);
        if (foundAlbum) {
          setAlbum(foundAlbum);
        } else {
          setError('Album not found');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load album');
      } finally {
        setLoading(false);
      }
    };

    fetchAlbum();
  }, [inviteId, albumId]);

  // Load memory counts
  useEffect(() => {
    const loadMemoryCounts = async () => {
      if (!album || album.assets.length === 0 || !inviteId) return;

      const assetIds = album.assets.map(a => a.asset_id);
      const counts: Record<string, number> = {};
      for (const assetId of assetIds) {
        counts[assetId] = await publicMemoriesApi.getMemoryCount(inviteId, assetId);
      }
      setMemoryCounts(counts);
    };
    loadMemoryCounts();
  }, [album, inviteId]);

  // Load memories when asset is selected (for inline display)
  useEffect(() => {
    const loadMemories = async () => {
      const assetIdToLoad = selectedAsset?.asset_id || memoriesAssetId;
      if (!assetIdToLoad || !inviteId) return;
      setLoadingMemories(true);
      const result = await publicMemoriesApi.getMemories(inviteId, assetIdToLoad);
      if (result.success && result.memories) {
        setMemories(result.memories);
      } else {
        setMemories([]);
      }
      setLoadingMemories(false);
    };
    loadMemories();
  }, [selectedAsset?.asset_id, memoriesAssetId, inviteId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  // URL helpers
  const getThumbnailUrl = (asset: AlbumAsset): string | null => {
    if (asset.thumbnail && (asset.thumbnail.startsWith('http') || asset.thumbnail.startsWith('data:'))) {
      return asset.thumbnail;
    }
    if (asset.web_uri && asset.web_uri.startsWith('http')) {
      return asset.web_uri;
    }
    if (asset.path && asset.path.startsWith('http')) {
      return asset.path;
    }
    return null;
  };

  const getDisplayUrl = (asset: AlbumAsset): string | null => {
    if (asset.web_uri && asset.web_uri.startsWith('http')) {
      return asset.web_uri;
    }
    if (asset.path && asset.path.startsWith('http')) {
      return asset.path;
    }
    return getThumbnailUrl(asset);
  };

  const getOriginalUrl = (asset: AlbumAsset): string | null => {
    if (asset.path && asset.path.startsWith('http')) {
      return asset.path;
    }
    return getDisplayUrl(asset);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading album...</p>
        </div>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-lg">{error || 'Album not found'}</p>
          <button
            onClick={() => navigate(`/album/${inviteId}`)}
            className="mt-4 text-blue-600 hover:underline"
          >
            ← Back to albums
          </button>
        </div>
      </div>
    );
  }

  const accessibleAssets = album.assets.filter(asset => getThumbnailUrl(asset) !== null);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* CSS for hover overlay */}
      <style>{`
        .photo-card .photo-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.75);
          opacity: 0;
          transition: opacity 0.2s;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 8px;
          pointer-events: none;
        }
        .photo-card:hover .photo-overlay {
          opacity: 1;
        }
      `}</style>

      {/* Header with back button */}
      <div className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/album/${inviteId}`)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-medium">Back</span>
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-800">{album.title}</h1>
              {album.description && (
                <p className="text-sm text-gray-500">{album.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-500">
                {accessibleAssets.length} photo{accessibleAssets.length !== 1 ? 's' : ''}
              </div>
              {/* Sign Out Button */}
              {isLoggedIn && (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  title="Sign Out"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Photos Grid */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {accessibleAssets.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4 opacity-50">📷</div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">No Photos Available</h3>
            <p className="text-gray-500">This album doesn't have any viewable photos yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {album.assets.map(asset => {
              const thumbnailUrl = getThumbnailUrl(asset);
              const displayUrl = getDisplayUrl(asset);
              if (!thumbnailUrl) return null;
              return (
                <div
                  key={asset.id}
                  className="aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform relative shadow-md photo-card"
                  onClick={() => displayUrl && setSelectedAsset(asset)}
                >
                  <img
                    src={thumbnailUrl}
                    alt="Photo"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {asset.asset_type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-black/50 rounded-full p-3">
                        <span className="text-white text-2xl">▶️</span>
                      </div>
                    </div>
                  )}
                  {/* Metadata overlay on hover */}
                  <div className="photo-overlay">
                    <div style={{ color: 'white', fontSize: '11px', lineHeight: '1.4' }}>
                      {(asset.created_at || asset.date_added) && (
                        <div>📅 {new Date(asset.created_at || asset.date_added).toLocaleDateString()}</div>
                      )}
                      {asset.location_name && (
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {asset.location_name}</div>
                      )}
                      {(asset.camera_make || asset.camera_model) && (
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📷 {[asset.camera_make, asset.camera_model].filter(Boolean).join(' ')}</div>
                      )}
                      {asset.aperture && (
                        <div>f/{asset.aperture}{asset.iso ? ` • ISO ${asset.iso}` : ''}</div>
                      )}
                      {!asset.location_name && !asset.camera_make && !asset.camera_model && !asset.created_at && !asset.date_added && !asset.aperture && (
                        <div style={{ color: '#ccc', fontStyle: 'italic' }}>No metadata</div>
                      )}
                    </div>
                  </div>
                  {/* Memory indicator */}
                  {memoryCounts[asset.asset_id] > 0 && (
                    <button
                      className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 rounded-full p-1.5 flex items-center gap-1 transition-colors z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMemoriesAssetId(asset.asset_id);
                      }}
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      {memoryCounts[asset.asset_id] > 1 && (
                        <span className="text-white text-xs font-medium pr-0.5">{memoryCounts[asset.asset_id]}</span>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Image/Video Modal with Inline Memories */}
      {selectedAsset && (
        <div
          className="fixed inset-0 bg-black/90 z-50 overflow-y-auto"
          onClick={() => setSelectedAsset(null)}
        >
          <div className="min-h-full flex flex-col items-center justify-start p-4 pt-12">
            <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
              {/* Close button */}
              <button
                onClick={() => setSelectedAsset(null)}
                className="absolute -top-10 right-0 text-white text-3xl hover:text-gray-300 z-10"
              >
                ×
              </button>

              {/* Display image or video */}
              <div className="flex justify-center">
                {selectedAsset.asset_type === 'video' ? (
                  <video
                    src={getDisplayUrl(selectedAsset) || getOriginalUrl(selectedAsset) || ''}
                    controls
                    autoPlay
                    className="max-w-full max-h-[50vh] rounded-lg bg-black"
                  >
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <img
                    src={getDisplayUrl(selectedAsset) || ''}
                    alt="Full size"
                    className="max-w-full max-h-[50vh] rounded-lg object-contain"
                  />
                )}
              </div>

              {/* Reactions bar */}
              <div className="mt-4 flex justify-center">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                  <ReactionBar
                    targetId={selectedAsset.asset_id}
                    targetType="asset"
                    className="justify-center"
                  />
                </div>
              </div>

              {/* Tags section */}
              {selectedAsset.tags && selectedAsset.tags.length > 0 && (
                <div className="mt-4 flex justify-center">
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      {selectedAsset.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            tag.type === 'person'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {tag.type === 'person' ? (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                          )}
                          {tag.value}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Inline Memories Section */}
              <div className="mt-4 bg-white rounded-xl max-h-[35vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                  <h3 className="font-semibold text-gray-800">
                    Memories {memories.length > 0 && `(${memories.length})`}
                  </h3>
                  {/* Debug indicator */}
                  <span className="text-xs text-gray-400">
                    {canAddMemory ? '✓ Can add' : `✗ Cannot add (role: ${inviteInfo?.role}, hasAccount: ${accountInfo?.hasAccount})`}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {/* Memory Input Bar - show at top for users who can add */}
                  {console.log('[AlbumDetailView] Rendering memories section, canAddMemory:', canAddMemory)}
                  {canAddMemory && (
                    <div className="mb-4">
                      <MemoryInputBar
                        assetId={selectedAsset.asset_id}
                        onMemoryAdded={async () => {
                          // Reload memories after adding
                          if (!inviteId) return;
                          setLoadingMemories(true);
                          const result = await publicMemoriesApi.getMemories(inviteId, selectedAsset.asset_id);
                          if (result.success && result.memories) {
                            setMemories(result.memories);
                            // Update count
                            setMemoryCounts(prev => ({
                              ...prev,
                              [selectedAsset.asset_id]: result.memories!.length
                            }));
                          }
                          setLoadingMemories(false);
                        }}
                        placeholder="Share a memory..."
                        variant="inline"
                      />
                    </div>
                  )}

                  {loadingMemories ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : memories.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      <div className="text-3xl mb-2">💭</div>
                      <p className="text-sm">No memories yet</p>
                      {!canAddMemory && (
                        <p className="text-xs text-gray-400 mt-1">Sign in to add memories</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {memories.map((memory) => (
                        <div key={memory.id} className="flex gap-3">
                          {memory.user.avatar_url ? (
                            <img
                              src={memory.user.avatar_url}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-blue-600 text-sm font-medium">
                                {(memory.user.name || memory.user.email || '?').charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-medium text-sm text-gray-900">
                                {memory.user.name || memory.user.email}
                              </span>
                              <span className="text-xs text-gray-500">{formatDate(memory.created_at)}</span>
                            </div>
                            {memory.memory_type === 'text' ? (
                              <p className="text-sm text-gray-700">{memory.content_text}</p>
                            ) : memory.memory_type === 'image' ? (
                              <img
                                src={memory.content_url || ''}
                                alt="Memory"
                                className="max-w-xs rounded-lg cursor-pointer hover:opacity-90"
                                onClick={() => window.open(memory.content_url || '', '_blank')}
                              />
                            ) : memory.memory_type === 'video' ? (
                              <video src={memory.content_url || ''} controls className="max-w-xs rounded-lg" />
                            ) : memory.memory_type === 'audio' ? (
                              <audio src={memory.content_url || ''} controls className="w-full max-w-xs" />
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons - hide download in read-only mode */}
              {!isReadOnly && getOriginalUrl(selectedAsset) && (
                <div className="mt-4 flex justify-center gap-3">
                  <a
                    href={getOriginalUrl(selectedAsset)!}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-6 rounded-lg flex items-center gap-2 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Original
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Memories Panel */}
      {memoriesAssetId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setMemoriesAssetId(null); setShowInlineRegistration(false); }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-xl font-bold text-gray-800">Memories</h2>
              <button
                onClick={() => { setMemoriesAssetId(null); setShowInlineRegistration(false); }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingMemories ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : memories.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-5xl mb-4">💭</div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">No memories yet</h3>
                  <p className="text-gray-500 text-sm">Be the first to add a memory to this photo!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {memories.map((memory) => (
                    <div key={memory.id} className="bg-gray-50 rounded-lg p-4">
                      {/* Memory header */}
                      <div className="flex items-center gap-3 mb-2">
                        {memory.user.avatar_url ? (
                          <img src={memory.user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium">
                            {(memory.user.name || memory.user.email || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="font-medium text-gray-800">{memory.user.name || memory.user.email || 'Unknown'}</div>
                          <div className="text-xs text-gray-500">{formatDate(memory.created_at)}</div>
                        </div>
                      </div>

                      {/* Memory content */}
                      {memory.memory_type === 'text' && memory.content_text && (
                        <p className="text-gray-700 whitespace-pre-wrap">{memory.content_text}</p>
                      )}
                      {memory.memory_type === 'image' && memory.content_url && (
                        <img src={memory.content_url} alt="" className="max-w-full rounded-lg mt-2" />
                      )}
                      {memory.memory_type === 'video' && memory.content_url && (
                        <video src={memory.content_url} controls className="max-w-full rounded-lg mt-2" />
                      )}
                      {memory.memory_type === 'audio' && memory.content_url && (
                        <audio src={memory.content_url} controls className="w-full mt-2" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
