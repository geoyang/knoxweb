import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';
import { adminApi } from '../services/adminApi';
import { useAuth } from '../context/AuthContext';
import { MediaGallery } from './MediaGallery';
import { MomentsGallery } from './MomentsGallery';
import { getDisplayIdentifier } from '../utils/phoneDisplayUtils';

type TabType = 'home' | 'media' | 'moments';

interface Circle {
  id: string;
  name: string;
  description?: string;
  role: string;
  album_count: number;
  photo_count: number;
}

interface AlbumAsset {
  id: string;
  asset_id: string;
  asset_uri: string;
  asset_type: string;
  thumbnail_uri?: string;
  web_uri?: string;
}

interface Album {
  id: string;
  title: string;
  description?: string;
  keyphoto?: string;
  keyphoto_thumbnail?: string | null;
  photo_count: number;
  circle_id: string;
  circle_name: string;
  album_assets?: AlbumAsset[];
  isOwner?: boolean;
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { signOut, session, user: authUser, loading: authLoading } = useAuth();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCircle, setSelectedCircle] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AlbumAsset | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    planName: string;
    expiry: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('home');

  // Get member duration
  const getMemberDuration = (): string => {
    if (!userCreatedAt) return '';
    const created = new Date(userCreatedAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffYears > 0) return `${diffYears} year${diffYears > 1 ? 's' : ''}`;
    if (diffMonths > 0) return `${diffMonths} month${diffMonths > 1 ? 's' : ''}`;
    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
    return 'today';
  };

  useEffect(() => {
    // Wait for auth to finish loading before loading user data
    if (!authLoading) {
      if (!session) {
        navigate('/login');
        return;
      }
      loadUserData();
    }
  }, [authLoading, session]);

  const loadUserData = async () => {
    if (!session) {
      navigate('/login');
      return;
    }

    try {
      const userId = session.user.id;
      setUserCreatedAt(session.user.created_at);

      // Load subscription info
      try {
        const subResult = await adminApi.getSubscriptionStatus();
        if (subResult.success && subResult.data) {
          const { subscription, plan } = subResult.data;
          let expiry = '';

          if (subscription.status === 'trialing' && subscription.trial_end) {
            const daysLeft = Math.ceil((new Date(subscription.trial_end).getTime() - Date.now()) / 86400000);
            expiry = `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`;
          } else if (subscription.status === 'active' && subscription.current_period_end) {
            const endDate = new Date(subscription.current_period_end);
            expiry = `Renews ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
          } else if (subscription.status === 'cancelled' && subscription.current_period_end) {
            const daysLeft = Math.ceil((new Date(subscription.current_period_end).getTime() - Date.now()) / 86400000);
            expiry = `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
          }

          setSubscriptionInfo({
            planName: subscription.status === 'free' ? 'Guest' :
                      subscription.status === 'trialing' ? `${plan.display_name} Trial` : plan.display_name,
            expiry
          });
        }
      } catch (subError) {
        console.error('Error fetching subscription:', subError);
      }

      // Load user profile via API
      try {
        const profileResponse = await fetch(
          `${getSupabaseUrl()}/functions/v1/profiles-api`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'apikey': getSupabaseAnonKey(),
            },
          }
        );
        const profileData = await profileResponse.json();
        if (profileResponse.ok && profileData.success) {
          setUser(profileData.profile);
        } else {
          // Fall back to session user data
          setUser({
            id: session.user.id,
            full_name: session.user.user_metadata?.full_name || 'User',
            email: session.user.email || '',
          });
        }
      } catch (profileError) {
        console.error('Profile error:', profileError);
        setUser({
          id: session.user.id,
          full_name: session.user.user_metadata?.full_name || 'User',
          email: session.user.email || '',
        });
      }

      // Load circles via admin API
      const circlesResult = await adminApi.getCircles();
      const processedCircles: Circle[] = [];

      if (circlesResult.success && circlesResult.data?.circles) {
        for (const circle of circlesResult.data.circles) {
          processedCircles.push({
            id: circle.id,
            name: circle.name,
            description: circle.description,
            role: circle.user_role || 'read_only',
            album_count: 0, // Will be calculated from albums below
            photo_count: 0,
          });
        }
      }

      setCircles(processedCircles);

      // Load albums using the admin API (handles RLS properly via service role)
      // Use lite mode to skip loading full album_assets - we only need counts
      const albumsResult = await adminApi.getAlbums({ lite: true });

      if (albumsResult.success && albumsResult.data) {
        const processedAlbums: Album[] = [];

        for (const album of albumsResult.data.albums || []) {
          // Get circle info from shared_via for shared albums, or use empty for owned albums
          let circleId = '';
          let circleName = album.isOwner ? 'Owned' : 'Shared';

          if (album.shared_via && album.shared_via.length > 0) {
            circleId = album.shared_via[0].circle_id;
            circleName = album.shared_via[0].circle_name;
          } else if (album.album_shares && album.album_shares.length > 0) {
            // For owned albums with shares
            circleId = album.album_shares[0].circle_id;
            circleName = album.album_shares[0].circles?.name || 'Shared';
          }

          processedAlbums.push({
            id: album.id,
            title: album.title,
            description: album.description,
            keyphoto: album.keyphoto,
            keyphoto_thumbnail: album.keyphoto_thumbnail,
            photo_count: album.asset_count || album.album_assets?.length || 0,
            circle_id: circleId,
            circle_name: circleName,
            isOwner: album.isOwner,
            album_assets: (album.album_assets || []).map((asset: any) => ({
              id: asset.id,
              asset_id: asset.asset_id,
              asset_uri: asset.asset_uri,
              asset_type: asset.asset_type,
              thumbnail_uri: asset.thumbnail_uri,
              web_uri: asset.web_uri,
            })),
          });
        }

        setAlbums(processedAlbums);

        // Update circle album counts from processed albums
        const circleAlbumCounts = new Map<string, number>();
        for (const album of processedAlbums) {
          if (album.circle_id) {
            circleAlbumCounts.set(album.circle_id, (circleAlbumCounts.get(album.circle_id) || 0) + 1);
          }
        }

        setCircles(prev => prev.map(circle => ({
          ...circle,
          album_count: circleAlbumCounts.get(circle.id) || 0,
        })));
      } else {
        console.error('Failed to load albums:', albumsResult.error);
      }

      setError(null);
    } catch (err) {
      console.error('Error loading user data:', err);
      setError('Failed to load your data');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    console.log('🔒 LOGOUT: Sign Out button clicked');
    try {
      await signOut();
      console.log('🔒 LOGOUT: signOut() completed, navigating to /login');
      navigate('/login');
    } catch (err) {
      console.error('🔒 LOGOUT ERROR:', err);
      // Still navigate to login even if signOut fails
      navigate('/login');
    }
  };

  const handleImageError = (albumId: string) => {
    setFailedImages(prev => new Set([...prev, albumId]));
  };

  const isWebAccessibleUrl = (url: string | null): boolean => {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:');
  };

  const isHeicUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith('.heic') || lower.endsWith('.heif');
  };

  const hasKeyphoto = (url: string | null | undefined): boolean => {
    return !!(url && url.trim() !== '');
  };

  const getWebCompatibleImageUrl = (
    url: string | null,
    options?: { webUri?: string | null; thumbnailUri?: string | null }
  ): string | null => {
    if (options?.webUri && isWebAccessibleUrl(options.webUri) && !isHeicUrl(options.webUri)) {
      return options.webUri;
    }
    if (url && isWebAccessibleUrl(url) && !isHeicUrl(url)) {
      return url;
    }
    if (options?.thumbnailUri && options.thumbnailUri.startsWith('data:')) {
      return options.thumbnailUri;
    }
    if (options?.thumbnailUri && isWebAccessibleUrl(options.thumbnailUri) && !isHeicUrl(options.thumbnailUri)) {
      return options.thumbnailUri;
    }
    return null;
  };

  const getThumbnail = (
    url: string | null,
    options?: { webUri?: string | null; thumbnailUri?: string | null }
  ): string | null => {
    if (options?.thumbnailUri && options.thumbnailUri.startsWith('data:')) {
      return options.thumbnailUri;
    }
    if (options?.webUri && isWebAccessibleUrl(options.webUri) && !isHeicUrl(options.webUri)) {
      return options.webUri;
    }
    if (options?.thumbnailUri && isWebAccessibleUrl(options.thumbnailUri) && !isHeicUrl(options.thumbnailUri)) {
      return options.thumbnailUri;
    }
    if (url && isWebAccessibleUrl(url) && !isHeicUrl(url)) {
      return url;
    }
    return null;
  };

  const getDisplayImage = (album: Album): string | null => {
    // First try keyphoto_thumbnail - check if it's base64 data URI
    if (album.keyphoto_thumbnail?.startsWith('data:')) {
      return album.keyphoto_thumbnail;
    }
    // Then try keyphoto_thumbnail as URL
    if (album.keyphoto_thumbnail && isWebAccessibleUrl(album.keyphoto_thumbnail) && !isHeicUrl(album.keyphoto_thumbnail)) {
      return album.keyphoto_thumbnail;
    }
    // Try the keyphoto if it's web accessible and NOT a HEIC file
    if (hasKeyphoto(album.keyphoto) && isWebAccessibleUrl(album.keyphoto!) && !isHeicUrl(album.keyphoto)) {
      return album.keyphoto!;
    }
    // Fall back to first web-accessible album asset if available
    if (album.album_assets && album.album_assets.length > 0) {
      const displayableAssets = album.album_assets.filter(asset => {
        if (asset.thumbnail_uri?.startsWith('data:')) return true;
        if (asset.web_uri && isWebAccessibleUrl(asset.web_uri) && !isHeicUrl(asset.web_uri)) return true;
        if (asset.thumbnail_uri && isWebAccessibleUrl(asset.thumbnail_uri) && !isHeicUrl(asset.thumbnail_uri)) return true;
        if (asset.asset_uri && isWebAccessibleUrl(asset.asset_uri) && !isHeicUrl(asset.asset_uri)) return true;
        return false;
      });

      if (displayableAssets.length > 0) {
        const firstImage = displayableAssets.find(asset => asset.asset_type !== 'video');
        const asset = firstImage || displayableAssets[0];
        return getWebCompatibleImageUrl(asset.asset_uri, {
          webUri: asset.web_uri,
          thumbnailUri: asset.thumbnail_uri
        });
      }
    }
    return null;
  };

  const filteredAlbums = selectedCircle
    ? albums.filter((a) => a.circle_id === selectedCircle)
    : albums;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error Loading Dashboard</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📸</span>
            <h1 className="text-xl font-bold text-gray-800">Kizu</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium text-gray-800">
                {user?.full_name}
              </p>
              <p className="text-sm text-gray-500">{getDisplayIdentifier(user?.email)}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            Welcome back, {user?.full_name?.split(' ')[0]}!
          </h2>
          <p className="text-gray-600 mt-1">
            Member for {getMemberDuration()}
            {subscriptionInfo && (
              <>
                {' · '}
                <span className="font-medium">{subscriptionInfo.planName}</span>
                {subscriptionInfo.expiry && (
                  <span className="ml-1">({subscriptionInfo.expiry})</span>
                )}
              </>
            )}
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('home')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'home'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Home
              </span>
            </button>
            <button
              onClick={() => setActiveTab('media')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'media'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Media
              </span>
            </button>
            <button
              onClick={() => setActiveTab('moments')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'moments'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                Moments
              </span>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'media' ? (
          <MediaGallery />
        ) : activeTab === 'moments' ? (
          <MomentsGallery />
        ) : (
          <>
        {/* Circles Section */}
        <section className="mb-10">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Your Circles</h3>

          {circles.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <div className="text-5xl mb-4 opacity-50">👥</div>
              <h4 className="text-lg font-medium text-gray-700 mb-2">No Circles Yet</h4>
              <p className="text-gray-500">
                You'll see circles here when you're invited to join one.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {circles.map((circle) => (
                <div
                  key={circle.id}
                  onClick={() => setSelectedCircle(selectedCircle === circle.id ? null : circle.id)}
                  className={`bg-white rounded-xl shadow-sm p-6 cursor-pointer transition-all hover:shadow-md ${
                    selectedCircle === circle.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-800">{circle.name}</h4>
                      {circle.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          {circle.description}
                        </p>
                      )}
                    </div>
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full capitalize">
                      {circle.role.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-4 flex gap-4 text-sm text-gray-500">
                    <span>📁 {circle.album_count} albums</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Albums Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              {selectedCircle
                ? `Albums in ${circles.find((c) => c.id === selectedCircle)?.name}`
                : 'All Albums'}
            </h3>
            {selectedCircle && (
              <button
                onClick={() => setSelectedCircle(null)}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Show all albums
              </button>
            )}
          </div>

          {filteredAlbums.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <div className="text-5xl mb-4 opacity-50">📁</div>
              <h4 className="text-lg font-medium text-gray-700 mb-2">No Albums Yet</h4>
              <p className="text-gray-500">
                Albums shared with your circles will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {filteredAlbums.map((album) => {
                const displayImage = getDisplayImage(album);
                return (
                  <div
                    key={album.id}
                    className="cursor-pointer group"
                    onClick={() => setSelectedAlbum(album)}
                  >
                    {/* Album Cover */}
                    <div className="relative aspect-square bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl overflow-hidden shadow-lg group-hover:shadow-xl transition-all group-hover:scale-[1.02] flex items-center justify-center">
                      {/* Folder icon */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        className="w-32 h-32 md:w-40 md:h-40"
                      >
                        <path fill="#FFA000" d="M40 12H22l-4-4H8c-2.2 0-4 1.8-4 4v8h40v-4c0-2.2-1.8-4-4-4z"/>
                        <path fill="#FFCA28" d="M40 12H8c-2.2 0-4 1.8-4 4v20c0 2.2 1.8 4 4 4h32c2.2 0 4-1.8 4-4V16c0-2.2-1.8-4-4-4z"/>
                      </svg>
                      {/* Keyphoto overlay */}
                      {displayImage && !failedImages.has(album.id) ? (
                        <div className="absolute inset-0 flex items-center justify-center pt-4">
                          <img
                            src={displayImage}
                            alt={album.title}
                            className="w-16 h-16 md:w-20 md:h-20 object-cover rounded-md border-2 border-white shadow-md"
                            loading="lazy"
                            crossOrigin="anonymous"
                            onError={() => handleImageError(album.id)}
                          />
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center pt-4">
                          <div className="w-16 h-16 md:w-20 md:h-20 bg-amber-100 rounded-md border-2 border-white shadow-md flex items-center justify-center">
                            <span className="text-2xl">📷</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Album Info */}
                    <div className="mt-3">
                      <h4 className="font-semibold text-gray-800 truncate">{album.title}</h4>
                      <p className="text-sm text-gray-500">
                        {album.photo_count} photos • {album.circle_name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto py-8 text-center border-t bg-white">
        <p className="text-gray-600">
          Powered by <span className="font-bold text-blue-600">Kizu</span>
        </p>
        <p className="text-gray-500 text-sm">Secure photo sharing for families and teams</p>
      </footer>
    </div>
  );
};
