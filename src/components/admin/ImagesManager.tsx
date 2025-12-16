import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { StandaloneImageUploader } from './StandaloneImageUploader';

interface Asset {
  id: string;
  asset_id: string;
  asset_uri: string;
  asset_type: 'image' | 'video';
  date_added: string;
  album_id: string;
  display_order: number;
  album?: {
    id: string;
    title: string;
    user_id: string;
  };
}

interface ImageStats {
  total_images: number;
  total_videos: number;
  total_albums: number;
  recent_uploads: number;
}

export const ImagesManager: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stats, setStats] = useState<ImageStats>({
    total_images: 0,
    total_videos: 0,
    total_albums: 0,
    recent_uploads: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [sortBy, setSortBy] = useState<'date_added' | 'album' | 'type'>('date_added');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showImageUploader, setShowImageUploader] = useState(false);

  const { user } = useAuth();

  const isWebAccessibleUrl = (url: string | null): boolean => {
    if (!url) return false;
    // Check if URL is web accessible (http/https) and not a local scheme like ph://
    return url.startsWith('http://') || url.startsWith('https://');
  };

  useEffect(() => {
    if (user?.id) {
      loadAssets();
    } else {
      setLoading(false);
    }
  }, [user?.id, filterType, sortBy]);

  const handleImagesUploaded = async (count: number) => {
    console.log(`Uploaded ${count} new images`);
    setShowImageUploader(false);
    // Reload assets to show newly uploaded images
    await loadAssets();
  };

  const loadAssets = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get user's albums first
      const { data: albumsData, error: albumsError } = await supabase
        .from('albums')
        .select('id, title, user_id')
        .eq('user_id', user.id);

      if (albumsError) throw albumsError;

      if (!albumsData || albumsData.length === 0) {
        setAssets([]);
        setStats({
          total_images: 0,
          total_videos: 0,
          total_albums: 0,
          recent_uploads: 0,
        });
        setError(null); // Clear any previous errors
        return;
      }

      const albumIds = albumsData.map(album => album.id);

      // Build query for assets
      let query = supabase
        .from('album_assets')
        .select('*')
        .in('album_id', albumIds);

      // Apply filter
      if (filterType !== 'all') {
        query = query.eq('asset_type', filterType);
      }

      // Apply sort
      const ascending = false; // Most recent first by default
      switch (sortBy) {
        case 'date_added':
          query = query.order('date_added', { ascending });
          break;
        case 'album':
          query = query.order('album_id').order('display_order');
          break;
        case 'type':
          query = query.order('asset_type').order('date_added', { ascending });
          break;
      }

      const { data: assetsData, error: assetsError } = await query;

      if (assetsError) throw assetsError;

      // Merge album info with assets
      const enrichedAssets = (assetsData || []).map(asset => ({
        ...asset,
        album: albumsData.find(album => album.id === asset.album_id)
      }));

      console.log('Loaded assets:', enrichedAssets.map(asset => ({
        id: asset.id,
        asset_uri: asset.asset_uri,
        isWebAccessible: isWebAccessibleUrl(asset.asset_uri)
      })));

      setAssets(enrichedAssets);

      // Calculate stats
      const totalImages = enrichedAssets.filter(asset => asset.asset_type === 'image').length;
      const totalVideos = enrichedAssets.filter(asset => asset.asset_type === 'video').length;
      const totalAlbums = albumsData.length;
      
      // Recent uploads (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentUploads = enrichedAssets.filter(
        asset => new Date(asset.date_added) > sevenDaysAgo
      ).length;

      setStats({
        total_images: totalImages,
        total_videos: totalVideos,
        total_albums: totalAlbums,
        recent_uploads: recentUploads,
      });

      setError(null); // Clear any previous errors on successful load

    } catch (err) {
      console.error('Error loading assets:', err);
      setError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!confirm('Are you sure you want to remove this image from the album?')) return;

    try {
      const { error } = await supabase
        .from('album_assets')
        .delete()
        .eq('id', assetId);

      if (error) throw error;
      
      // Refresh the assets list
      await loadAssets();
      setSelectedAsset(null);
    } catch (err) {
      console.error('Error deleting asset:', err);
      alert(`Failed to delete image: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const filteredAssets = assets;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Images & Videos</h2>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowImageUploader(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
          >
            <span>📷</span>
            Upload Images
          </button>
          <div className="flex bg-gray-200 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'grid' ? 'bg-white text-gray-900 shadow' : 'text-gray-600'
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'list' ? 'bg-white text-gray-900 shadow' : 'text-gray-600'
              }`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-blue-600 mb-2">{stats.total_images}</div>
          <div className="text-gray-600">Images</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-purple-600 mb-2">{stats.total_videos}</div>
          <div className="text-gray-600">Videos</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-green-600 mb-2">{stats.total_albums}</div>
          <div className="text-gray-600">Albums</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-orange-600 mb-2">{stats.recent_uploads}</div>
          <div className="text-gray-600">Recent (7 days)</div>
        </div>
      </div>

      {/* Filters and Sort */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Media</option>
              <option value="image">Images Only</option>
              <option value="video">Videos Only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="date_added">Date Added</option>
              <option value="album">Album</option>
              <option value="type">Media Type</option>
            </select>
          </div>
        </div>
      </div>

      {/* Assets Display */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
          {filteredAssets.map(asset => (
            <div
              key={asset.id}
              className="aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform relative group"
              onClick={() => setSelectedAsset(asset)}
            >
              {(() => {
                const isAccessible = isWebAccessibleUrl(asset.asset_uri);
                console.log('Rendering asset:', asset.id, 'URL:', asset.asset_uri, 'isAccessible:', isAccessible);
                return isAccessible;
              })() ? (
                <img
                  src={asset.asset_uri}
                  alt={`Asset from ${asset.album?.title || 'Unknown Album'}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    console.error('Image failed to load:', {
                      src: asset.asset_uri,
                      error: e,
                      asset: asset
                    });
                  }}
                  onLoad={() => {
                    console.log('Image loaded successfully:', asset.asset_uri);
                  }}
                  style={{ border: '2px solid red' }}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                  <div className="text-3xl mb-2">{asset.asset_type === 'video' ? '🎥' : '📸'}</div>
                  <div className="text-xs text-center px-2">
                    {asset.asset_type === 'video' ? 'Video' : 'Image'} not available in web view
                  </div>
                </div>
              )}
              {asset.asset_type === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-black/50 rounded-full p-2">
                    <span className="text-white text-xl">▶️</span>
                  </div>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white text-xs truncate">{asset.album?.title}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Media
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Album
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date Added
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAssets.map(asset => (
                <tr key={asset.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-16 w-16 bg-gray-100 rounded-lg overflow-hidden">
                        {isWebAccessibleUrl(asset.asset_uri) ? (
                          <img
                            src={asset.asset_uri}
                            alt="Asset thumbnail"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              console.error('List view image failed to load:', {
                                src: asset.asset_uri,
                                error: e,
                                asset: asset
                              });
                            }}
                            onLoad={() => {
                              console.log('List view image loaded successfully:', asset.asset_uri);
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            {asset.asset_type === 'video' ? '🎥' : '📸'}
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm text-gray-500">
                          Asset #{asset.display_order}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {asset.album?.title || 'Unknown Album'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      asset.asset_type === 'image' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {asset.asset_type === 'image' ? '🖼️ Image' : '🎥 Video'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(asset.date_added).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setSelectedAsset(asset)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleDeleteAsset(asset.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredAssets.length === 0 && (
        <div className="text-center py-16">
          <div className="text-6xl mb-4 opacity-50">🖼️</div>
          <h3 className="text-2xl font-bold text-gray-700 mb-2">No Images Found</h3>
          <p className="text-gray-500 mb-6">
            {filterType === 'all' 
              ? 'Upload some images to your albums to see them here.'
              : `No ${filterType}s found with current filters.`
            }
          </p>
          {filterType === 'all' && (
            <button
              onClick={() => setShowImageUploader(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
            >
              <span>📷</span>
              Upload Your First Images
            </button>
          )}
        </div>
      )}

      {/* Asset Detail Modal */}
      {selectedAsset && (
        <div 
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedAsset(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={() => setSelectedAsset(null)}
              className="absolute -top-12 right-0 text-white text-2xl hover:text-gray-300"
            >
              ×
            </button>
            
            <div className="bg-white rounded-lg overflow-hidden">
              <div className="aspect-video bg-gray-100">
                {isWebAccessibleUrl(selectedAsset.asset_uri) ? (
                  selectedAsset.asset_type === 'image' ? (
                    <img
                      src={selectedAsset.asset_uri}
                      alt="Full size"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <video
                      src={selectedAsset.asset_uri}
                      controls
                      className="w-full h-full object-contain"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                    <div className="text-6xl mb-4">
                      {selectedAsset.asset_type === 'video' ? '🎥' : '📸'}
                    </div>
                    <div className="text-xl font-semibold mb-2">
                      {selectedAsset.asset_type === 'video' ? 'Video' : 'Image'} Not Available
                    </div>
                    <div className="text-sm text-center max-w-md">
                      This {selectedAsset.asset_type} is stored locally on the device and cannot be viewed in the web interface.
                      <br />
                      <span className="text-xs text-gray-400 mt-2 block">
                        URL: {selectedAsset.asset_uri}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  From album: {selectedAsset.album?.title || 'Unknown Album'}
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <div>
                    <span className="font-medium">Type:</span> {selectedAsset.asset_type}
                  </div>
                  <div>
                    <span className="font-medium">Date Added:</span> {new Date(selectedAsset.date_added).toLocaleString()}
                  </div>
                  <div>
                    <span className="font-medium">Position:</span> #{selectedAsset.display_order}
                  </div>
                </div>
                
                <div className="mt-4 flex space-x-2">
                  <button
                    onClick={() => handleDeleteAsset(selectedAsset.id)}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Remove from Album
                  </button>
                  <a
                    href={selectedAsset.asset_uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Open Original
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Image Uploader Modal */}
      {showImageUploader && (
        <StandaloneImageUploader
          onImagesUploaded={handleImagesUploaded}
          onClose={() => setShowImageUploader(false)}
        />
      )}
    </div>
  );
};