import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Asset {
  id: string;
  album_id: string;
  asset_id: string;
  asset_uri: string;
  asset_type: 'image' | 'video';
  display_order: number;
  date_added: string;
  albums: any;
}

interface Album {
  id: string;
  title: string;
  user_id: string;
}

interface PhotoPickerProps {
  targetAlbumId: string;
  onPhotosAdded: (count: number) => void;
  onClose: () => void;
}

export const PhotoPicker: React.FC<PhotoPickerProps> = ({
  targetAlbumId,
  onPhotosAdded,
  onClose
}) => {
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [sortBy, setSortBy] = useState<'date_added' | 'album' | 'type'>('date_added');
  const [sourceAlbumFilter, setSourceAlbumFilter] = useState<string>('all');
  const [sourceAlbums, setSourceAlbums] = useState<Album[]>([]);

  const { user } = useAuth();

  const isWebAccessibleUrl = (url: string | null): boolean => {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://');
  };

  useEffect(() => {
    if (user?.id) {
      loadAvailableAssets();
    }
  }, [user?.id, targetAlbumId]);

  const loadAvailableAssets = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all albums owned by the user
      const { data: albumsData, error: albumsError } = await supabase
        .from('albums')
        .select('id, title, user_id')
        .eq('user_id', user!.id);

      if (albumsError) throw albumsError;

      setSourceAlbums(albumsData || []);

      if (!albumsData || albumsData.length === 0) {
        setAvailableAssets([]);
        setAllAssets([]);
        setLoading(false);
        return;
      }

      // Get all assets from user's albums
      const albumIds = albumsData.map(album => album.id);
      const { data: assetsData, error: assetsError } = await supabase
        .from('album_assets')
        .select(`
          id,
          album_id,
          asset_id,
          asset_uri,
          asset_type,
          display_order,
          date_added,
          albums!inner(
            id,
            title,
            user_id
          )
        `)
        .in('album_id', albumIds)
        .order('date_added', { ascending: false });

      if (assetsError) throw assetsError;

      const assets = assetsData || [];
      setAllAssets(assets);

      // Filter out assets that are already in the target album
      const availableAssets = assets.filter(asset => asset.album_id !== targetAlbumId);
      setAvailableAssets(availableAssets);

    } catch (err) {
      console.error('Error loading assets:', err);
      setError(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  };

  const filteredAssets = React.useMemo(() => {
    let filtered = availableAssets;

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(asset => 
        asset.albums.title.toLowerCase().includes(searchLower) ||
        asset.asset_id.toLowerCase().includes(searchLower)
      );
    }

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(asset => asset.asset_type === filterType);
    }

    // Apply source album filter
    if (sourceAlbumFilter !== 'all') {
      filtered = filtered.filter(asset => asset.album_id === sourceAlbumFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date_added':
          return new Date(b.date_added).getTime() - new Date(a.date_added).getTime();
        case 'album':
          return a.albums.title.localeCompare(b.albums.title);
        case 'type':
          return a.asset_type.localeCompare(b.asset_type);
        default:
          return 0;
      }
    });

    return filtered;
  }, [availableAssets, searchTerm, filterType, sortBy, sourceAlbumFilter]);

  const handleAssetToggle = (assetId: string) => {
    const newSelected = new Set(selectedAssetIds);
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId);
    } else {
      newSelected.add(assetId);
    }
    setSelectedAssetIds(newSelected);
  };

  const handleSelectAll = () => {
    const webAccessibleAssets = filteredAssets.filter(asset => isWebAccessibleUrl(asset.asset_uri));
    if (selectedAssetIds.size === webAccessibleAssets.length) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(webAccessibleAssets.map(asset => asset.id)));
    }
  };

  const handleAddPhotos = async () => {
    if (selectedAssetIds.size === 0) return;

    try {
      setAdding(true);
      setError(null);

      // Get the assets to be copied
      const selectedAssets = allAssets.filter(asset => selectedAssetIds.has(asset.id));
      
      // Find the highest display order in the target album
      const { data: maxOrderData } = await supabase
        .from('album_assets')
        .select('display_order')
        .eq('album_id', targetAlbumId)
        .order('display_order', { ascending: false })
        .limit(1);

      const startOrder = (maxOrderData?.[0]?.display_order || 0) + 1;

      // Create new album_asset entries for the target album
      const newAssetEntries = selectedAssets.map((asset, index) => ({
        album_id: targetAlbumId,
        asset_id: asset.asset_id,
        asset_uri: asset.asset_uri,
        asset_type: asset.asset_type,
        display_order: startOrder + index,
        date_added: new Date().toISOString()
      }));

      const { error: insertError } = await supabase
        .from('album_assets')
        .insert(newAssetEntries);

      if (insertError) throw insertError;

      onPhotosAdded(selectedAssetIds.size);
      onClose();

    } catch (err) {
      console.error('Error adding photos:', err);
      setError(err instanceof Error ? err.message : 'Failed to add photos');
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3">Loading photos...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Add Photos to Album</h2>
            <p className="text-sm text-gray-600 mt-1">
              Select photos from your other albums ({filteredAssets.length} available)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Filters and Search */}
        <div className="border-b px-6 py-4 space-y-4">
          <div className="flex flex-wrap gap-4">
            {/* Search */}
            <div className="flex-1 min-w-64">
              <input
                type="text"
                placeholder="Search by album name or photo ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Type filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Types</option>
              <option value="image">Images Only</option>
              <option value="video">Videos Only</option>
            </select>

            {/* Source Album filter */}
            <select
              value={sourceAlbumFilter}
              onChange={(e) => setSourceAlbumFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Albums</option>
              {sourceAlbums
                .filter(album => album.id !== targetAlbumId)
                .map(album => (
                  <option key={album.id} value={album.id}>
                    {album.title}
                  </option>
                ))
              }
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="date_added">Latest First</option>
              <option value="album">By Album</option>
              <option value="type">By Type</option>
            </select>
          </div>

          {/* Selection controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleSelectAll}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                {selectedAssetIds.size === filteredAssets.filter(a => isWebAccessibleUrl(a.asset_uri)).length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-sm text-gray-600">
                {selectedAssetIds.size} selected
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredAssets.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4 opacity-50">📷</div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No Photos Available</h3>
              <p className="text-gray-500">
                {availableAssets.length === 0 
                  ? "You don't have any other photos to add to this album."
                  : "No photos match your current filters."
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
              {filteredAssets.map(asset => {
                const isSelected = selectedAssetIds.has(asset.id);
                const isWebAccessible = isWebAccessibleUrl(asset.asset_uri);
                
                return (
                  <div
                    key={asset.id}
                    className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all ${
                      isWebAccessible ? 'hover:scale-105' : 'opacity-50 cursor-not-allowed'
                    } ${
                      isSelected ? 'ring-4 ring-blue-500 ring-offset-2' : ''
                    }`}
                    onClick={() => isWebAccessible && handleAssetToggle(asset.id)}
                  >
                    {/* Selection overlay */}
                    {isWebAccessible && (
                      <div className={`absolute inset-0 z-10 ${isSelected ? 'bg-blue-500/20' : ''}`}>
                        <div className="absolute top-2 left-2">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isSelected 
                              ? 'bg-blue-500 border-blue-500' 
                              : 'bg-white/80 border-white'
                          }`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Image */}
                    {isWebAccessible ? (
                      <img
                        src={asset.asset_uri}
                        alt="Photo"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-200 text-gray-500">
                        <div className="text-2xl mb-1">{asset.asset_type === 'video' ? '🎥' : '📸'}</div>
                        <div className="text-xs text-center px-1">
                          Not available
                        </div>
                      </div>
                    )}

                    {/* Video indicator */}
                    {asset.asset_type === 'video' && isWebAccessible && (
                      <div className="absolute bottom-2 right-2">
                        <div className="bg-black/50 rounded px-1 py-0.5">
                          <span className="text-white text-xs">▶️</span>
                        </div>
                      </div>
                    )}

                    {/* Album info */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-white text-xs truncate">
                        {asset.albums.title}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {selectedAssetIds.size} photo{selectedAssetIds.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddPhotos}
              disabled={selectedAssetIds.size === 0 || adding}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-md transition-colors flex items-center gap-2"
            >
              {adding ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Adding...
                </>
              ) : (
                `Add ${selectedAssetIds.size} Photo${selectedAssetIds.size !== 1 ? 's' : ''}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};