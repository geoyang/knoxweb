import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import type { Memory } from '../services/memoriesApi';

// Public memories API helper (no auth required, uses invite ID for access)
const publicMemoriesApi = {
  async getMemories(inviteId: string, assetId: string): Promise<{ success: boolean; memories?: Memory[]; error?: string }> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
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
  const [albumData, setAlbumData] = useState<AlbumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AlbumAsset | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

  // Memories state
  const [memoriesAssetId, setMemoriesAssetId] = useState<string | null>(null);
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({});
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);

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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

  // Load memory counts when album is selected
  useEffect(() => {
    const loadMemoryCounts = async () => {
      if (!selectedAlbum || selectedAlbum.assets.length === 0 || !inviteId) return;

      const assetIds = selectedAlbum.assets.map(a => a.asset_id);
      const counts = await publicMemoriesApi.getMemoryCounts(inviteId, assetIds);
      setMemoryCounts(counts);
    };

    loadMemoryCounts();
  }, [selectedAlbum, inviteId]);

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
            <h1 className="text-2xl font-bold text-gray-800">Create Your Knox Account</h1>
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
            By creating an account, you agree to Knox's Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    );
  }

  // Album Detail View
  if (selectedAlbum) {
    const accessibleAssets = selectedAlbum.assets.filter(asset => getThumbnailUrl(asset) !== null);

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Album Header */}
        <div className="bg-white shadow-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedAlbum(null)}
                className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
              >
                <span className="text-xl">←</span>
                <span>Back to Albums</span>
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-800">{selectedAlbum.title}</h1>
                {selectedAlbum.description && (
                  <p className="text-sm text-gray-500">{selectedAlbum.description}</p>
                )}
              </div>
              <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                {accessibleAssets.length} photos
              </span>

              {/* Editor Controls */}
              {canEdit && (
                <button
                  className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2 flex items-center gap-2 transition-colors text-sm font-medium"
                  onClick={() => alert('Add Photo feature coming soon! This will allow you to upload photos to this album.')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Photos
                </button>
              )}

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-gray-100 hover:bg-gray-200 rounded-full p-2 transition-all disabled:opacity-50"
                title="Refresh"
              >
                <svg
                  className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`}
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
              {selectedAlbum.assets.map(asset => {
                const thumbnailUrl = getThumbnailUrl(asset);
                const displayUrl = getDisplayUrl(asset);
                if (!thumbnailUrl) return null;
                return (
                  <div
                    key={asset.id}
                    className="aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform relative shadow-md"
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
                    {/* Memory indicator */}
                    {memoryCounts[asset.asset_id] > 0 && (
                      <button
                        className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 rounded-full p-1.5 flex items-center gap-1 transition-colors"
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

        {/* Image Modal */}
        {selectedAsset && (
          <div
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedAsset(null)}
          >
            <div className="relative max-w-5xl max-h-full" onClick={(e) => e.stopPropagation()}>
              {/* Close button */}
              <button
                onClick={() => setSelectedAsset(null)}
                className="absolute -top-12 right-0 text-white text-3xl hover:text-gray-300"
              >
                ×
              </button>

              {/* Display image or video */}
              {selectedAsset.asset_type === 'video' ? (
                <video
                  src={getDisplayUrl(selectedAsset) || getOriginalUrl(selectedAsset) || ''}
                  controls
                  autoPlay
                  className="max-w-full max-h-[80vh] rounded-lg mt-[10px] bg-black"
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <img
                  src={getDisplayUrl(selectedAsset) || ''}
                  alt="Full size"
                  className="max-w-full max-h-[80vh] rounded-lg mt-[10px]"
                />
              )}

              {/* Action buttons */}
              <div className="mt-4 flex justify-center gap-3">
                {/* Memories button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMemoriesAssetId(selectedAsset.asset_id);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Memories
                  {memoryCounts[selectedAsset.asset_id] > 0 && (
                    <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
                      {memoryCounts[selectedAsset.asset_id]}
                    </span>
                  )}
                </button>

                {/* Download Original button */}
                {getOriginalUrl(selectedAsset) && (
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
                )}
              </div>
            </div>
          </div>
        )}

        {/* Public Memories Panel */}
        {memoriesAssetId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setMemoriesAssetId(null); setShowInlineRegistration(false); }}>
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-xl font-bold text-gray-800">Memories</h2>
                <div className="flex items-center gap-2">
                  {/* Add Memory Button */}
                  <button
                    onClick={() => {
                      if (canEdit) {
                        // User can add memories - TODO: implement add memory form
                        alert('Add Memory feature coming soon!');
                      } else {
                        // Show registration prompt
                        setShowInlineRegistration(true);
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors"
                  >
                    <span>+</span> Add Memory
                  </button>
                  <button onClick={() => { setMemoriesAssetId(null); setShowInlineRegistration(false); }} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
              </div>

              {/* Inline Registration Prompt */}
              {showInlineRegistration && (
                <div className="p-4 bg-blue-50 border-b border-blue-200">
                  <div className="text-center">
                    <div className="text-3xl mb-2">✍️</div>
                    <h3 className="font-semibold text-gray-800 mb-1">Create an Account to Add Memories</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      {isReadOnly
                        ? 'You have view-only access. Create a full account to share your own memories.'
                        : 'Complete your profile to start sharing memories with this circle.'}
                    </p>
                    <div className="flex justify-center gap-3">
                      <button
                        onClick={() => setShowInlineRegistration(false)}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          setShowInlineRegistration(false);
                          setMemoriesAssetId(null);
                          setShowRegistration(true);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Create Account
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {loadingMemories ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : memories.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-4xl mb-2">💭</div>
                    <p>No memories yet</p>
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
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
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

                        {/* Replies */}
                        {memory.replies && memory.replies.length > 0 && (
                          <div className="mt-3 pl-4 border-l-2 border-gray-200 space-y-3">
                            {memory.replies.map((reply) => (
                              <div key={reply.id} className="bg-white rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  {reply.user.avatar_url ? (
                                    <img src={reply.user.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-medium">
                                      {(reply.user.name || reply.user.email || '?')[0].toUpperCase()}
                                    </div>
                                  )}
                                  <span className="font-medium text-sm text-gray-700">{reply.user.name || reply.user.email}</span>
                                  <span className="text-xs text-gray-500">{formatDate(reply.created_at)}</span>
                                </div>
                                {reply.memory_type === 'text' && reply.content_text && (
                                  <p className="text-gray-600 text-sm">{reply.content_text}</p>
                                )}
                                {reply.memory_type === 'image' && reply.content_url && (
                                  <img src={reply.content_url} alt="" className="max-w-full rounded-lg mt-1" />
                                )}
                                {reply.memory_type === 'video' && reply.content_url && (
                                  <video src={reply.content_url} controls className="max-w-full rounded-lg mt-1" />
                                )}
                              </div>
                            ))}
                          </div>
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
  }

  // Albums Grid View (Main View)
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-10 relative">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 rounded-full p-3 transition-all disabled:opacity-50"
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {albums.map(album => {
              const keyphotoUrl = getKeyphotoUrl(album);
              const photoCount = album.assets.filter(a => getThumbnailUrl(a) !== null).length;

              return (
                <div
                  key={album.id}
                  className="cursor-pointer group"
                  onClick={() => setSelectedAlbum(album)}
                >
                  {/* Album Cover */}
                  <div className="relative aspect-square bg-gray-100 rounded-2xl overflow-hidden shadow-lg group-hover:shadow-xl transition-all group-hover:scale-[1.02]">
                    {keyphotoUrl ? (
                      <>
                        {/* Folder icon background */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-8xl text-yellow-400 drop-shadow-lg">📁</div>
                        </div>
                        {/* Photo inside folder */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-[55%] h-[55%] rounded-lg overflow-hidden border-2 border-white/80 shadow-md mt-2">
                            <img
                              src={keyphotoUrl}
                              alt={album.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-8xl text-yellow-400 drop-shadow-lg">📁</div>
                      </div>
                    )}
                  </div>

                  {/* Album Info */}
                  <div className="mt-3 text-center">
                    <h3 className="font-semibold text-gray-800 truncate">{album.title}</h3>
                    <p className="text-sm text-gray-500">{photoCount} photos</p>
                    {/* Owner info */}
                    {album.owner && (
                      <div className="flex items-center justify-center gap-2 mt-2">
                        {album.owner.avatar_url ? (
                          <img
                            src={album.owner.avatar_url}
                            alt={album.owner.full_name || 'Owner'}
                            className="w-5 h-5 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
                            {(album.owner.full_name || album.owner.email || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <span className="text-xs text-gray-500 truncate max-w-[100px]">
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
            Powered by <span className="font-bold text-blue-600">Knox</span>
          </p>
          <p className="text-gray-500 text-sm">Secure photo sharing for families and teams</p>
          <a
            href="https://knox.eoyang.com"
            className="inline-block mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Get Knox for Free
          </a>
        </div>
      </div>
    </div>
  );
};
