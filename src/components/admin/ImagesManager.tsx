import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ImageUploader } from './ImageUploader';
import { MemoriesPanel } from '../MemoriesPanel';
import { adminApi } from '../../services/adminApi';
import { memoriesApi } from '../../services/memoriesApi';
import { supabase } from '../../lib/supabase';

interface Asset {
  id: string;
  asset_id: string;
  asset_uri: string;
  thumbnail_uri?: string;
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
  const [selectedUploadAlbumId, setSelectedUploadAlbumId] = useState<string | null>(null);
  const imageUrlsRef = useRef<Map<string, string>>(new Map());

  // Memories state
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({});
  const [memoriesAssetId, setMemoriesAssetId] = useState<string | null>(null);

  const { user } = useAuth();

  const isWebAccessibleUrl = (url: string | null): boolean => {
    if (!url) return false;
    // Check if URL is web accessible (http/https, data URI) and not a local scheme like ph://
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:');
  };

  // Check if URL is a base64 data URI
  const isBase64DataUri = (url: string | null): boolean => {
    if (!url) return false;
    return url.startsWith('data:');
  };

  // Get thumbnail URL - use stored thumbnail_uri if available
  const getThumbnailUrl = (asset: Asset): string => {
    // Use base64 thumbnail if available (highest priority)
    if (asset.thumbnail_uri && isBase64DataUri(asset.thumbnail_uri)) {
      return asset.thumbnail_uri;
    }

    // Use stored thumbnail if it's a web URL
    if (asset.thumbnail_uri && isWebAccessibleUrl(asset.thumbnail_uri)) {
      return asset.thumbnail_uri;
    }

    // Legacy fallback: If it's an ImageKit URL, add thumbnail transformation
    if (asset.asset_uri?.includes('imagekit.io')) {
      const url = new URL(asset.asset_uri);
      // Add ImageKit transformation for 80x80 thumbnail
      url.searchParams.set('tr', 'w-80,h-80,c-at_max');
      return url.toString();
    }

    // For Supabase storage without stored thumbnail, use original
    return asset.asset_uri;
  };

  // Helper function to fetch authenticated images from Supabase
  const fetchAuthenticatedImage = async (filePath: string, cacheKey: string): Promise<string> => {
    // Get current session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('No authentication token available');
    }
    
    // Fetch image with authentication
    const imageUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-image?path=${encodeURIComponent(filePath)}`;
    const response = await fetch(imageUrl, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    // Convert to blob URL
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    // Cache the blob URL
    imageUrlsRef.current.set(cacheKey, blobUrl);
    
    return blobUrl;
  };

  // Get authenticated image URL using fetch with auth headers, return as blob URL
  const getAuthenticatedImageBlob = useCallback(async (asset: Asset, useThumbnail: boolean = false): Promise<string> => {
    const cacheKey = `${asset.id}_${useThumbnail ? 'thumb' : 'full'}`;

    // Check cache first
    const cached = imageUrlsRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    // For thumbnails, check for base64 data URI first (highest priority)
    if (useThumbnail && asset.thumbnail_uri && isBase64DataUri(asset.thumbnail_uri)) {
      imageUrlsRef.current.set(cacheKey, asset.thumbnail_uri);
      return asset.thumbnail_uri;
    }

    // For thumbnails, use the stored thumbnail_uri if available
    if (useThumbnail && asset.thumbnail_uri && isWebAccessibleUrl(asset.thumbnail_uri)) {
      // Check if it's ImageKit (can be used directly) or Supabase (needs auth)
      if (asset.thumbnail_uri.includes('imagekit.io')) {
        imageUrlsRef.current.set(cacheKey, asset.thumbnail_uri);
        return asset.thumbnail_uri;
      }

      // Supabase thumbnail - needs auth fetch
      if (asset.thumbnail_uri.includes('supabase.co/storage')) {
        const urlParts = asset.thumbnail_uri.split('/storage/v1/object/public/assets/');
        if (urlParts.length === 2) {
          const filePath = urlParts[1];
          return await fetchAuthenticatedImage(filePath, cacheKey);
        }
      }
    }

    // For full images or fallback for thumbnails
    if (asset.asset_uri.includes('imagekit.io')) {
      // ImageKit URLs can be used directly
      let url = asset.asset_uri;
      if (useThumbnail) {
        const urlObj = new URL(asset.asset_uri);
        urlObj.searchParams.set('tr', 'w-80,h-80,c-at_max');
        url = urlObj.toString();
      }
      
      // Cache and return
      imageUrlsRef.current.set(cacheKey, url);
      return url;
    }
    
    if (asset.asset_uri.includes('supabase.co/storage')) {
      const urlParts = asset.asset_uri.split('/storage/v1/object/public/assets/');
      if (urlParts.length === 2) {
        const filePath = urlParts[1];
        return await fetchAuthenticatedImage(filePath, cacheKey);
      }
    }
    
    return asset.asset_uri; // Fallback to original
  }, []);

  // Component for image display with authentication headers
  const AuthenticatedImage: React.FC<{
    asset: Asset;
    className?: string;
    alt?: string;
    onError?: (e: any) => void;
    onLoad?: () => void;
    style?: React.CSSProperties;
    useThumbnail?: boolean;
  }> = React.memo(({ asset, className, alt, onError, onLoad, style, useThumbnail = true }) => {
    const [imageSrc, setImageSrc] = useState<string>('');
    const [imageLoading, setImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);

    useEffect(() => {
      // Prevent loading if we've already loaded this asset with this thumbnail setting
      const cacheKey = `${asset.id}_${useThumbnail ? 'thumb' : 'full'}`;
      if (hasLoaded && imageUrlsRef.current.has(cacheKey)) {
        setImageSrc(imageUrlsRef.current.get(cacheKey)!);
        setImageLoading(false);
        return;
      }

      const loadImage = async () => {
        // For thumbnails, check if we have a base64 data URI first - these work even if asset_uri is not web accessible
        if (useThumbnail && asset.thumbnail_uri && isBase64DataUri(asset.thumbnail_uri)) {
          console.log('Using base64 thumbnail for asset:', asset.id);
          setImageSrc(asset.thumbnail_uri);
          setHasLoaded(true);
          imageUrlsRef.current.set(cacheKey, asset.thumbnail_uri);
          setImageLoading(false);
          return;
        }

        // Check if asset_uri is web accessible for other cases
        if (!isWebAccessibleUrl(asset.asset_uri)) {
          console.log('Asset URI not web accessible:', asset.asset_uri);
          setImageLoading(false);
          return;
        }

        try {
          console.log(`Loading ${useThumbnail ? 'thumbnail' : 'full-size'} image for asset:`, asset.id);

          // Use the authenticated blob method
          const imageUrl = await getAuthenticatedImageBlob(asset, useThumbnail);
          setImageSrc(imageUrl);
          setHasLoaded(true);

          console.log(`${useThumbnail ? 'Thumbnail' : 'Full-size'} image loaded:`, imageUrl.substring(0, 50) + '...');
        } catch (error) {
          console.error('Failed to load authenticated image:', error);
          setImageError(true);
        }

        setImageLoading(false);
      };

      loadImage();
    }, [asset.id, asset.asset_uri, asset.thumbnail_uri, useThumbnail]); // Include thumbnail_uri in dependencies

    if (imageLoading) {
      return (
        <div className={`bg-gray-200 animate-pulse ${className || ''}`} style={style}>
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            Loading...
          </div>
        </div>
      );
    }

    // Show error fallback only if we have an error OR if we don't have an imageSrc and asset_uri isn't web accessible
    if (imageError || (!imageSrc && !isWebAccessibleUrl(asset.asset_uri))) {
      return (
        <div className={`w-full h-full flex flex-col items-center justify-center text-gray-500 ${className || ''}`} style={style}>
          <div className="text-3xl mb-2">{asset.asset_type === 'video' ? '🎥' : '📸'}</div>
          <div className="text-xs text-center px-2">
            {imageError ? 'Failed to load' : `${asset.asset_type === 'video' ? 'Video' : 'Image'} not available in web view`}
          </div>
        </div>
      );
    }

    return (
      <img
        src={imageSrc}
        alt={alt}
        className={className}
        style={style}
        loading="lazy"
        onError={(e) => {
          console.error('Image failed to load:', {
            src: imageSrc,
            originalSrc: asset.asset_uri,
            error: e,
            asset: asset
          });
          setImageError(true);
          onError?.(e);
        }}
        onLoad={() => {
          console.log('Image loaded successfully:', imageSrc);
          onLoad?.();
        }}
      />
    );
  });

  useEffect(() => {
    if (user?.id) {
      loadAssets();
    } else {
      setLoading(false);
    }
  }, [user?.id, filterType, sortBy]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      imageUrlsRef.current.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, []);

  const loadMemoryCounts = useCallback(async (assetList: Asset[]) => {
    if (assetList.length === 0) return;
    const assetIds = assetList.map((a) => a.asset_id);
    const counts = await memoriesApi.getMemoryCounts(assetIds);
    setMemoryCounts(counts);
  }, []);

  const handleImagesUploaded = async (count: number) => {
    console.log(`Uploaded ${count} new images to library`);
    setShowImageUploader(false);
    setSelectedUploadAlbumId(null);
    // Reload assets to show newly uploaded images
    await loadAssets();
  };

  const handleUploadClick = () => {
    // Open uploader directly - no album by default (uploads to assets only)
    setSelectedUploadAlbumId(null);
    setShowImageUploader(true);
  };

  const loadAssets = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await adminApi.getImages(filterType, sortBy);
      
      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }

      const enrichedAssets = result.data?.assets || [];
      const statsData = result.data?.stats || {
        total_images: 0,
        total_videos: 0,
        total_albums: 0,
        recent_uploads: 0,
      };

      console.log('Loaded assets:', enrichedAssets.map(asset => ({
        id: asset.id,
        asset_uri: asset.asset_uri,
        thumbnail_uri: asset.thumbnail_uri ? (asset.thumbnail_uri.substring(0, 50) + '...') : null,
        hasBase64Thumbnail: isBase64DataUri(asset.thumbnail_uri),
        isWebAccessible: isWebAccessibleUrl(asset.asset_uri)
      })));

      setAssets(enrichedAssets);
      setStats(statsData);
      setError(null);

      // Load memory counts
      loadMemoryCounts(enrichedAssets);

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
      const result = await adminApi.deleteAsset(assetId);
      
      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }
      
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
        <h2 className="text-2xl font-bold text-gray-900">My Images and Videos</h2>
        <div className="flex items-center space-x-4">
          <button
            onClick={handleUploadClick}
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
        <div className="flex flex-wrap gap-2">
          {filteredAssets.map(asset => {
            const memoryCount = memoryCounts[asset.asset_id] || 0;
            return (
              <div
                key={asset.id}
                className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform relative group"
                onClick={() => setSelectedAsset(asset)}
              >
                <AuthenticatedImage
                  asset={asset}
                  alt={`Asset from ${asset.album?.title || 'Unknown Album'}`}
                  className="w-full h-full object-cover"
                  useThumbnail={true}
                />
                {asset.asset_type === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black/50 rounded-full p-1">
                      <span className="text-white text-xs">▶️</span>
                    </div>
                  </div>
                )}
                {/* Memory indicator */}
                {memoryCount > 0 && (
                  <button
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-1 flex items-center gap-0.5 hover:bg-black/80 transition-colors"
                    onClick={(e) => { e.stopPropagation(); setMemoriesAssetId(asset.asset_id); }}
                    title={`${memoryCount} ${memoryCount === 1 ? 'memory' : 'memories'}`}
                  >
                    <span className="text-white text-[10px]">💬</span>
                    {memoryCount > 1 && (
                      <span className="text-white text-[9px] font-medium pr-0.5">{memoryCount}</span>
                    )}
                  </button>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-[9px] truncate px-1">{asset.album?.title}</p>
                </div>
              </div>
            );
          })}
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
                      <div className="flex-shrink-0 h-20 w-20 bg-gray-100 rounded-lg overflow-hidden">
                        <AuthenticatedImage
                          asset={asset}
                          alt="Asset thumbnail"
                          className="w-full h-full object-cover"
                          useThumbnail={true}
                        />
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
                      asset.asset_type !== 'video'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {asset.asset_type !== 'video' ? '🖼️ Image' : '🎥 Video'}
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
              onClick={handleUploadClick}
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
                  // Check for NOT video (covers 'image', 'photo', undefined, null)
                  selectedAsset.asset_type !== 'video' ? (
                    <AuthenticatedImage
                      asset={selectedAsset}
                      alt="Full size"
                      className="w-full h-full object-contain"
                      useThumbnail={false}
                    />
                  ) : (
                    // For videos, we'll need a different approach with signed URLs
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                      <div className="text-6xl mb-4">🎥</div>
                      <div className="text-xl font-semibold mb-2">Video Playback</div>
                      <div className="text-sm text-center max-w-md">
                        Video playback in authenticated storage requires additional implementation.
                        <br />
                        <a
                          href={selectedAsset.asset_uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline mt-2 inline-block"
                        >
                          Open video in new tab
                        </a>
                      </div>
                    </div>
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
                    onClick={() => {
                      setSelectedAsset(null);
                      setMemoriesAssetId(selectedAsset.asset_id);
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    💬 Memories {memoryCounts[selectedAsset.asset_id] ? `(${memoryCounts[selectedAsset.asset_id]})` : ''}
                  </button>
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

      {/* Image Uploader Modal - no album by default, uploads to assets only */}
      {showImageUploader && (
        <ImageUploader
          targetAlbumId={selectedUploadAlbumId}
          onImagesUploaded={handleImagesUploaded}
          onClose={() => {
            setShowImageUploader(false);
            setSelectedUploadAlbumId(null);
          }}
        />
      )}

      {/* Memories Panel Modal */}
      {memoriesAssetId && (
        <MemoriesPanel
          assetId={memoriesAssetId}
          canAddMemory={true}
          onClose={() => setMemoriesAssetId(null)}
          onMemoriesUpdated={() => loadMemoryCounts(assets)}
        />
      )}
    </div>
  );
};