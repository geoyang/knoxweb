import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PhotoPicker } from './PhotoPicker';
import { ImageUploader } from './ImageUploader';
import { adminApi } from '../../services/adminApi';
import { supabase } from '../../lib/supabase';
import { MemoriesPanel } from '../MemoriesPanel';
import { memoriesApi } from '../../services/memoriesApi';
import { AlbumPhotoGrid, AlbumAsset, ContextMenuItem, getThumbnailUrl, isWebAccessibleUrl, isHeicUrl, getDisplayUrl } from '../AlbumPhotoGrid';

interface Album {
  id: string;
  title: string;
  description: string | null;
  keyphoto: string | null;
  keyphoto_thumbnail?: string | null;  // Resolved thumbnail for keyphoto
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
    avatar_url?: string | null;
  };
  album_assets?: {
    id: string;
    asset_id: string;  // ID from assets table (for memories)
    asset_uri: string;
    asset_type: string;
    thumbnail_uri?: string;
    web_uri?: string;  // Web-compatible JPEG for HEIC files
    // Metadata fields
    created_at?: string;
    date_added?: string;
    location_name?: string;
    camera_make?: string;
    camera_model?: string;
    aperture?: number;
    iso?: number;
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
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState('');
  const [newAlbumDescription, setNewAlbumDescription] = useState('');
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Memories state
  const [memoriesAssetId, setMemoriesAssetId] = useState<string | null>(null);
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({});

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // Album detail view mode (grid vs carousel)
  const [albumDetailViewMode, setAlbumDetailViewMode] = useState<'grid' | 'carousel'>('grid');
  const [carouselIndex, setCarouselIndex] = useState(0);

  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.id) {
      loadAlbums();
      loadCircles();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  // Load memory counts when album is selected
  useEffect(() => {
    const loadMemoryCounts = async () => {
      if (!selectedAlbum || !selectedAlbum.album_assets || selectedAlbum.album_assets.length === 0) return;

      console.log('Album assets:', selectedAlbum.album_assets);
      const assetIds = selectedAlbum.album_assets.map(a => a.asset_id).filter(Boolean);
      console.log('Looking up memory counts for asset IDs:', assetIds);
      if (assetIds.length === 0) {
        console.log('No valid asset IDs found');
        return;
      }

      const counts = await memoriesApi.getMemoryCounts(assetIds);
      console.log('Memory counts:', counts);
      setMemoryCounts(counts);
    };

    loadMemoryCounts();
  }, [selectedAlbum]);

  const loadAlbums = async (): Promise<Album[]> => {
    if (!user?.id) {
      console.warn('No user ID available for filtering albums');
      setAlbums([]);
      setLoading(false);
      return [];
    }

    try {
      setLoading(true);
      setError(null);

      // Check authentication state first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        console.error('Authentication issue:', sessionError);
        await signOut();
        navigate('/login');
        return [];
      }

      const result = await adminApi.getAlbums();

      if (!result.success) {
        if (result.isAuthError) {
          await signOut();
          navigate('/login');
          return [];
        }
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
      return enrichedAlbums;
    } catch (err) {
      console.error('Error loading albums:', err);
      setError(err instanceof Error ? err.message : 'Failed to load albums');
      return [];
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

      if (!result.success) {
        if (result.isAuthError) {
          await signOut();
          navigate('/login');
          return;
        }
        console.error('Error loading circles:', adminApi.handleApiError(result));
        setCircles([]);
        return;
      }
      setCircles(result.data?.circles || []);
    } catch (err) {
      console.error('Error loading circles:', err);
      setCircles([]);
    }
  };

  const handleUpdateAlbumTitle = async () => {
    if (!selectedAlbum || !editedTitle.trim()) return;

    try {
      const result = await adminApi.updateAlbum({ album_id: selectedAlbum.id, title: editedTitle.trim() });

      if (!result.success) {
        if (result.isAuthError) {
          await signOut();
          navigate('/login');
          return;
        }
        throw new Error(adminApi.handleApiError(result));
      }

      // Update local state
      setSelectedAlbum({ ...selectedAlbum, title: editedTitle.trim() });
      setIsEditingTitle(false);
      await loadAlbums();
    } catch (err) {
      console.error('Error updating album title:', err);
      setError(err instanceof Error ? err.message : 'Failed to update album title');
    }
  };

  const handleShareAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlbum) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    try {
      const circleId = formData.get('circle_id') as string;
      const role = formData.get('role') as string;

      // Get current session for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Get existing shares for this album to build the new circle_ids array
      const { data: existingShares } = await supabase
        .from('album_shares')
        .select('circle_id')
        .eq('album_id', selectedAlbum.id)
        .eq('is_active', true);

      const existingCircleIds = (existingShares || []).map(s => s.circle_id);
      const newCircleIds = [...new Set([...existingCircleIds, circleId])];

      // Call edge function to handle sharing
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?action=share`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            album_id: selectedAlbum.id,
            circle_ids: newCircleIds,
            role: role,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to share album');
      }

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
    if (!selectedAlbum) return;

    try {
      // Get current session for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Get the circle_id of the share being removed
      const { data: shareToRemove } = await supabase
        .from('album_shares')
        .select('circle_id')
        .eq('id', shareId)
        .single();

      if (!shareToRemove) throw new Error('Share not found');

      // Get all current active shares except the one being removed
      const { data: existingShares } = await supabase
        .from('album_shares')
        .select('circle_id')
        .eq('album_id', selectedAlbum.id)
        .eq('is_active', true);

      const remainingCircleIds = (existingShares || [])
        .map(s => s.circle_id)
        .filter(id => id !== shareToRemove.circle_id);

      // Call edge function to update sharing
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?action=share`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            album_id: selectedAlbum.id,
            circle_ids: remainingCircleIds,
            role: 'read_only',
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to remove share');
      }

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
        if (result.isAuthError) {
          await signOut();
          navigate('/login');
          return;
        }
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

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumTitle.trim()) return;

    setCreatingAlbum(true);
    setError(null);

    try {
      const result = await adminApi.createAlbum({
        title: newAlbumTitle.trim(),
        description: newAlbumDescription.trim() || undefined
      });

      if (!result.success) {
        if (result.isAuthError) {
          await signOut();
          navigate('/login');
          return;
        }
        throw new Error(adminApi.handleApiError(result));
      }

      // Reset form and close modal
      setNewAlbumTitle('');
      setNewAlbumDescription('');
      setShowCreateAlbum(false);

      // Reload albums to show the new one
      await loadAlbums();
    } catch (err) {
      console.error('Error creating album:', err);
      setError(err instanceof Error ? err.message : 'Failed to create album');
    } finally {
      setCreatingAlbum(false);
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
    const freshAlbums = await loadAlbums();
    // If we have a selected album, refresh it to show new photos
    if (selectedAlbum) {
      const updatedAlbum = freshAlbums.find(album => album.id === selectedAlbum.id);
      if (updatedAlbum) {
        setSelectedAlbum(updatedAlbum);
      }
    }
  };

  const handleImagesUploaded = async (count: number) => {
    console.log(`Uploaded ${count} new images to album`);
    setShowImageUploader(false);
    // Reload albums to get updated asset counts
    const freshAlbums = await loadAlbums();
    // If we have a selected album, refresh it to show new photos
    if (selectedAlbum) {
      const updatedAlbum = freshAlbums.find(album => album.id === selectedAlbum.id);
      if (updatedAlbum) {
        setSelectedAlbum(updatedAlbum);
      }
    }
  };

  const hasKeyphoto = (url: string | null): boolean => {
    return !!(url && url.trim() !== '');
  };

  // Check if user can edit this album (owner or editor role)
  const canEditAlbum = (album: Album): boolean => {
    if (album.isOwner) return true;
    // Check if user has editor or admin role via shared_via
    const editRoles = ['editor', 'admin'];
    return album.shared_via?.some(share => editRoles.includes(share.role)) || false;
  };

  // Remove asset from album (doesn't delete the image from vault)
  const handleRemoveFromAlbum = async (assetId: string) => {
    if (!selectedAlbum) return;

    try {
      const { error } = await supabase
        .from('album_assets')
        .delete()
        .eq('id', assetId)
        .eq('album_id', selectedAlbum.id);

      if (error) throw error;

      // Update local state
      setSelectedAlbum(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          album_assets: prev.album_assets?.filter(a => a.id !== assetId)
        };
      });

      await loadAlbums();
    } catch (err) {
      console.error('Error removing from album:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove from album');
    }
  };

  // Set asset as key photo for album
  const handleSetAsKeyPhoto = async (asset: NonNullable<Album['album_assets']>[0]) => {
    if (!selectedAlbum) return;

    try {
      // Store the asset_id as the key photo reference
      const { error } = await supabase
        .from('albums')
        .update({
          keyphoto: asset.asset_id,
        })
        .eq('id', selectedAlbum.id)
        .eq('user_id', user!.id);

      if (error) throw error;

      // Update local state
      setSelectedAlbum(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          keyphoto: asset.asset_id,
          keyphoto_thumbnail: asset.thumbnail_uri || null,
        };
      });

      await loadAlbums();
    } catch (err) {
      console.error('Error setting key photo:', err);
      setError(err instanceof Error ? err.message : 'Failed to set key photo');
    }
  };

  // Using isWebAccessibleUrl and isHeicUrl from shared AlbumPhotoGrid component

  // Get web-compatible image URL
  // Priority: base64 thumbnail > web_uri (JPEG) > thumbnail_uri (URL) > original (if not HEIC)
  const getWebCompatibleImageUrl = (
    url: string | null,
    options?: { webUri?: string | null; thumbnailUri?: string | null }
  ): string | null => {
 
    // If web_uri is available and not HEIC, use it
    if (options?.webUri && isWebAccessibleUrl(options.webUri) && !isHeicUrl(options.webUri)) {
      return options.webUri;
    }

    // If original URL is available and not HEIC, use it
    if (url && isWebAccessibleUrl(url) && !isHeicUrl(url)) {
      return url;
    }

  
    // If thumbnail is base64 data URI, use it first (most reliable)
    if (options?.thumbnailUri && options.thumbnailUri.startsWith('data:')) {
      return options.thumbnailUri;
    }

    // If thumbnail is a URL (not base64) and not HEIC, use it
    if (options?.thumbnailUri && isWebAccessibleUrl(options.thumbnailUri) && !isHeicUrl(options.thumbnailUri)) {
      return options.thumbnailUri;
    }

  
    // No displayable URL available
    return null;
  };
  
    // Get web-compatible image URL
  // Priority: base64 thumbnail > web_uri (JPEG) > thumbnail_uri (URL) > original (if not HEIC)
  const getThumbnail = (
    url: string | null,
    options?: { webUri?: string | null; thumbnailUri?: string | null }
  ): string | null => {
    // If thumbnail is base64 data URI, use it first (most reliable)
    if (options?.thumbnailUri && options.thumbnailUri.startsWith('data:')) {
      return options.thumbnailUri;
    }

    // If web_uri is available and not HEIC, use it
    if (options?.webUri && isWebAccessibleUrl(options.webUri) && !isHeicUrl(options.webUri)) {
      return options.webUri;
    }

    // If thumbnail is a URL (not base64) and not HEIC, use it
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
    // First try keyphoto_thumbnail - check if it's base64 data URI
    if (album.keyphoto_thumbnail?.startsWith('data:')) {
      return album.keyphoto_thumbnail;
    }

    // Then try keyphoto_thumbnail as URL
    if (album.keyphoto_thumbnail && isWebAccessibleUrl(album.keyphoto_thumbnail) && !isHeicUrl(album.keyphoto_thumbnail)) {
      return album.keyphoto_thumbnail;
    }

    // Try the keyphoto if it's web accessible and NOT a HEIC file
    if (hasKeyphoto(album.keyphoto) && isWebAccessibleUrl(album.keyphoto) && !isHeicUrl(album.keyphoto)) {
      return album.keyphoto;
    }

    // Fall back to first web-accessible album asset if available
    if (album.album_assets && album.album_assets.length > 0) {
      // Filter for assets that can actually be displayed in browser
      const displayableAssets = album.album_assets.filter(asset => {
        // If has base64 thumbnail, it's displayable
        if (asset.thumbnail_uri?.startsWith('data:')) return true;
        // If has web_uri (JPEG conversion) that's not HEIC, it's displayable
        if (asset.web_uri && isWebAccessibleUrl(asset.web_uri) && !isHeicUrl(asset.web_uri)) return true;
        // If has thumbnail that's not HEIC, it's displayable
        if (asset.thumbnail_uri && isWebAccessibleUrl(asset.thumbnail_uri) && !isHeicUrl(asset.thumbnail_uri)) return true;
        // If asset_uri is web accessible and NOT HEIC, it's displayable
        if (asset.asset_uri && isWebAccessibleUrl(asset.asset_uri) && !isHeicUrl(asset.asset_uri)) return true;
        return false;
      });

      if (displayableAssets.length > 0) {
        const firstImage = displayableAssets.find(asset => asset.asset_type !== 'video');
        const asset = firstImage || displayableAssets[0];
        // Use thumbnail for HEIC files - base64 thumbnail is now prioritized in getWebCompatibleImageUrl
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
        <div className="spinner w-12 h-12"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-theme-primary">Albums</h2>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowCreateAlbum(true)}
            className="btn-primary flex items-center gap-2"
          >
            <span>+</span>
            Create Album
          </button>
          <div className="toggle-group flex">
            <button
              onClick={() => setViewMode('grid')}
              className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert-error">
          {error}
        </div>
      )}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {albums.map(album => (
            <div
              key={album.id}
              className="card hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(`/admin/albums/${album.id}`)}
            >
              <div className="aspect-square bg-surface-elevated rounded-t-lg overflow-hidden flex items-center justify-center">
                {(() => {
                  const displayImage = getDisplayImage(album);
                  return (
                    <div className="relative flex items-center justify-center w-full h-full">
                      {displayImage && !failedImages.has(album.id) ? (
                        <img
                          src={displayImage}
                          alt={album.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          crossOrigin="anonymous"
                          onError={() => handleImageError(album.id, displayImage)}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-indigo-50 to-slate-100 dark:from-indigo-900/20 dark:to-slate-800 flex items-center justify-center">
                          <i className="fi fi-sr-images text-5xl text-indigo-300 dark:text-indigo-600"></i>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <h3 className="font-semibold text-theme-primary truncate flex-1 text-sm">{album.title}</h3>
                  {album.isOwner ? (
                    <span className="flex-shrink-0 badge-warning text-[10px] py-0.5 px-1.5 inline-flex items-center gap-0.5">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
                        <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516 11.209 11.209 0 01-7.877-3.08z" clipRule="evenodd" />
                      </svg>
                      Owner
                    </span>
                  ) : (
                    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getRoleColor(album.shared_via?.[0]?.role || 'read_only')}`}>
                      {(album.shared_via?.[0]?.role || 'read_only').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  )}
                </div>
                <p className="text-xs text-theme-muted">
                  {album.album_assets?.length || 0} photos • {new Date(album.date_created).toLocaleDateString()}
                </p>
                {album.isOwner === false && album.shared_via && album.shared_via.length > 0 && (
                  <p className="text-[10px] text-theme-accent mt-0.5 truncate">
                    via {album.shared_via.map(s => s.circle_name).join(', ')}
                  </p>
                )}
                {/* Owner info for shared albums */}
                {album.isOwner === false && album.profiles && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {album.profiles.avatar_url ? (
                      <img
                        src={album.profiles.avatar_url}
                        alt={album.profiles.full_name || 'Owner'}
                        className="w-4 h-4 rounded-full object-cover"
                      />
                    ) : (
                      <div className="avatar w-4 h-4 text-[8px]">
                        {(album.profiles.full_name || album.profiles.email || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <span className="text-[10px] text-theme-muted truncate">
                      {album.profiles.full_name || album.profiles.email || 'Unknown'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full">
            <thead className="table-header">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">
                  Album
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">
                  Photos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">
                  Sharing
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-theme-secondary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {albums.map(album => (
                <tr key={album.id} className="table-row">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-surface-elevated rounded-lg overflow-hidden">
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
                            <div className="w-full h-full flex items-center justify-center text-theme-muted">
                              <span className="text-lg">📷</span>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-theme-primary">{album.title}</div>
                        {album.description && (
                          <div className="text-sm text-theme-secondary truncate max-w-xs">
                            {album.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {album.isOwner ? (
                      <span className="badge-warning inline-flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516 11.209 11.209 0 01-7.877-3.08z" clipRule="evenodd" />
                        </svg>
                        Owner
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(album.shared_via?.[0]?.role || 'read_only')}`}>
                        {(album.shared_via?.[0]?.role || 'read_only').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-primary">
                    {album.album_assets?.length || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {album.isOwner ? (
                      album.album_shares && album.album_shares.filter(s => s.is_active).length > 0 ? (
                        <span className="badge-success">
                          {album.album_shares.filter(s => s.is_active).length} circle(s)
                        </span>
                      ) : (
                        <span className="badge-primary">
                          Not shared
                        </span>
                      )
                    ) : (
                      <div className="space-y-1">
                        {album.shared_via && album.shared_via.length > 0 && (
                          <span className="text-xs text-theme-accent block">
                            via {album.shared_via.map(s => s.circle_name).join(', ')}
                          </span>
                        )}
                        {album.profiles && (
                          <div className="flex items-center gap-1.5">
                            {album.profiles.avatar_url ? (
                              <img
                                src={album.profiles.avatar_url}
                                alt={album.profiles.full_name || 'Owner'}
                                className="w-5 h-5 rounded-full object-cover"
                              />
                            ) : (
                              <div className="avatar w-5 h-5 text-[10px]">
                                {(album.profiles.full_name || album.profiles.email || '?')[0].toUpperCase()}
                              </div>
                            )}
                            <span className="text-xs text-theme-muted">
                              {album.profiles.full_name || album.profiles.email || 'Unknown'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-theme-muted">
                    {new Date(album.date_created).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/albums/${album.id}`);
                        }}
                        className="link-primary"
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
                            className="link-success"
                          >
                            Share
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAlbum(album.id);
                            }}
                            className="link-danger"
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
        <div className="empty-state">
          <div className="empty-state-icon">📁</div>
          <h3 className="empty-state-title">No Albums Found</h3>
          <p className="empty-state-text">Your albums will appear here when you create them.</p>
        </div>
      )}

      {/* Album Details Modal */}
      {selectedAlbum && !showShareForm && (
        <div className="modal-overlay items-start pt-4 overflow-y-auto">
          <div className="modal-content p-6 w-full max-w-[95vw] xl:max-w-7xl mb-4 mx-4">
            <div className="flex justify-between items-start mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  {/* Editable title for owners */}
                  {selectedAlbum.isOwner && isEditingTitle ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="text-2xl font-bold text-theme-primary border-b-2 border-default focus:border-focus outline-none bg-transparent"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateAlbumTitle();
                          if (e.key === 'Escape') setIsEditingTitle(false);
                        }}
                      />
                      <button
                        onClick={handleUpdateAlbumTitle}
                        className="p-1 text-green-600 hover:text-green-800"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setIsEditingTitle(false)}
                        className="p-1 text-red-600 hover:text-red-800"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="text-2xl font-bold text-theme-primary">{selectedAlbum.title}</h3>
                      {selectedAlbum.isOwner && (
                        <button
                          onClick={() => {
                            setEditedTitle(selectedAlbum.title);
                            setIsEditingTitle(true);
                          }}
                          className="p-1 text-theme-muted hover:text-theme-accent"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                  {selectedAlbum.isOwner ? (
                    <span className="badge-warning inline-flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516 11.209 11.209 0 01-7.877-3.08z" clipRule="evenodd" />
                      </svg>
                      Owner
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(selectedAlbum.shared_via?.[0]?.role || 'read_only')}`}>
                      {(selectedAlbum.shared_via?.[0]?.role || 'read_only').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  )}
                </div>
                {selectedAlbum.description && (
                  <p className="text-theme-secondary mt-1">{selectedAlbum.description}</p>
                )}
                {selectedAlbum.isOwner === false && selectedAlbum.shared_via && selectedAlbum.shared_via.length > 0 && (
                  <p className="text-sm text-theme-accent mt-2">
                    via {selectedAlbum.shared_via.map(s => s.circle_name).join(', ')}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedAlbum(null);
                  setIsEditingTitle(false);
                  setAlbumDetailViewMode('grid');
                  setCarouselIndex(0);
                }}
                className="text-theme-muted hover:text-theme-secondary text-2xl"
              >
                ×
              </button>
            </div>

            {/* Shared Circles - Only show for owners */}
            {selectedAlbum.isOwner && (
              <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-semibold text-theme-primary">Shared with Circles</h4>
                  <button
                    onClick={() => setShowShareForm(true)}
                    className="btn-primary text-sm py-1 px-3"
                  >
                    Share with Circle
                  </button>
                </div>
                <div className="space-y-2">
                  {selectedAlbum.album_shares?.filter(s => s.is_active).map(share => (
                    <div key={share.id} className="flex items-center justify-between p-3 bg-surface-elevated rounded-lg">
                      <div>
                        <span className="font-medium">{share.circles.name}</span>
                        <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(share.role)}`}>
                          {share.role.replace('_', ' ')}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveShare(share.id)}
                        className="link-danger text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  )) || []}
                  {selectedAlbum.album_shares?.filter(s => s.is_active).length === 0 && (
                    <p className="text-theme-muted text-sm">Not shared with any circles</p>
                  )}
                </div>
              </div>
            )}

            {/* Album Photos */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <h4 className="font-semibold text-theme-primary">
                    Photos ({selectedAlbum.album_assets?.length || 0})
                  </h4>
                  {/* View mode toggle */}
                  <div className="toggle-group flex">
                    <button
                      onClick={() => setAlbumDetailViewMode('grid')}
                      className={`toggle-btn ${albumDetailViewMode === 'grid' ? 'active text-theme-accent' : ''}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setAlbumDetailViewMode('carousel')}
                      className={`toggle-btn ${albumDetailViewMode === 'carousel' ? 'active text-theme-accent' : ''}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowImageUploader(true)}
                    className="btn-primary flex items-center gap-2"
                  >
                    <span>📱</span>
                    Upload New
                  </button>
                  <button
                    onClick={() => setShowPhotoPicker(true)}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <span>📂</span>
                    Add Existing
                  </button>
                </div>
              </div>
              {selectedAlbum.album_assets && selectedAlbum.album_assets.length > 0 ? (
                albumDetailViewMode === 'grid' ? (
                <AlbumPhotoGrid
                  assets={selectedAlbum.album_assets.map(a => ({
                    ...a,
                    asset_type: a.asset_type as 'image' | 'video' | 'photo'
                  }))}
                  onAssetClick={(asset) => setSelectedAsset(asset as NonNullable<Album['album_assets']>[0])}
                  memoryCounts={memoryCounts}
                  onMemoryClick={(assetId) => setMemoriesAssetId(assetId)}
                  showMetadataOnHover={true}
                  gridSize="large"
                  contextMenuItems={canEditAlbum(selectedAlbum) ? [
                    {
                      label: 'Set as Key Photo',
                      icon: '⭐',
                      color: 'blue',
                      onClick: (asset) => handleSetAsKeyPhoto(asset as NonNullable<Album['album_assets']>[0])
                    },
                    {
                      label: 'Remove from Album',
                      icon: '🗑️',
                      color: 'red',
                      onClick: (asset) => handleRemoveFromAlbum(asset.id)
                    }
                  ] : []}
                  showDownload={true}
                  showInfo={true}
                  showMemories={true}
                  onShowMemories={(asset) => setMemoriesAssetId(asset.asset_id)}
                />
                ) : (
                  /* Carousel View */
                  <div className="relative bg-black rounded-lg overflow-hidden" style={{ height: '60vh' }}>
                    {selectedAlbum.album_assets && selectedAlbum.album_assets[carouselIndex] && (
                      <>
                        <img
                          src={selectedAlbum.album_assets[carouselIndex].web_uri ||
                               selectedAlbum.album_assets[carouselIndex].asset_uri || ''}
                          alt="Album photo"
                          className="w-full h-full object-contain"
                          onClick={() => setSelectedAsset(selectedAlbum.album_assets![carouselIndex])}
                        />
                        {/* Memory indicator and add button - top right */}
                        <div className="absolute top-4 right-4 flex items-center gap-2">
                          {memoryCounts[selectedAlbum.album_assets[carouselIndex].asset_id] > 0 && (
                            <button
                              onClick={() => setMemoriesAssetId(selectedAlbum.album_assets![carouselIndex].asset_id)}
                              className="bg-black/60 hover:bg-black/80 text-white px-3 py-2 rounded-full flex items-center gap-2 transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              <span className="font-medium">{memoryCounts[selectedAlbum.album_assets[carouselIndex].asset_id]}</span>
                            </button>
                          )}
                          <button
                            onClick={() => setMemoriesAssetId(selectedAlbum.album_assets![carouselIndex].asset_id)}
                            className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-full transition-colors"
                            title="Add memory"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                        {/* Navigation arrows */}
                        {carouselIndex > 0 && (
                          <button
                            onClick={() => setCarouselIndex(carouselIndex - 1)}
                            className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                        )}
                        {carouselIndex < (selectedAlbum.album_assets?.length || 0) - 1 && (
                          <button
                            onClick={() => setCarouselIndex(carouselIndex + 1)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        )}
                        {/* Carousel indicator */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm font-medium">
                          {carouselIndex + 1} / {selectedAlbum.album_assets?.length || 0}
                        </div>
                      </>
                    )}
                  </div>
                )
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
          className="fixed inset-0 bg-black/90 flex items-start justify-center z-50 p-4 pt-8 overflow-y-auto"
          onClick={() => setSelectedAsset(null)}
        >
          <div className="relative max-w-4xl w-full mb-8" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedAsset(null)}
              className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white text-xl w-8 h-8 rounded-full flex items-center justify-center"
            >
              ×
            </button>

            <div className="bg-white rounded-lg overflow-hidden">
              <div className="aspect-video bg-gray-100">
                {(() => {
                  // Debug logging
                  console.log('Selected asset:', {
                    id: selectedAsset.id,
                    asset_type: selectedAsset.asset_type,
                    asset_uri: selectedAsset.asset_uri,
                    web_uri: selectedAsset.web_uri,
                    thumbnail_uri: selectedAsset.thumbnail_uri,
                  });

                  const hasWebAccessibleUrl =
                    (selectedAsset.web_uri && isWebAccessibleUrl(selectedAsset.web_uri)) ||
                    (selectedAsset.thumbnail_uri && isWebAccessibleUrl(selectedAsset.thumbnail_uri)) ||
                    isWebAccessibleUrl(selectedAsset.asset_uri);

                  // Determine if this is a video based on asset_type OR file extension
                  const isVideo = selectedAsset.asset_type === 'video' ||
                    selectedAsset.asset_uri?.toLowerCase().match(/\.(mp4|mov|avi|webm|mkv)$/);

                  console.log('Is video?', isVideo, 'Has web URL?', hasWebAccessibleUrl);

                  if (hasWebAccessibleUrl && !isVideo) {
                    // Show image
                    const imageUrl = getWebCompatibleImageUrl(selectedAsset.asset_uri, {
                      webUri: selectedAsset.web_uri,
                      thumbnailUri: selectedAsset.thumbnail_uri
                    });
                    console.log('Displaying image with URL:', imageUrl);
                    return (
                      <img
                        src={imageUrl || ''}
                        alt="Full size"
                        className="w-full h-full object-contain mt-[10px]"
                      />
                    );
                  } else if (hasWebAccessibleUrl && isVideo) {
                    // Show video player
                    return (
                      <video
                        src={selectedAsset.web_uri || selectedAsset.asset_uri}
                        controls
                        autoPlay
                        className="w-full h-full object-contain mt-[10px] bg-black rounded-lg"
                      >
                        Your browser does not support the video tag.
                      </video>
                    );
                  } else {
                    return null; // Fall through to "Not Available" below
                  }
                })() || (
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
                    <span className="font-medium">Type:</span> {selectedAsset.asset_type || 'unknown'}
                  </div>
                  <div>
                    <span className="font-medium">ID:</span> {selectedAsset.id}
                  </div>
                </div>

                <div className="mt-4 flex space-x-2">
                  {/* Memories button */}
                  <button
                    onClick={() => setMemoriesAssetId(selectedAsset.asset_id)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Memories
                    {memoryCounts[selectedAsset.asset_id] > 0 && (
                      <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">
                        {memoryCounts[selectedAsset.asset_id]}
                      </span>
                    )}
                  </button>

                  {isHeicUrl(selectedAsset.asset_uri) ? (
                    <a
                      href={selectedAsset.asset_uri}
                      download
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Download Original (HEIC)
                    </a>
                  ) : (
                    <a
                      href={selectedAsset.asset_uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Open Original
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Album Modal */}
      {showCreateAlbum && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Create New Album</h3>
              <button
                onClick={() => {
                  setShowCreateAlbum(false);
                  setNewAlbumTitle('');
                  setNewAlbumDescription('');
                  setError(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateAlbum} className="p-6 space-y-4">
              <div>
                <label htmlFor="albumTitle" className="block text-sm font-medium text-gray-700 mb-1">
                  Album Title *
                </label>
                <input
                  type="text"
                  id="albumTitle"
                  value={newAlbumTitle}
                  onChange={(e) => setNewAlbumTitle(e.target.value)}
                  placeholder="Enter album title"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="albumDescription" className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  id="albumDescription"
                  value={newAlbumDescription}
                  onChange={(e) => setNewAlbumDescription(e.target.value)}
                  placeholder="Enter album description"
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateAlbum(false);
                    setNewAlbumTitle('');
                    setNewAlbumDescription('');
                    setError(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingAlbum || !newAlbumTitle.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-md transition-colors flex items-center gap-2"
                >
                  {creatingAlbum ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Creating...
                    </>
                  ) : (
                    'Create Album'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Memories Panel */}
      {memoriesAssetId && (
        <MemoriesPanel
          assetId={memoriesAssetId}
          onClose={() => setMemoriesAssetId(null)}
          onMemoriesUpdated={async () => {
            // Refresh memory count for this asset
            const result = await memoriesApi.getMemoryCount(memoriesAssetId);
            if (result.data) {
              setMemoryCounts(prev => ({
                ...prev,
                [memoriesAssetId]: result.data!.count
              }));
            }
          }}
        />
      )}
    </div>
  );
};