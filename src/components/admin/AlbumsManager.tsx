import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { PhotoPicker } from './PhotoPicker';
import { ImageUploader } from './ImageUploader';
import { adminApi } from '../../services/adminApi';
import { supabase } from '../../lib/supabase';

interface Album {
  id: string;
  title: string;
  description: string | null;
  keyphoto: string | null;
  user_id: string;
  date_created: string;
  date_modified: string;
  isOwner?: boolean;
  shared_via?: {
    circle_id: string;
    circle_name: string;
    role: string;
  }[];
  profiles?: {
    full_name: string | null;
    email: string | null;
  };
  album_assets?: {
    id: string;
    asset_uri: string;
    asset_type: string;
    thumbnail_uri?: string;
    web_uri?: string;  // Web-compatible JPEG for HEIC files
  }[];
  album_shares?: {
    id: string;
    circle_id: string;
    role: string;
    is_active: boolean;
    circles: {
      id: string;
      name: string;
    };
  }[];
}

interface Circle {
  id: string;
  name: string;
  description: string | null;
}

export const AlbumsManager: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<NonNullable<Album['album_assets']>[0] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShareForm, setShowShareForm] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [showImageUploader, setShowImageUploader] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      loadAlbums();
      loadCircles();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  const loadAlbums = async () => {
    if (!user?.id) {
      console.warn('No user ID available for filtering albums');
      setAlbums([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Check authentication state first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        console.error('Authentication issue:', sessionError);
        setError('Please log in again to continue.');
        setLoading(false);
        return;
      }
      
      const result = await adminApi.getAlbums();
      
      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }

      const enrichedAlbums = result.data?.albums || [];
      setAlbums(enrichedAlbums);

      // Debug log album data
      console.log('Albums API response stats:', result.data?.stats);
      enrichedAlbums.forEach(album => {
        const displayImage = getDisplayImage(album);
        console.log(`Album "${album.title}":`, {
          id: album.id,
          isOwner: album.isOwner,
          keyphoto: album.keyphoto,
          hasKeyphoto: hasKeyphoto(album.keyphoto),
          displayImage: displayImage,
          assetCount: album.album_assets?.length || 0,
          assets: album.album_assets?.slice(0, 2) // Log first 2 assets for debugging
        });
      });
      
      setFailedImages(new Set()); // Reset failed images when data reloads
      setError(null);
    } catch (err) {
      console.error('Error loading albums:', err);
      setError(err instanceof Error ? err.message : 'Failed to load albums');
    } finally {
      setLoading(false);
    }
  };

  const loadCircles = async () => {
    if (!user?.id) {
      console.warn('No user ID available for filtering circles');
      setCircles([]);
      return;
    }

    try {
      // Check authentication state first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        console.error('Authentication issue in loadCircles:', sessionError);
        setCircles([]);
        return;
      }

      const result = await adminApi.getCircles();
      
      if (result.success) {
        setCircles(result.data?.circles || []);
      } else {
        console.error('Error loading circles:', adminApi.handleApiError(result));
        setCircles([]);
      }
    } catch (err) {
      console.error('Error loading circles:', err);
      setCircles([]);
    }
  };

  const handleShareAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlbum) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    try {
      const { data, error } = await supabase
        .from('album_shares')
        .insert([
          {
            album_id: selectedAlbum.id,
            circle_id: formData.get('circle_id') as string,
            role: formData.get('role') as string,
            shared_by: user!.id,
          }
        ])
        .select()
        .single();

      if (error) throw error;

      setShowShareForm(false);
      form.reset();
      await loadAlbums();
    } catch (err) {
      console.error('Error sharing album:', err);
      setError(err instanceof Error ? err.message : 'Failed to share album');
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    if (!confirm('Are you sure you want to stop sharing this album?')) return;

    try {
      const { error } = await supabase
        .from('album_shares')
        .update({ is_active: false })
        .eq('id', shareId);

      if (error) throw error;
      await loadAlbums();
    } catch (err) {
      console.error('Error removing share:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove share');
    }
  };

  const handleDeleteAlbum = async (albumId: string) => {
    if (!confirm('Are you sure you want to delete this album? This action cannot be undone.')) return;

    try {
      const result = await adminApi.deleteAlbum(albumId);
      
      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }
      
      await loadAlbums();
      if (selectedAlbum?.id === albumId) {
        setSelectedAlbum(null);
      }
    } catch (err) {
      console.error('Error deleting album:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete album');
    }
  };

  const handleImageError = (albumId: string, keyphoto: string) => {
    console.warn(`Failed to load keyphoto for album ${albumId}:`, keyphoto);
    setFailedImages(prev => new Set([...prev, albumId]));
  };

  const handlePhotosAdded = async (count: number) => {
    console.log(`Added ${count} photos to album`);
    setShowPhotoPicker(false);
    // Reload albums to get updated asset counts
    await loadAlbums();
    // If we have a selected album, refresh it to show new photos
    if (selectedAlbum) {
      const updatedAlbum = albums.find(album => album.id === selectedAlbum.id);
      if (updatedAlbum) {
        setSelectedAlbum(updatedAlbum);
      }
    }
  };

  const handleImagesUploaded = async (count: number) => {
    console.log(`Uploaded ${count} new images to album`);
    setShowImageUploader(false);
    // Reload albums to get updated asset counts
    await loadAlbums();
    // If we have a selected album, refresh it to show new photos
    if (selectedAlbum) {
      const updatedAlbum = albums.find(album => album.id === selectedAlbum.id);
      if (updatedAlbum) {
        setSelectedAlbum(updatedAlbum);
      }
    }
  };

  const hasKeyphoto = (url: string | null): boolean => {
    return !!(url && url.trim() !== '');
  };

  const isWebAccessibleUrl = (url: string | null): boolean => {
    if (!url) return false;
    // Check if URL is web accessible (http/https) and not a local scheme like ph://
    return url.startsWith('http://') || url.startsWith('https://');
  };

  // Helper to check if URL is HEIC/HEIF (can't be displayed in browsers)
  const isHeicUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith('.heic') || lower.endsWith('.heif');
  };

  // Get web-compatible image URL
  // Priority: web_uri (JPEG) > thumbnail_uri (JPEG) > original (if not HEIC)
  const getWebCompatibleImageUrl = (
    url: string | null,
    options?: { webUri?: string | null; thumbnailUri?: string | null }
  ): string | null => {
    // If web_uri is available and not HEIC, use it
    if (options?.webUri && isWebAccessibleUrl(options.webUri) && !isHeicUrl(options.webUri)) {
      return options.webUri;
    }

    // If thumbnail is available and not HEIC, use it
    if (options?.thumbnailUri && isWebAccessibleUrl(options.thumbnailUri) && !isHeicUrl(options.thumbnailUri)) {
      return options.thumbnailUri;
    }

    // If original URL is available and not HEIC, use it
    if (url && isWebAccessibleUrl(url) && !isHeicUrl(url)) {
      return url;
    }

    // No displayable URL available
    return null;
  };

  const getDisplayImage = (album: Album): string | null => {
    // First try the assigned keyphoto if it's web accessible and NOT a HEIC file
    // (HEIC files can't be displayed in browsers, so skip them)
    if (hasKeyphoto(album.keyphoto) && isWebAccessibleUrl(album.keyphoto)) {
      const keyphotoLower = album.keyphoto!.toLowerCase();
      if (!keyphotoLower.endsWith('.heic') && !keyphotoLower.endsWith('.heif')) {
        return getWebCompatibleImageUrl(album.keyphoto);
      }
    }

    // Fall back to first web-accessible album asset if available
    if (album.album_assets && album.album_assets.length > 0) {
      // Filter for assets that can actually be displayed in browser
      const displayableAssets = album.album_assets.filter(asset => {
        // If has web_uri (JPEG conversion) that's not HEIC, it's displayable
        if (asset.web_uri && isWebAccessibleUrl(asset.web_uri) && !isHeicUrl(asset.web_uri)) return true;
        // If has thumbnail that's not HEIC, it's displayable
        if (asset.thumbnail_uri && isWebAccessibleUrl(asset.thumbnail_uri) && !isHeicUrl(asset.thumbnail_uri)) return true;
        // If asset_uri is web accessible and NOT HEIC, it's displayable
        if (asset.asset_uri && isWebAccessibleUrl(asset.asset_uri) && !isHeicUrl(asset.asset_uri)) return true;
        return false;
      });

      if (displayableAssets.length > 0) {
        const firstImage = displayableAssets.find(asset => asset.asset_type === 'image');
        const asset = firstImage || displayableAssets[0];
        // Use thumbnail for HEIC files
        return getWebCompatibleImageUrl(asset.asset_uri, {
          webUri: asset.web_uri,
          thumbnailUri: asset.thumbnail_uri
        });
      }
    }

    return null;
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'editor': return 'bg-orange-100 text-orange-800';
      case 'contributor': return 'bg-green-100 text-green-800';
      case 'read_only': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

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
        <h2 className="text-2xl font-bold text-gray-900">Albums Management</h2>
        <div className="flex items-center space-x-4">
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

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {albums.map(album => (
            <div
              key={album.id}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedAlbum(album)}
            >
              <div className="aspect-square bg-gray-100 rounded-t-lg overflow-hidden">
                {(() => {
                  const displayImage = getDisplayImage(album);
                  return displayImage && !failedImages.has(album.id) ? (
                    <img
                      src={displayImage}
                      alt={album.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      crossOrigin="anonymous"
                      onError={() => handleImageError(album.id, displayImage)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <span className="text-4xl">📷</span>
                    </div>
                  );
                })()}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 truncate flex-1">{album.title}</h3>
                  {album.isOwner ? (
                    <span className="flex-shrink-0 text-amber-500" title="You own this album">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516 11.209 11.209 0 01-7.877-3.08z" clipRule="evenodd" />
                      </svg>
                    </span>
                  ) : (
                    <span className="flex-shrink-0 text-blue-500" title={`Shared via ${album.shared_via?.map(s => s.circle_name).join(', ')}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z" clipRule="evenodd" />
                        <path d="M5.082 14.254a8.287 8.287 0 00-1.308 5.135 9.687 9.687 0 01-1.764-.44l-.115-.04a.563.563 0 01-.373-.487l-.01-.121a3.75 3.75 0 013.57-4.047zM20.226 19.389a8.287 8.287 0 00-1.308-5.135 3.75 3.75 0 013.57 4.047l-.01.121a.563.563 0 01-.373.486l-.115.04c-.567.2-1.156.349-1.764.441z" />
                      </svg>
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {album.album_assets?.length || 0} photos
                </p>
                {album.isOwner === false && album.shared_via && album.shared_via.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1">
                    via {album.shared_via.map(s => s.circle_name).join(', ')}
                  </p>
                )}
                {album.isOwner && album.album_shares && album.album_shares.filter(s => s.is_active).length > 0 && (
                  <div className="mt-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Shared with {album.album_shares.filter(s => s.is_active).length} circle(s)
                    </span>
                  </div>
                )}
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
                  Album
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Photos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sharing
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {albums.map(album => (
                <tr key={album.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-lg overflow-hidden">
                        {(() => {
                          const displayImage = getDisplayImage(album);
                          return displayImage && !failedImages.has(album.id) ? (
                            <img
                              src={displayImage}
                              alt={album.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              crossOrigin="anonymous"
                              onError={() => handleImageError(album.id, displayImage)}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <span className="text-lg">📷</span>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{album.title}</div>
                        {album.description && (
                          <div className="text-sm text-gray-500 truncate max-w-xs">
                            {album.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {album.isOwner ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516 11.209 11.209 0 01-7.877-3.08z" clipRule="evenodd" />
                        </svg>
                        Owner
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z" clipRule="evenodd" />
                        </svg>
                        Shared
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {album.album_assets?.length || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {album.isOwner ? (
                      album.album_shares && album.album_shares.filter(s => s.is_active).length > 0 ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {album.album_shares.filter(s => s.is_active).length} circle(s)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Not shared
                        </span>
                      )
                    ) : (
                      album.shared_via && album.shared_via.length > 0 ? (
                        <span className="text-xs text-blue-600">
                          via {album.shared_via.map(s => s.circle_name).join(', ')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">-</span>
                      )
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(album.date_created).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAlbum(album);
                        }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View
                      </button>
                      {album.isOwner && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAlbum(album);
                              setShowShareForm(true);
                            }}
                            className="text-green-600 hover:text-green-800"
                          >
                            Share
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAlbum(album.id);
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {albums.length === 0 && (
        <div className="text-center py-16">
          <div className="text-6xl mb-4 opacity-50">📁</div>
          <h3 className="text-2xl font-bold text-gray-700 mb-2">No Albums Found</h3>
          <p className="text-gray-500">Your albums will appear here when you create them.</p>
        </div>
      )}

      {/* Album Details Modal */}
      {selectedAlbum && !showShareForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-bold text-gray-900">{selectedAlbum.title}</h3>
                  {selectedAlbum.isOwner ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516 11.209 11.209 0 01-7.877-3.08z" clipRule="evenodd" />
                      </svg>
                      Owner
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z" clipRule="evenodd" />
                      </svg>
                      Shared with you
                    </span>
                  )}
                </div>
                {selectedAlbum.description && (
                  <p className="text-gray-600 mt-1">{selectedAlbum.description}</p>
                )}
                {selectedAlbum.isOwner === false && selectedAlbum.shared_via && selectedAlbum.shared_via.length > 0 && (
                  <p className="text-sm text-blue-600 mt-2">
                    via {selectedAlbum.shared_via.map(s => s.circle_name).join(', ')}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedAlbum(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Shared Circles - Only show for owners */}
            {selectedAlbum.isOwner && (
              <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold text-gray-900">Shared with Circles</h4>
                  <button
                    onClick={() => setShowShareForm(true)}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                  >
                    Share with Circle
                  </button>
                </div>
                <div className="space-y-2">
                  {selectedAlbum.album_shares?.filter(s => s.is_active).map(share => (
                    <div key={share.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <span className="font-medium">{share.circles.name}</span>
                        <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(share.role)}`}>
                          {share.role.replace('_', ' ')}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveShare(share.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  )) || []}
                  {selectedAlbum.album_shares?.filter(s => s.is_active).length === 0 && (
                    <p className="text-gray-500 text-sm">Not shared with any circles</p>
                  )}
                </div>
              </div>
            )}

            {/* Album Photos */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-gray-900">
                  Photos ({selectedAlbum.album_assets?.length || 0})
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowImageUploader(true)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <span>📱</span>
                    Upload New
                  </button>
                  <button
                    onClick={() => setShowPhotoPicker(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <span>📂</span>
                    Add Existing
                  </button>
                </div>
              </div>
              {selectedAlbum.album_assets && selectedAlbum.album_assets.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedAlbum.album_assets.map(asset => (
                    <div
                      key={asset.id}
                      className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform relative"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      {(asset.web_uri && isWebAccessibleUrl(asset.web_uri)) ||
                       (asset.thumbnail_uri && isWebAccessibleUrl(asset.thumbnail_uri)) ||
                       isWebAccessibleUrl(asset.asset_uri) ? (
                        <img
                          src={getWebCompatibleImageUrl(asset.asset_uri, {
                            webUri: asset.web_uri,
                            thumbnailUri: asset.thumbnail_uri
                          }) || ''}
                          alt="Album photo"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                          <div className="text-sm mb-0.5">
                            {asset.asset_type === 'video' ? '🎥' : '📸'}
                          </div>
                          <div className="text-[9px] text-center px-1">
                            {asset.asset_type === 'video' ? 'Video' : 'Image'}
                          </div>
                        </div>
                      )}
                      {asset.asset_type === 'video' && isWebAccessibleUrl(asset.asset_uri) && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-black/50 rounded-full p-1">
                            <span className="text-white text-xs">▶️</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4 opacity-50">📷</div>
                  <p className="text-gray-500 text-sm mb-6">No photos in this album yet</p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => setShowImageUploader(true)}
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <span>📱</span>
                      Upload from Camera Roll
                    </button>
                    <button
                      onClick={() => setShowPhotoPicker(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <span>📂</span>
                      Add from Other Albums
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share Album Modal */}
      {showShareForm && selectedAlbum && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Share {selectedAlbum.title}</h3>
            <form onSubmit={handleShareAlbum} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Circle
                </label>
                <select
                  name="circle_id"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a circle...</option>
                  {circles.map(circle => (
                    <option key={circle.id} value={circle.id}>
                      {circle.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  name="role"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="read_only">Read Only</option>
                  <option value="contributor">Contributor</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md font-medium transition-colors"
                >
                  Share Album
                </button>
                <button
                  type="button"
                  onClick={() => setShowShareForm(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-md font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Photo Picker Modal */}
      {showPhotoPicker && selectedAlbum && (
        <PhotoPicker
          targetAlbumId={selectedAlbum.id}
          onPhotosAdded={handlePhotosAdded}
          onClose={() => setShowPhotoPicker(false)}
        />
      )}

      {/* Image Uploader Modal */}
      {showImageUploader && selectedAlbum && (
        <ImageUploader
          targetAlbumId={selectedAlbum.id}
          onImagesUploaded={handleImagesUploaded}
          onClose={() => setShowImageUploader(false)}
        />
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
                {(selectedAsset.web_uri && isWebAccessibleUrl(selectedAsset.web_uri)) ||
                 (selectedAsset.thumbnail_uri && isWebAccessibleUrl(selectedAsset.thumbnail_uri)) ||
                 isWebAccessibleUrl(selectedAsset.asset_uri) ? (
                  selectedAsset.asset_type === 'image' ? (
                    <img
                      src={getWebCompatibleImageUrl(selectedAsset.asset_uri, {
                        webUri: selectedAsset.web_uri,
                        thumbnailUri: selectedAsset.thumbnail_uri
                      }) || ''}
                      alt="Full size"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    // For videos, show a placeholder with link
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                      <div className="text-6xl mb-4">🎥</div>
                      <div className="text-xl font-semibold mb-2">Video Playback</div>
                      <div className="text-sm text-center max-w-md">
                        Video playback in albums requires additional implementation.
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
                  From album: {selectedAlbum?.title || 'Unknown Album'}
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <div>
                    <span className="font-medium">Type:</span> {selectedAsset.asset_type}
                  </div>
                  <div>
                    <span className="font-medium">ID:</span> {selectedAsset.id}
                  </div>
                </div>
                
                <div className="mt-4 flex space-x-2">
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
    </div>
  );
};