import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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
  keyphoto_thumbnail?: string;
  photo_count: number;
  circle_id: string;
  circle_name: string;
  album_assets?: AlbumAsset[];
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
}

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCircle, setSelectedCircle] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AlbumAsset | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      // Check if user is logged in
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        navigate('/login');
        return;
      }

      const userId = session.user.id;

      // Load user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Profile error:', profileError);
      } else {
        setUser(profileData);
      }

      // If no profile, use session user data
      if (!profileData && session.user) {
        setUser({
          id: session.user.id,
          full_name: session.user.user_metadata?.full_name || 'User',
          email: session.user.email || '',
        });
      }

      // Load circles the user belongs to
      const { data: circleUsersData, error: circleUsersError } = await supabase
        .from('circle_users')
        .select(`
          id,
          role,
          circle_id,
          circles (
            id,
            name,
            description
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'accepted');

      if (circleUsersError) {
        console.error('Circle users error:', circleUsersError);
      }

      // Process circles and get album counts
      const processedCircles: Circle[] = [];
      for (const cu of circleUsersData || []) {
        const circle = cu.circles as any;
        if (circle) {
          // Get album count for this circle
          const { count: albumCount } = await supabase
            .from('album_shares')
            .select('*', { count: 'exact', head: true })
            .eq('circle_id', circle.id)
            .eq('is_active', true);

          processedCircles.push({
            id: circle.id,
            name: circle.name,
            description: circle.description,
            role: cu.role,
            album_count: albumCount || 0,
            photo_count: 0, // We'll calculate this if needed
          });
        }
      }

      setCircles(processedCircles);

      // Load albums shared with user's circles
      if (processedCircles.length > 0) {
        const circleIds = processedCircles.map((c) => c.id);

        const { data: albumSharesData, error: albumSharesError } = await supabase
          .from('album_shares')
          .select(`
            album_id,
            circle_id,
            albums (
              id,
              title,
              description,
              keyphoto,
              album_assets (
                id,
                asset_id,
                asset_uri,
                asset_type,
                thumbnail_uri,
                web_uri
              )
            ),
            circles (
              name
            )
          `)
          .in('circle_id', circleIds)
          .eq('is_active', true);

        if (albumSharesError) {
          console.error('Album shares error:', albumSharesError);
        }

        const processedAlbums: Album[] = [];
        for (const share of albumSharesData || []) {
          const album = share.albums as any;
          const circle = share.circles as any;
          if (album) {
            processedAlbums.push({
              id: album.id,
              title: album.title,
              description: album.description,
              keyphoto: album.keyphoto,
              photo_count: album.album_assets?.length || 0,
              circle_id: share.circle_id,
              circle_name: circle?.name || 'Unknown Circle',
              album_assets: album.album_assets || [],
            });
          }
        }

        setAlbums(processedAlbums);
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
    await supabase.auth.signOut();
    navigate('/login');
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
            <h1 className="text-xl font-bold text-gray-800">Knox</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium text-gray-800">
                {user?.full_name}
              </p>
              <p className="text-sm text-gray-500">{user?.email}</p>
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
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-800">
            Welcome back, {user?.full_name?.split(' ')[0]}! 👋
          </h2>
          <p className="text-gray-600 mt-1">
            Here are your circles and shared albums.
          </p>
        </div>

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
      </main>

      {/* Footer */}
      <footer className="mt-auto py-8 text-center border-t bg-white">
        <p className="text-gray-600">
          Powered by <span className="font-bold text-blue-600">Knox</span>
        </p>
        <p className="text-gray-500 text-sm">Secure photo sharing for families and teams</p>
      </footer>
    </div>
  );
};
