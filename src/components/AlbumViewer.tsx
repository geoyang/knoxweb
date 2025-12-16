import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface CircleInvite {
  id: string;
  circle_id: string;
  email: string;
  role: string;
  status: string;
  date_invited: string;
  circles: {
    id: string;
    name: string;
    description: string;
    owner_id: string;
  };
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
}

interface AlbumAsset {
  id: string;
  album_id: string;
  asset_id: string;
  asset_uri: string;
  asset_type: 'image' | 'video';
  display_order: number;
  date_added: string;
}

interface AlbumData {
  invite: CircleInvite;
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
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const isWebAccessibleUrl = (url: string | null): boolean => {
    if (!url) return false;
    // Check if URL is web accessible (http/https) and not a local scheme like ph://
    return url.startsWith('http://') || url.startsWith('https://');
  };

  useEffect(() => {
    const loadAlbumData = async () => {
      if (!inviteId) {
        setError('No invitation ID provided');
        setLoading(false);
        return;
      }

      try {
        // Get invite details with circle and owner information
        const { data: inviteData, error: inviteError } = await supabase
          .from('circle_users')
          .select(`
            id,
            circle_id,
            email,
            role,
            status,
            date_invited,
            circles!inner(
              id,
              name,
              description,
              owner_id
            )
          `)
          .eq('id', inviteId)
          .single();

        if (inviteError || !inviteData) {
          throw new Error('Invalid or expired invitation link');
        }

        // Get all albums shared with this circle
        const { data: albumShares, error: sharesError } = await supabase
          .from('album_shares')
          .select(`
            album_id,
            role,
            date_shared,
            albums!inner(
              id,
              title,
              description,
              keyphoto,
              date_created
            )
          `)
          .eq('circle_id', inviteData.circle_id)
          .eq('is_active', true);

        let allAssets: AlbumAsset[] = [];
        if (albumShares && albumShares.length > 0) {
          const albumIds = albumShares.map(share => share.album_id);
          
          const { data: assetsData, error: assetsError } = await supabase
            .from('album_assets')
            .select(`
              id,
              album_id,
              asset_id,
              asset_uri,
              asset_type,
              display_order,
              date_added
            `)
            .in('album_id', albumIds)
            .order('album_id')
            .order('display_order');

          if (!assetsError) {
            allAssets = assetsData || [];
          }
        }

        // Prepare data for rendering
        const albums: Album[] = albumShares?.map(share => ({
          ...share.albums,
          share_role: share.role,
          date_shared: share.date_shared,
          assets: allAssets.filter(asset => asset.album_id === share.album_id)
        })) || [];

        // Count only web-accessible assets for stats
        const webAccessibleAssets = allAssets.filter(asset => isWebAccessibleUrl(asset.asset_uri));
        
        const stats = {
          total_albums: albums.length,
          total_photos: webAccessibleAssets.length
        };

        setAlbumData({
          invite: inviteData,
          albums,
          stats
        });
      } catch (err) {
        console.error('Error loading album data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load album');
      } finally {
        setLoading(false);
      }
    };

    loadAlbumData();
  }, [inviteId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Loading shared album...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-2">Unable to Load Album</h2>
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

  const { invite, albums, stats } = albumData;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="text-center">
            <div className="text-6xl mb-4">👥</div>
            <h1 className="text-4xl font-bold mb-2">{invite.circles.name}</h1>
            {invite.circles.description && (
              <p className="text-xl opacity-90 mb-6">{invite.circles.description}</p>
            )}
            
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-4 mb-6 inline-block">
              <p className="text-sm opacity-90 mb-1">Shared by Knox User</p>
              <p className="font-semibold">👁️ View-only access</p>
            </div>

            <a
              href={`https://quqlovduekdasldqadge.supabase.co/signup?invite=${invite.id}`}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg inline-flex items-center gap-2 transition-colors"
            >
              ➕ Join Knox for Full Access
            </a>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-center gap-12 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-lg text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">{stats.total_albums}</div>
            <div className="text-gray-600">Albums</div>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-lg text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">{stats.total_photos}</div>
            <div className="text-gray-600">Photos</div>
          </div>
        </div>

        {/* Albums */}
        {albums.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4 opacity-50">📷</div>
            <h3 className="text-2xl font-bold text-gray-700 mb-2">No Photos Shared Yet</h3>
            <p className="text-gray-500">Photos will appear here when they're added to shared albums.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {albums.map(album => (
              <div key={album.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b flex items-center gap-3">
                  <span className="text-blue-600 text-xl">📁</span>
                  <h3 className="text-xl font-bold text-gray-800 flex-1">{album.title}</h3>
                  <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                    {album.assets.filter(asset => isWebAccessibleUrl(asset.asset_uri)).length} photos
                  </span>
                </div>
                
                {album.assets.length > 0 && (
                  <div className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {album.assets.map(asset => (
                        <div
                          key={asset.id}
                          className="aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform relative"
                          onClick={() => isWebAccessibleUrl(asset.asset_uri) && setSelectedImage(asset.asset_uri)}
                        >
                          {isWebAccessibleUrl(asset.asset_uri) ? (
                            <img
                              src={asset.asset_uri}
                              alt="Photo"
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-gray-200">
                              <div className="text-3xl mb-2">{asset.asset_type === 'video' ? '🎥' : '📸'}</div>
                              <div className="text-xs text-center px-2">
                                Media not available
                              </div>
                            </div>
                          )}
                          {asset.asset_type === 'video' && isWebAccessibleUrl(asset.asset_uri) && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="bg-black/50 rounded-full p-2">
                                <span className="text-white text-xl">▶️</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-12 border-t mt-12">
          <p className="text-gray-600">
            Powered by <span className="font-bold text-blue-600">Knox</span>
          </p>
          <p className="text-gray-500">Secure photo sharing for families and teams</p>
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && isWebAccessibleUrl(selectedImage) && (
        <div 
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 right-0 text-white text-2xl hover:text-gray-300"
            >
              ×
            </button>
            <img
              src={selectedImage}
              alt="Full size"
              className="max-w-full max-h-full rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
};