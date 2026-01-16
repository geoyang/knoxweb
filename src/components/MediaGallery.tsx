import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { adminApi } from '../services/adminApi';
import { VideoPlayer } from './VideoPlayer';

type SortOption = 'date_added' | 'created_at' | 'type' | 'filename';
type ViewMode = 'grid' | 'list';

interface Asset {
  id: string;
  filename: string;
  asset_uri: string;
  web_uri?: string;
  thumbnail_uri?: string;
  asset_type: string;
  media_type?: string;
  created_at: string;
  location_name?: string;
  tags?: Array<{ type: string; value: string }>;
}

interface MediaGalleryProps {
  onAssetSelect?: (asset: Asset) => void;
}

export const MediaGallery: React.FC<MediaGalleryProps> = ({ onAssetSelect }) => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('date_added');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<{ total: number; photos: number; videos: number } | null>(null);

  useEffect(() => {
    loadAssets();
  }, [sortBy]);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const result = await adminApi.getImages('all', sortBy);
      if (result.success && result.data) {
        setAssets(result.data.assets || []);
        if (result.data.stats) {
          setStats({
            total: result.data.count || 0,
            photos: result.data.stats.photos || 0,
            videos: result.data.stats.videos || 0,
          });
        }
        setError(null);
      } else {
        setError(result.error || 'Failed to load media');
      }
    } catch (err) {
      setError('Failed to load media');
    } finally {
      setLoading(false);
    }
  };

  const filteredAssets = useMemo(() => {
    let result = [...assets];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((asset) => {
        const filename = asset.filename?.toLowerCase() || '';
        const location = (asset.location_name || '').toLowerCase();
        const tags = asset.tags?.map((t) => t.value?.toLowerCase()).join(' ') || '';
        return filename.includes(query) || location.includes(query) || tags.includes(query);
      });
    }

    if (sortDirection === 'asc') {
      result.reverse();
    }

    return result;
  }, [assets, searchQuery, sortDirection]);

  const isVideoAsset = (asset: Asset): boolean => {
    const mediaType = (asset.media_type || asset.asset_type || '').toLowerCase();
    const filename = (asset.filename || '').toLowerCase();
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
    return mediaType === 'video' || mediaType.includes('video') ||
           videoExtensions.some(ext => filename.endsWith(ext));
  };

  const getDisplayImage = (asset: Asset): string | null => {
    if (asset.thumbnail_uri?.startsWith('data:')) return asset.thumbnail_uri;
    if (asset.web_uri && isWebAccessibleUrl(asset.web_uri)) return asset.web_uri;
    if (asset.thumbnail_uri && isWebAccessibleUrl(asset.thumbnail_uri)) return asset.thumbnail_uri;
    if (asset.asset_uri && isWebAccessibleUrl(asset.asset_uri)) return asset.asset_uri;
    return null;
  };

  const isWebAccessibleUrl = (url: string | null): boolean => {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:');
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssets((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedAssets(new Set());
  };

  const selectAllAssets = () => {
    setSelectedAssets(new Set(filteredAssets.map((a) => a.id)));
  };

  const handleDelete = async (assetIds: string[]) => {
    if (!window.confirm(`Delete ${assetIds.length} item(s)? This cannot be undone.`)) return;

    let successCount = 0;
    for (const assetId of assetIds) {
      const result = await adminApi.deleteAsset(assetId);
      if (result.success) successCount++;
    }

    if (successCount > 0) {
      loadAssets();
      exitSelectionMode();
    }
    alert(`Deleted ${successCount} of ${assetIds.length} items`);
  };

  const getSortLabel = (option: SortOption): string => {
    const labels: Record<SortOption, string> = {
      date_added: 'Date Added',
      created_at: 'Date Created',
      type: 'Type',
      filename: 'Filename',
    };
    return labels[option];
  };

  const handleImageError = (assetId: string) => {
    setFailedImages(prev => new Set([...prev, assetId]));
  };

  const handleAssetClick = (asset: Asset) => {
    if (selectionMode) {
      toggleAssetSelection(asset.id);
    } else {
      setSelectedAsset(asset);
      onAssetSelect?.(asset);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-500">Loading media...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-xl p-6 text-center">
        <p className="text-red-600 mb-3">{error}</p>
        <button
          onClick={loadAssets}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-800">Media</h3>
            {stats && (
              <span className="text-sm text-gray-500">
                {stats.total} items ({stats.photos} photos, {stats.videos} videos)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search Toggle */}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`p-2 rounded-lg transition-colors ${
                showSearch ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
              }`}
              title="Search"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* View Mode Toggle */}
            <button
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
              title={viewMode === 'grid' ? 'List view' : 'Grid view'}
            >
              {viewMode === 'grid' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              )}
            </button>

            {/* Sort Menu */}
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-600 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
                {getSortLabel(sortBy)}
              </button>

              {showSortMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                  {(['date_added', 'created_at', 'type', 'filename'] as SortOption[]).map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setSortBy(option);
                        setShowSortMenu(false);
                      }}
                      className={`w-full text-left px-4 py-2 hover:bg-gray-50 text-sm ${
                        sortBy === option ? 'text-blue-600 font-medium' : 'text-gray-700'
                      }`}
                    >
                      {getSortLabel(option)}
                    </button>
                  ))}
                  <div className="border-t border-gray-200 mt-1 pt-1">
                    <button
                      onClick={() => {
                        setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                        setShowSortMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-2"
                    >
                      {sortDirection === 'desc' ? '↓ Descending' : '↑ Ascending'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Selection Mode Toggle */}
            {!selectionMode ? (
              <button
                onClick={() => setSelectionMode(true)}
                className="px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-600 text-sm"
              >
                Select
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{selectedAssets.size} selected</span>
                <button
                  onClick={selectAllAssets}
                  className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
                >
                  All
                </button>
                <button
                  onClick={exitSelectionMode}
                  className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Refresh */}
            <button
              onClick={loadAssets}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
              title="Refresh"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div className="mt-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by filename, location, or tags..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selection Action Bar */}
      {selectionMode && selectedAssets.size > 0 && (
        <div className="border-b border-gray-200 bg-blue-50 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-blue-800 font-medium">{selectedAssets.size} items selected</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDelete(Array.from(selectedAssets))}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {filteredAssets.length === 0 ? (
        <div className="p-12 text-center">
          <div className="text-6xl mb-4 opacity-50">📷</div>
          <h4 className="text-lg font-medium text-gray-700 mb-2">
            {searchQuery ? 'No Matching Media' : 'No Media Yet'}
          </h4>
          <p className="text-gray-500">
            {searchQuery
              ? 'Try adjusting your search terms'
              : 'Upload photos and videos from the mobile app to see them here'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {filteredAssets.map((asset) => {
            const imageUrl = getDisplayImage(asset);
            const isVideo = isVideoAsset(asset);
            const isSelected = selectedAssets.has(asset.id);

            return (
              <div
                key={asset.id}
                className={`relative aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer group ${
                  isSelected ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => handleAssetClick(asset)}
              >
                {imageUrl && !failedImages.has(asset.id) ? (
                  <img
                    src={imageUrl}
                    alt={asset.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={() => handleImageError(asset.id)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200">
                    {isVideo ? (
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                )}

                {/* Video overlay */}
                {isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Selection checkbox */}
                {selectionMode && (
                  <div className="absolute top-2 right-2">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600'
                        : 'bg-white/80 border-white'
                    }`}>
                      {isSelected && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {filteredAssets.map((asset) => {
            const imageUrl = getDisplayImage(asset);
            const isVideo = isVideoAsset(asset);
            const isSelected = selectedAssets.has(asset.id);

            return (
              <div
                key={asset.id}
                className={`flex items-center gap-4 p-4 hover:bg-gray-50 cursor-pointer ${
                  isSelected ? 'bg-blue-50' : ''
                }`}
                onClick={() => handleAssetClick(asset)}
              >
                {selectionMode && (
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-300'
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                )}

                <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 relative">
                  {imageUrl && !failedImages.has(asset.id) ? (
                    <img
                      src={imageUrl}
                      alt={asset.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={() => handleImageError(asset.id)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {isVideo ? (
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                  )}
                  {isVideo && imageUrl && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-6 h-6 bg-black/50 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{asset.filename}</p>
                  <p className="text-xs text-gray-500">
                    {isVideo ? 'Video' : 'Photo'} • {new Date(asset.created_at).toLocaleDateString()}
                  </p>
                  {asset.location_name && (
                    <p className="text-xs text-gray-400 truncate">{asset.location_name}</p>
                  )}
                </div>

                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            );
          })}
        </div>
      )}

      {/* Media Viewer Modal */}
      {selectedAsset && (
        <MediaViewerModal
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onDelete={() => {
            handleDelete([selectedAsset.id]);
            setSelectedAsset(null);
          }}
        />
      )}
    </div>
  );
};

interface MediaViewerModalProps {
  asset: Asset;
  onClose: () => void;
  onDelete: () => void;
}

const MediaViewerModal: React.FC<MediaViewerModalProps> = ({ asset, onClose, onDelete }) => {
  const isVideo = asset.media_type === 'video' || asset.asset_type === 'video' ||
    (asset.filename?.toLowerCase() || '').match(/\.(mp4|mov|avi|mkv|webm|m4v)$/);

  const mediaUrl = asset.web_uri || asset.asset_uri;
  const isWebAccessible = mediaUrl?.startsWith('http://') || mediaUrl?.startsWith('https://');

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2 bg-red-600 hover:bg-red-700 rounded-full text-white"
          title="Delete"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white"
          title="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="max-w-5xl max-h-[90vh] w-full mx-4" onClick={(e) => e.stopPropagation()}>
        {isVideo && isWebAccessible ? (
          <div className="max-h-[80vh] mx-auto rounded-lg overflow-hidden">
            <VideoPlayer
              src={mediaUrl!}
              className="max-w-full max-h-[80vh] mx-auto object-contain"
              autoPlay={true}
              controls={true}
            />
          </div>
        ) : isWebAccessible ? (
          <img
            src={mediaUrl}
            alt={asset.filename}
            className="max-w-full max-h-[80vh] mx-auto rounded-lg object-contain"
          />
        ) : (
          <div className="bg-gray-800 rounded-lg p-12 text-center">
            <svg className="w-16 h-16 text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-400">Preview not available</p>
            <p className="text-gray-500 text-sm mt-2">{asset.filename}</p>
          </div>
        )}

        {/* Info bar */}
        <div className="mt-4 bg-white/10 rounded-lg p-4 text-white">
          <p className="font-medium">{asset.filename}</p>
          <div className="flex gap-4 mt-2 text-sm text-gray-300">
            <span>{isVideo ? 'Video' : 'Photo'}</span>
            <span>{new Date(asset.created_at).toLocaleString()}</span>
            {asset.location_name && <span>{asset.location_name}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaGallery;
