import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { PhotoPicker } from './PhotoPicker';
import { ImageUploader } from './ImageUploader';

interface Album {
  id: string;
  title: string;
  description: string | null;
  keyphoto: string | null;
  user_id: string;
  date_created: string;
  date_modified: string;
  profiles?: {
    full_name: string | null;
    email: string | null;
  };
  album_assets?: {
    id: string;
    asset_uri: string;
    asset_type: string;
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
    try {
      setLoading(true);
      // Load albums first
      const { data: albumsData, error: albumsError } = await supabase
        .from('albums')
        .select('*')
        .order('date_modified', { ascending: false });

      if (albumsError) throw albumsError;

      let enrichedAlbums = albumsData || [];

      if (albumsData && albumsData.length > 0) {
        // Load related data separately
        const albumIds = albumsData.map(album => album.id);
        const userIds = albumsData.map(album => album.user_id);

        // Load profiles
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);

        // Load album assets
        const { data: assetsData } = await supabase
          .from('album_assets')
          .select('id, album_id, asset_uri, asset_type')
          .in('album_id', albumIds);

        // Load album shares with circles
        const { data: sharesData } = await supabase
          .from('album_shares')
          .select(`
            id,
            album_id,
            circle_id,
            role,
            is_active,
            circles!inner(id, name)
          `)
          .in('album_id', albumIds);

        // Merge all data
        enrichedAlbums = albumsData.map(album => ({
          ...album,
          profiles: profilesData?.find(profile => profile.id === album.user_id) || null,
          album_assets: assetsData?.filter(asset => asset.album_id === album.id) || [],
          album_shares: sharesData?.filter(share => share.album_id === album.id) || []
        }));
      }

      setAlbums(enrichedAlbums);
      
      // Debug log keyphoto values
      enrichedAlbums.forEach(album => {
        const displayImage = getDisplayImage(album);
        console.log(`Album "${album.title}":`, {
          keyphoto: album.keyphoto,
          hasKeyphoto: hasKeyphoto(album.keyphoto),
          displayImage: displayImage,
          assetCount: album.album_assets?.length || 0
        });
      });
      
      setError(null); // Clear any previous errors on successful load
      setFailedImages(new Set()); // Reset failed images when data reloads
    } catch (err) {
      console.error('Error loading albums:', err);
      setError(err instanceof Error ? err.message : 'Failed to load albums');
    } finally {
      setLoading(false);
    }
  };

  const loadCircles = async () => {
    try {
      const { data, error } = await supabase
        .from('circles')
        .select('id, name, description')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setCircles(data || []);
    } catch (err) {
      console.error('Error loading circles:', err);
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
      const { error } = await supabase
        .from('albums')
        .update({ is_active: false })
        .eq('id', albumId);

      if (error) throw error;
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

  const getDisplayImage = (album: Album): string | null => {
    // First try the assigned keyphoto if it's web accessible
    if (hasKeyphoto(album.keyphoto) && isWebAccessibleUrl(album.keyphoto)) {
      return album.keyphoto;
    }
    
    // Fall back to first web-accessible album asset if available
    if (album.album_assets && album.album_assets.length > 0) {
      // Filter for web-accessible assets only
      const webAssets = album.album_assets.filter(asset => 
        asset.asset_uri && isWebAccessibleUrl(asset.asset_uri)
      );
      
      if (webAssets.length > 0) {
        const firstImage = webAssets.find(asset => asset.asset_type === 'image');
        return firstImage ? firstImage.asset_uri : webAssets[0].asset_uri;
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
                <h3 className="font-semibold text-gray-900 truncate">{album.title}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {album.album_assets?.length || 0} photos
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {album.profiles?.full_name || album.profiles?.email || 'Unknown user'}
                </p>
                {album.album_shares && album.album_shares.filter(s => s.is_active).length > 0 && (
                  <div className="mt-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Shared
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
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Photos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shared
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {album.profiles?.full_name || album.profiles?.email || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {album.album_assets?.length || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {album.album_shares && album.album_shares.filter(s => s.is_active).length > 0 ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {album.album_shares.filter(s => s.is_active).length} circles
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Not shared
                      </span>
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
                          setShowShareForm(true);
                        }}
                        className="text-blue-600 hover:text-blue-800"
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
          <p className="text-gray-500">Albums created by users will appear here.</p>
        </div>
      )}

      {/* Album Details Modal */}
      {selectedAlbum && !showShareForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{selectedAlbum.title}</h3>
                {selectedAlbum.description && (
                  <p className="text-gray-600 mt-1">{selectedAlbum.description}</p>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  By {selectedAlbum.profiles?.full_name || selectedAlbum.profiles?.email || 'Unknown user'}
                </p>
              </div>
              <button
                onClick={() => setSelectedAlbum(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Shared Circles */}
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
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {selectedAlbum.album_assets.map(asset => (
                    <div key={asset.id} className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                      {isWebAccessibleUrl(asset.asset_uri) ? (
                        <img
                          src={asset.asset_uri}
                          alt="Album photo"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                          <div className="text-2xl mb-1">📸</div>
                          <div className="text-xs text-center px-1">
                            Image not available in web view
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
    </div>
  );
};