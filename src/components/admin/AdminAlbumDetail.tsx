import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { MemoriesPanel } from '../MemoriesPanel';
import { memoriesApi } from '../../services/memoriesApi';
import { VideoPlayer } from '../VideoPlayer';
import { AlbumPhotoGrid, AlbumAsset, ContextMenuItem, getDisplayUrl } from '../AlbumPhotoGrid';
import { PhotoPicker } from './PhotoPicker';
import { ImageUploader } from './ImageUploader';

interface Album {
  id: string;
  title: string;
  description: string | null;
  keyphoto: string | null;
  user_id: string;
  isOwner?: boolean;
  shared_via?: { circle_id: string; circle_name: string; role: string }[];
  album_assets?: AlbumAsset[];
  album_shares?: { id: string; circle_id: string; role: string; is_active: boolean; circles: { id: string; name: string } }[];
}

interface Circle {
  id: string;
  name: string;
}

const getRoleColor = (role: string) => {
  switch (role) {
    case 'admin': return 'bg-purple-100 text-purple-800';
    case 'editor': return 'bg-blue-100 text-blue-800';
    case 'contributor': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

export const AdminAlbumDetail: React.FC = () => {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();

  const [album, setAlbum] = useState<Album | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AlbumAsset | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [showShareForm, setShowShareForm] = useState(false);
  const [shareCircleId, setShareCircleId] = useState('');
  const [shareRole, setShareRole] = useState('read_only');
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [showImageUploader, setShowImageUploader] = useState(false);
  const [memoryCounts, setMemoryCounts] = useState<Record<string, number>>({});
  const [memoriesAssetId, setMemoriesAssetId] = useState<string | null>(null);

  const fetchAlbum = useCallback(async () => {
    if (!albumId) return;
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/login'); return; }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?album_id=${albumId}`,
        { headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch album');

      setAlbum({ ...data.album, isOwner: data.isOwner, album_assets: data.assets });
      setEditedTitle(data.album.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load album');
    } finally {
      setLoading(false);
    }
  }, [albumId, navigate]);

  const fetchCircles = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-circles-api`,
        { headers: { 'Authorization': `Bearer ${session.access_token}` }, method: 'GET' }
      );
      const data = await response.json();
      if (data.circles) setCircles(data.circles);
    } catch (err) { console.error('Error fetching circles:', err); }
  };

  const loadMemoryCounts = useCallback(async () => {
    if (!album?.album_assets?.length) return;
    const counts = await memoriesApi.getMemoryCounts(album.album_assets.map(a => a.asset_id));
    setMemoryCounts(counts);
  }, [album?.album_assets]);

  useEffect(() => { fetchAlbum(); fetchCircles(); }, [fetchAlbum]);
  useEffect(() => { loadMemoryCounts(); }, [loadMemoryCounts]);

  const handleUpdateTitle = async () => {
    if (!album || !editedTitle.trim()) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: album.id, title: editedTitle.trim() })
      });
      if (response.ok) {
        setAlbum({ ...album, title: editedTitle.trim() });
        setIsEditingTitle(false);
      }
    } catch (err) { console.error('Error updating title:', err); }
  };

  const handleShareAlbum = async () => {
    if (!album || !shareCircleId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?action=share`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: album.id, circle_ids: [shareCircleId], role: shareRole })
      });
      setShowShareForm(false);
      setShareCircleId('');
      fetchAlbum();
    } catch (err) { console.error('Error sharing album:', err); }
  };

  const handleRemoveShare = async (shareId: string) => {
    if (!confirm('Remove this share?')) return;
    try {
      const { data: shareData } = await supabase.from('album_shares').select('circle_id').eq('id', shareId).single();
      if (!shareData || !album) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const remainingCircleIds = album.album_shares?.filter(s => s.id !== shareId && s.is_active).map(s => s.circle_id) || [];
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?action=share`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: album.id, circle_ids: remainingCircleIds, role: 'read_only' })
      });
      fetchAlbum();
    } catch (err) { console.error('Error removing share:', err); }
  };

  const handleRemovePhoto = async (assetId: string) => {
    if (!album || !confirm('Remove this photo from the album?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?album_id=${album.id}&action=remove_photo`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: assetId })
      });
      fetchAlbum();
    } catch (err) { console.error('Error removing photo:', err); }
  };

  const handleSetKeyPhoto = async (assetId: string) => {
    if (!album) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ album_id: album.id, keyphoto: assetId })
      });
      fetchAlbum();
    } catch (err) { console.error('Error setting key photo:', err); }
  };

  const contextMenuItems: ContextMenuItem[] = album?.isOwner ? [
    { label: 'Set as Key Photo', onClick: (asset) => handleSetKeyPhoto(asset.asset_id), color: 'blue' },
    { label: 'Remove from Album', onClick: (asset) => handleRemovePhoto(asset.asset_id), color: 'red' },
  ] : [];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  if (error || !album) return (
    <div className="text-center py-16">
      <div className="text-6xl mb-4">😕</div>
      <h3 className="text-xl font-bold text-gray-700 mb-2">Album Not Found</h3>
      <p className="text-gray-500 mb-4">{error}</p>
      <button onClick={() => navigate('/admin/albums')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Back to Albums</button>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin/albums')} className="text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              {album.isOwner && isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <input type="text" value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)}
                    className="text-2xl font-bold text-gray-900 border-b-2 border-blue-500 outline-none bg-transparent" autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateTitle(); if (e.key === 'Escape') setIsEditingTitle(false); }}
                  />
                  <button onClick={handleUpdateTitle} className="p-1 text-green-600 hover:text-green-800">✓</button>
                  <button onClick={() => setIsEditingTitle(false)} className="p-1 text-red-600 hover:text-red-800">✕</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900">{album.title}</h1>
                  {album.isOwner && (
                    <button onClick={() => { setEditedTitle(album.title); setIsEditingTitle(true); }} className="p-1 text-gray-400 hover:text-blue-600">✎</button>
                  )}
                </div>
              )}
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${album.isOwner ? 'bg-amber-100 text-amber-800' : getRoleColor(album.shared_via?.[0]?.role || 'read_only')}`}>
                {album.isOwner ? 'Owner' : (album.shared_via?.[0]?.role || 'read_only').replace('_', ' ')}
              </span>
            </div>
            {album.description && <p className="text-gray-600 mt-1">{album.description}</p>}
            {!album.isOwner && album.shared_via?.length && <p className="text-sm text-blue-600 mt-1">via {album.shared_via.map(s => s.circle_name).join(', ')}</p>}
          </div>
        </div>

        {album.isOwner && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowShareForm(true)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Share</button>
            <button onClick={() => setShowPhotoPicker(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Add from Library</button>
            <button onClick={() => setShowImageUploader(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Upload New</button>
          </div>
        )}
      </div>

      {/* Shared Circles */}
      {album.isOwner && album.album_shares?.filter(s => s.is_active).length ? (
        <div className="mb-6 bg-gray-50 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 mb-3">Shared with</h4>
          <div className="flex flex-wrap gap-2">
            {album.album_shares.filter(s => s.is_active).map(share => (
              <div key={share.id} className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border">
                <span className="font-medium text-sm">{share.circles.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoleColor(share.role)}`}>{share.role.replace('_', ' ')}</span>
                <button onClick={() => handleRemoveShare(share.id)} className="text-red-500 hover:text-red-700 ml-1">×</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* View Toggle */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-gray-900">Photos ({album.album_assets?.length || 0})</h4>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button onClick={() => setViewMode('grid')} className={`px-3 py-1 rounded text-sm font-medium ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}>Grid</button>
          <button onClick={() => setViewMode('carousel')} className={`px-3 py-1 rounded text-sm font-medium ${viewMode === 'carousel' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}>Carousel</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {album.album_assets?.length ? (
          viewMode === 'grid' ? (
            <AlbumPhotoGrid
              assets={album.album_assets}
              onAssetClick={setSelectedAsset}
              contextMenuItems={contextMenuItems}
              memoryCounts={memoryCounts}
              onMemoryClick={(id) => setMemoriesAssetId(id)}
            />
          ) : (
            <div className="relative h-[70vh] bg-black rounded-lg overflow-hidden">
              {album.album_assets[carouselIndex] && (
                <>
                  {album.album_assets[carouselIndex].asset_type === 'video' ? (
                    <VideoPlayer src={getDisplayUrl(album.album_assets[carouselIndex]) || ''} className="w-full h-full object-contain" />
                  ) : (
                    <img src={getDisplayUrl(album.album_assets[carouselIndex]) || ''} alt="" className="w-full h-full object-contain" />
                  )}
                  {carouselIndex > 0 && (
                    <button onClick={() => setCarouselIndex(carouselIndex - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                  )}
                  {carouselIndex < album.album_assets.length - 1 && (
                    <button onClick={() => setCarouselIndex(carouselIndex + 1)} className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  )}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm">{carouselIndex + 1} / {album.album_assets.length}</div>
                </>
              )}
            </div>
          )
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4 opacity-50">📷</div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">No Photos Yet</h3>
            {album.isOwner && (
              <div className="flex justify-center gap-3 mt-4">
                <button onClick={() => setShowPhotoPicker(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Add from Library</button>
                <button onClick={() => setShowImageUploader(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg">Upload New</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Asset Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={() => setSelectedAsset(null)}>
          <div className="relative max-w-5xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedAsset(null)} className="absolute -top-12 right-0 text-white text-3xl hover:text-gray-300">×</button>
            {selectedAsset.asset_type === 'video' ? (
              <VideoPlayer src={getDisplayUrl(selectedAsset) || ''} className="max-w-full max-h-[80vh] rounded-lg" />
            ) : (
              <img src={getDisplayUrl(selectedAsset) || ''} alt="" className="max-w-full max-h-[80vh] rounded-lg" />
            )}
            <div className="mt-4 flex justify-center gap-3">
              <button onClick={() => { setMemoriesAssetId(selectedAsset.asset_id); setSelectedAsset(null); }} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg">
                💬 Memories {memoryCounts[selectedAsset.asset_id] ? `(${memoryCounts[selectedAsset.asset_id]})` : ''}
              </button>
              {album.isOwner && (
                <>
                  <button onClick={() => { handleSetKeyPhoto(selectedAsset.asset_id); setSelectedAsset(null); }} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg">Set as Key Photo</button>
                  <button onClick={() => { handleRemovePhoto(selectedAsset.asset_id); setSelectedAsset(null); }} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg">Remove</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowShareForm(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">Share Album</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Circle</label>
                <select value={shareCircleId} onChange={(e) => setShareCircleId(e.target.value)} className="w-full border rounded-lg px-3 py-2">
                  <option value="">Choose a circle...</option>
                  {circles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={shareRole} onChange={(e) => setShareRole(e.target.value)} className="w-full border rounded-lg px-3 py-2">
                  <option value="read_only">View Only</option>
                  <option value="contributor">Contributor</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowShareForm(false)} className="px-4 py-2 text-gray-600">Cancel</button>
              <button onClick={handleShareAlbum} disabled={!shareCircleId} className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg">Share</button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Picker */}
      {showPhotoPicker && (
        <PhotoPicker
          targetAlbumId={album.id}
          onPhotosAdded={() => { setShowPhotoPicker(false); fetchAlbum(); }}
          onClose={() => setShowPhotoPicker(false)}
        />
      )}

      {/* Image Uploader */}
      {showImageUploader && (
        <ImageUploader
          targetAlbumId={album.id}
          onImagesUploaded={() => { setShowImageUploader(false); fetchAlbum(); }}
          onClose={() => setShowImageUploader(false)}
        />
      )}

      {/* Memories Panel */}
      {memoriesAssetId && (
        <MemoriesPanel assetId={memoriesAssetId} onClose={() => { setMemoriesAssetId(null); loadMemoryCounts(); }} />
      )}
    </div>
  );
};

export default AdminAlbumDetail;
