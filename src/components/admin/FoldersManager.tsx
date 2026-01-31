import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getFolders,
  getFolderDetail,
  createFolder,
  updateFolder,
  deleteFolder,
  addItemToFolder,
  removeItemFromFolder,
  shareFolderWithCircles,
  uploadDocumentFile,
  isMediaFile,
  getFileIcon,
  Folder,
  FolderItem,
  FolderShare,
} from '../../services/foldersApi';
import { adminApi } from '../../services/adminApi';
import { MediaViewer } from '../MediaViewer';
import { ImageUploader } from './ImageUploader';

interface Circle {
  id: string;
  name: string;
}

export const FoldersManager: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [folderItems, setFolderItems] = useState<FolderItem[]>([]);
  const [folderShares, setFolderShares] = useState<FolderShare[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showAllFolders, setShowAllFolders] = useState(false);

  // Modal states
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddItemsModal, setShowAddItemsModal] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCreateSubfolder, setShowCreateSubfolder] = useState(false);

  // Albums for adding to folder
  const [availableAlbums, setAvailableAlbums] = useState<any[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(false);

  // Subfolder form
  const [subfolderTitle, setSubfolderTitle] = useState('');
  const [subfolderDescription, setSubfolderDescription] = useState('');

  // Document upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  // Document viewer
  const [viewingDocument, setViewingDocument] = useState<FolderItem | null>(null);

  // Asset viewer
  const [viewingAsset, setViewingAsset] = useState<FolderItem | null>(null);

  // Media upload
  const [showMediaUploader, setShowMediaUploader] = useState(false);
  const [mediaUploaderFiles, setMediaUploaderFiles] = useState<File[] | undefined>(undefined);
  const selectedFolderRef = useRef<Folder | null>(null);

  // Drag-and-drop
  const [isDragOver, setIsDragOver] = useState(false);

  // Form states
  const [newFolderTitle, setNewFolderTitle] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [selectedCircleIds, setSelectedCircleIds] = useState<string[]>([]);
  const [shareRole, setShareRole] = useState('read_only');

  const [isOwner, setIsOwner] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Keep ref in sync so async callbacks always see the latest folder
  useEffect(() => {
    selectedFolderRef.current = selectedFolder;
  }, [selectedFolder]);

  useEffect(() => {
    if (user?.id) {
      loadFolders();
      loadCircles();
    }
  }, [user?.id, showAllFolders]);

  const loadFolders = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getFolders(showAllFolders);
      setFolders(result.folders);
    } catch (err) {
      console.error('Error loading folders:', err);
      setError(err instanceof Error ? err.message : 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  };

  const loadCircles = async () => {
    try {
      const result = await adminApi.getCircles();
      if (result.success && result.data?.circles) {
        setCircles(result.data.circles);
      }
    } catch (err) {
      console.error('Error loading circles:', err);
    }
  };

  const loadFolderDetail = async (folderId: string) => {
    try {
      setError(null);
      const result = await getFolderDetail(folderId);
      setSelectedFolder(result.folder);
      setFolderItems(result.items);
      setFolderShares(result.shares);
      setIsOwner(result.isOwner);
      setUserRole(result.userRole);
    } catch (err) {
      console.error('Error loading folder detail:', err);
      setError(err instanceof Error ? err.message : 'Failed to load folder details');
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderTitle.trim()) return;

    try {
      setError(null);
      await createFolder({
        title: newFolderTitle.trim(),
        description: newFolderDescription.trim() || undefined,
      });
      setNewFolderTitle('');
      setNewFolderDescription('');
      setShowCreateFolder(false);
      await loadFolders();
    } catch (err) {
      console.error('Error creating folder:', err);
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    }
  };

  const handleUpdateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolder || !editTitle.trim()) return;

    try {
      setError(null);
      await updateFolder({
        folder_id: selectedFolder.id,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
      });
      setShowEditModal(false);
      await loadFolderDetail(selectedFolder.id);
      await loadFolders();
    } catch (err) {
      console.error('Error updating folder:', err);
      setError(err instanceof Error ? err.message : 'Failed to update folder');
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('Are you sure you want to delete this folder? This action cannot be undone.')) return;

    try {
      setError(null);
      await deleteFolder(folderId);
      if (selectedFolder?.id === folderId) {
        setSelectedFolder(null);
        setFolderItems([]);
        setFolderShares([]);
      }
      await loadFolders();
    } catch (err) {
      console.error('Error deleting folder:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete folder');
    }
  };

  const handleShareFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolder) return;

    try {
      setError(null);
      await shareFolderWithCircles({
        folder_id: selectedFolder.id,
        circle_ids: selectedCircleIds,
        role: shareRole,
      });
      setShowShareModal(false);
      setSelectedCircleIds([]);
      await loadFolderDetail(selectedFolder.id);
    } catch (err) {
      console.error('Error sharing folder:', err);
      setError(err instanceof Error ? err.message : 'Failed to share folder');
    }
  };

  const handleRemoveFromFolder = async (itemId: string, itemType: string) => {
    if (!selectedFolder) return;
    if (!confirm('Remove this item from the folder?')) return;

    try {
      setError(null);
      await removeItemFromFolder({
        folder_id: selectedFolder.id,
        item_id: itemId,
        item_type: itemType,
      });
      await loadFolderDetail(selectedFolder.id);
    } catch (err) {
      console.error('Error removing item:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove item');
    }
  };

  const loadAvailableAlbums = async () => {
    if (!selectedFolder) return;

    try {
      setLoadingAlbums(true);
      const result = await adminApi.getAlbums();
      if (result.success && result.data?.albums) {
        // Filter out albums already in this folder
        const folderAlbumIds = new Set(
          folderItems.filter(item => item.item_type === 'album').map(item => item.item_id)
        );
        const filtered = result.data.albums.filter((album: any) => !folderAlbumIds.has(album.id));
        setAvailableAlbums(filtered);
      }
    } catch (err) {
      console.error('Error loading albums:', err);
    } finally {
      setLoadingAlbums(false);
    }
  };

  const handleAddAlbumToFolder = async (albumId: string) => {
    if (!selectedFolder) return;

    try {
      setError(null);
      await addItemToFolder({
        folder_id: selectedFolder.id,
        item_type: 'album',
        item_id: albumId,
      });
      await loadFolderDetail(selectedFolder.id);
      await loadAvailableAlbums();
    } catch (err: any) {
      console.error('Error adding album:', err);
      if (err.message?.includes('already exists')) {
        setError('This album is already in the folder');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to add album');
      }
    }
  };

  const openAddItemsModal = () => {
    loadAvailableAlbums();
    setShowAddItemsModal(true);
    setShowAddMenu(false);
  };

  const handleCreateSubfolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolder || !subfolderTitle.trim()) return;

    try {
      setError(null);
      await createFolder({
        title: subfolderTitle.trim(),
        description: subfolderDescription.trim() || undefined,
        parent_folder_id: selectedFolder.id,
      });
      setSubfolderTitle('');
      setSubfolderDescription('');
      setShowCreateSubfolder(false);
      await loadFolderDetail(selectedFolder.id);
      await loadFolders();
    } catch (err) {
      console.error('Error creating subfolder:', err);
      setError(err instanceof Error ? err.message : 'Failed to create subfolder');
    }
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedFolder) return;

    setUploadingDocument(true);
    setShowAddMenu(false);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Uploading ${file.name} (${i + 1}/${files.length})...`);

        if (isMediaFile(file)) {
          // Route media files to the media uploader
          const mediaFilesFromInput = Array.from(files).filter(f => isMediaFile(f));
          if (mediaFilesFromInput.length > 0) {
            setMediaUploaderFiles(mediaFilesFromInput);
            setShowMediaUploader(true);
          }
          break;
        }

        // Upload document file
        const result = await uploadDocumentFile(file, selectedFolder.id);
        console.log('Document uploaded:', result.document);
      }

      setUploadProgress('');
      await loadFolderDetail(selectedFolder.id);
    } catch (err) {
      console.error('Error uploading document:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setUploadingDocument(false);
      setUploadProgress('');
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileUpload = () => {
    setShowAddMenu(false);
    fileInputRef.current?.click();
  };

  const triggerMediaUpload = () => {
    setShowAddMenu(false);
    setMediaUploaderFiles(undefined);
    setShowMediaUploader(true);
  };

  const handleAssetCreated = async (assetId: string) => {
    const folder = selectedFolderRef.current;
    if (!folder) return;
    try {
      await addItemToFolder({
        folder_id: folder.id,
        item_type: 'asset',
        item_id: assetId,
      });
    } catch (err) {
      console.error('Error adding asset to folder:', err);
    }
  };

  const handleMediaUploaderClose = () => {
    setShowMediaUploader(false);
    setMediaUploaderFiles(undefined);
    if (selectedFolder) {
      loadFolderDetail(selectedFolder.id);
    }
  };

  const handleMediaUploaded = (count: number) => {
    console.log('Media uploaded:', count);
    if (selectedFolder) {
      loadFolderDetail(selectedFolder.id);
    }
  };

  const handleFolderDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleFolderDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const isStillInside = e.clientX >= rect.left && e.clientX <= rect.right &&
                          e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!isStillInside) {
      setIsDragOver(false);
    }
  };

  const handleFolderDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0 || !selectedFolder) return;

    const files = Array.from(e.dataTransfer.files);
    const mediaFiles: File[] = [];
    const docFiles: File[] = [];

    for (const file of files) {
      if (isMediaFile(file) || file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        mediaFiles.push(file);
      } else {
        docFiles.push(file);
      }
    }

    // Handle media files via ImageUploader
    if (mediaFiles.length > 0) {
      setMediaUploaderFiles(mediaFiles);
      setShowMediaUploader(true);
    }

    // Handle document files inline
    if (docFiles.length > 0) {
      setUploadingDocument(true);
      try {
        for (let i = 0; i < docFiles.length; i++) {
          const file = docFiles[i];
          setUploadProgress(`Uploading ${file.name} (${i + 1}/${docFiles.length})...`);
          await uploadDocumentFile(file, selectedFolder.id);
        }
        setUploadProgress('');
        await loadFolderDetail(selectedFolder.id);
      } catch (err) {
        console.error('Error uploading document:', err);
        setError(err instanceof Error ? err.message : 'Failed to upload document');
      } finally {
        setUploadingDocument(false);
        setUploadProgress('');
      }
    }
  };

  const openEditModal = () => {
    if (selectedFolder) {
      setEditTitle(selectedFolder.title);
      setEditDescription(selectedFolder.description || '');
      setShowEditModal(true);
    }
  };

  const openShareModal = () => {
    if (selectedFolder) {
      // Pre-select existing circle shares
      const existingCircleIds = folderShares
        .filter(s => s.type === 'circle' && s.circle_id)
        .map(s => s.circle_id!);
      setSelectedCircleIds(existingCircleIds);
      setShowShareModal(true);
    }
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

  const getItemIconForDisplay = (item: FolderItem) => {
    switch (item.item_type) {
      case 'folder': return (
        <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
          <svg className="w-8 h-8 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
        </div>
      );
      case 'album': return (
        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
          <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      );
      case 'document': {
        const mimeType = item.document?.file_mime_type || '';
        if (mimeType.startsWith('image/')) return (
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        );
        if (mimeType === 'application/pdf') return (
          <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
            <span className="text-red-600 font-bold text-xs">PDF</span>
          </div>
        );
        if (mimeType.includes('word') || mimeType.includes('document')) return (
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <span className="text-blue-600 font-bold text-xs">DOC</span>
          </div>
        );
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return (
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <span className="text-green-600 font-bold text-xs">XLS</span>
          </div>
        );
        if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return (
          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
            <span className="text-orange-600 font-bold text-xs">PPT</span>
          </div>
        );
        if (mimeType.startsWith('video/')) return (
          <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
            <svg className="w-8 h-8 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        );
        if (mimeType.startsWith('audio/')) return (
          <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
            <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
        );
        if (mimeType === 'application/zip' || mimeType.includes('compressed')) return (
          <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
            <span className="text-yellow-600 font-bold text-xs">ZIP</span>
          </div>
        );
        if (mimeType.startsWith('text/') || mimeType === 'application/json') return (
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
            <span className="text-gray-600 font-bold text-xs">TXT</span>
          </div>
        );
        return (
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        );
      }
      case 'list': return (
        <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
          <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
      );
      case 'asset': return (
        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      );
      case 'live_event': return (
        <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
      );
      default: return (
        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
      );
    }
  };

  const isViewableInBrowser = (mimeType: string | null | undefined): boolean => {
    if (!mimeType) return false;
    const viewableTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/html',
      'text/css',
      'text/javascript',
      'text/markdown',
      'text/csv',
      'application/json',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
    ];
    return viewableTypes.includes(mimeType);
  };

  const isOfficeDocument = (mimeType: string | null | undefined): boolean => {
    if (!mimeType) return false;
    return mimeType.includes('msword') ||
           mimeType.includes('wordprocessingml') ||
           mimeType.includes('excel') ||
           mimeType.includes('spreadsheetml') ||
           mimeType.includes('powerpoint') ||
           mimeType.includes('presentationml');
  };

  const getGoogleDocsViewerUrl = (fileUrl: string): string => {
    return `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;
  };

  const handleItemClick = (item: FolderItem) => {
    console.log('Item clicked:', item, 'asset:', item.asset);
    if (item.item_type === 'folder') {
      loadFolderDetail(item.item_id);
    } else if (item.item_type === 'album') {
      navigate(`/admin/albums/${item.item_id}`);
    } else if (item.item_type === 'document') {
      setViewingDocument(item);
    } else if (item.item_type === 'asset') {
      setViewingAsset(item);
    }
  };

  const getItemTitle = (item: FolderItem) => {
    if (item.folder) return item.folder.title;
    if (item.album) return item.album.title;
    if (item.document) return item.document.title;
    if (item.list) return item.list.title;
    if (item.live_event) return item.live_event.title;
    if (item.asset) return `Asset ${item.item_id.substring(0, 8)}...`;
    return `${item.item_type} ${item.item_id.substring(0, 8)}...`;
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
      {selectedFolder ? (
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (selectedFolder.parent_folder_id) {
                loadFolderDetail(selectedFolder.parent_folder_id);
              } else {
                setSelectedFolder(null);
                setFolderItems([]);
                setFolderShares([]);
              }
            }}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {selectedFolder.parent_folder_id ? 'Back to parent folder' : 'Back to Folders'}
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-3xl">📂</span>
          <h2 className="text-2xl font-bold text-gray-900">{selectedFolder.title}</h2>
          {isOwner ? (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
              Owner
            </span>
          ) : (
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(userRole || 'read_only')}`}>
              {(userRole || 'read_only').replace('_', ' ')}
            </span>
          )}
          {isOwner && (
            <div className="ml-auto flex gap-2">
              <button
                onClick={openEditModal}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Edit
              </button>
              <button
                onClick={openShareModal}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Share
              </button>
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="btn-primary flex items-center gap-1"
              >
                <span>+</span> Add Items
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">Folders</h2>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowCreateFolder(true)}
              className="btn-primary flex items-center gap-2"
            >
              <span>+</span>
              Create Folder
            </button>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showAllFolders}
                onChange={(e) => setShowAllFolders(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Show all folders
            </label>
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
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {selectedFolder ? (
        <>
          {/* Folder description */}
          {selectedFolder.description && (
            <p className="text-gray-600">{selectedFolder.description}</p>
          )}

          {/* Add Menu Popup (relative to header) */}
          {showAddMenu && isOwner && (
            <div className="relative">
              <div className="absolute right-0 top-0 bg-white rounded-lg shadow-xl border w-56 overflow-hidden z-10">
                <button
                  onClick={() => {
                    setShowAddMenu(false);
                    setShowCreateSubfolder(true);
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors"
                >
                  <span className="text-xl">📁</span>
                  <div>
                    <p className="font-medium text-gray-900">New Subfolder</p>
                    <p className="text-xs text-gray-500">Create a folder inside</p>
                  </div>
                </button>
                <button
                  onClick={openAddItemsModal}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors border-t"
                >
                  <span className="text-xl">📷</span>
                  <div>
                    <p className="font-medium text-gray-900">Add Album</p>
                    <p className="text-xs text-gray-500">Add an existing album</p>
                  </div>
                </button>
                <button
                  onClick={triggerMediaUpload}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors border-t"
                >
                  <span className="text-xl">🖼️</span>
                  <div>
                    <p className="font-medium text-gray-900">Upload Media</p>
                    <p className="text-xs text-gray-500">Photos, videos, or audio</p>
                  </div>
                </button>
                <button
                  onClick={triggerFileUpload}
                  disabled={uploadingDocument}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors border-t disabled:opacity-50"
                >
                  <span className="text-xl">📄</span>
                  <div>
                    <p className="font-medium text-gray-900">
                      {uploadingDocument ? 'Uploading...' : 'Upload Document'}
                    </p>
                    <p className="text-xs text-gray-500">Upload a file</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Shares Section */}
          {isOwner && folderShares.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Shared with</h4>
              <div className="flex flex-wrap gap-2">
                {folderShares.map(share => (
                  <div key={share.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full">
                    <span className="text-sm">{share.type === 'circle' ? '👥' : '👤'}</span>
                    <span className="text-sm font-medium">
                      {share.type === 'circle' ? share.circles?.name : share.profile?.full_name || share.profile?.email}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getRoleColor(share.role)}`}>
                      {share.role.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Folder Items Grid - Full width with drag-and-drop */}
          <div
            className={`relative rounded-lg transition-colors ${isDragOver ? 'ring-2 ring-blue-400 ring-dashed bg-blue-50/50' : ''}`}
            onDragOver={handleFolderDragOver}
            onDragEnter={handleFolderDragOver}
            onDragLeave={handleFolderDragLeave}
            onDrop={handleFolderDrop}
          >
          {isDragOver && (
            <div className="absolute inset-0 bg-blue-50/80 flex items-center justify-center z-10 rounded-lg pointer-events-none">
              <div className="text-center">
                <span className="text-4xl mb-2 block">📥</span>
                <p className="text-blue-700 font-semibold">Drop files here to upload</p>
                <p className="text-blue-500 text-sm">Media files or documents</p>
              </div>
            </div>
          )}
          {folderItems.length > 0 ? (
            <div className="space-y-6">
              {(['folders_albums', 'document', 'asset', 'other'] as const).map(groupType => {
                const groupItems = groupType === 'folders_albums'
                  ? folderItems.filter(i => i.item_type === 'folder' || i.item_type === 'album')
                  : groupType === 'other'
                  ? folderItems.filter(i => !['folder', 'album', 'document', 'asset'].includes(i.item_type))
                  : folderItems.filter(i => i.item_type === groupType);
                if (groupItems.length === 0) return null;
                const groupLabel = groupType === 'folders_albums' ? 'Folders & Albums'
                  : groupType === 'document' ? 'Documents'
                  : groupType === 'asset' ? 'Media'
                  : 'Other';
                return (
                  <div key={groupType}>
                    <h3 className="text-sm font-semibold text-theme-muted uppercase tracking-wide mb-2">{groupLabel}</h3>
                    <div className="flex flex-wrap gap-2">
                      {groupItems.sort((a, b) => {
                        const order: Record<string, number> = { folder: 0, album: 1 };
                        return (order[a.item_type] ?? 2) - (order[b.item_type] ?? 2);
                      }).map(item => {
                // Asset items render as photo thumbnails
                if (item.item_type === 'asset') {
                  const thumbnailUrl = item.asset?.thumbnail || item.asset?.web_uri;
                  const isVideo = item.asset?.media_type === 'video';
                  return (
                    <div
                      key={item.id}
                      className="w-[180px] h-[180px] bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform relative group"
                      onClick={() => handleItemClick(item)}
                    >
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                          draggable={false}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                          <div className="text-sm mb-0.5">{isVideo ? '🎥' : '📸'}</div>
                          <div className="text-[9px] text-center px-1">
                            {isVideo ? 'Video' : 'Image'}
                          </div>
                        </div>
                      )}
                      {isVideo && thumbnailUrl && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="bg-black/50 rounded-full p-1">
                            <span className="text-white text-xs">▶️</span>
                          </div>
                        </div>
                      )}
                      {isOwner && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFromFolder(item.item_id, item.item_type);
                          }}
                          className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                }

                // Album items render like album cards (same as AlbumsManager grid)
                if (item.item_type === 'album' && item.album) {
                  const albumThumb = item.album.keyphoto_thumbnail || item.album.keyphoto;
                  const isDisplayable = albumThumb && (albumThumb.startsWith('http') || albumThumb.startsWith('data:'));
                  return (
                    <div
                      key={item.id}
                      className="w-[180px] card hover:shadow-lg transition-shadow cursor-pointer group relative"
                      onClick={() => handleItemClick(item)}
                    >
                      <div className="aspect-square bg-surface-elevated rounded-t-lg overflow-hidden flex items-center justify-center">
                        <div className="relative flex items-center justify-center w-full h-full">
                          {isDisplayable ? (
                            <img
                              src={albumThumb!}
                              alt={item.album.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <div className="w-full h-full bg-primary-light flex items-center justify-center">
                              <i className="fi fi-sr-images text-5xl text-theme-accent opacity-50"></i>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="p-3">
                        <h3 className="font-semibold text-theme-primary truncate text-sm">{item.album.title}</h3>
                        <p className="text-xs text-theme-muted">
                          {item.album.asset_count || 0} photos
                          {item.album.date_created && ` • ${new Date(item.album.date_created).toLocaleDateString()}`}
                        </p>
                      </div>
                      {isOwner && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFromFolder(item.item_id, item.item_type);
                          }}
                          className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                }

                // Other non-asset items render with icons
                return (
                  <div
                    key={item.id}
                    className="w-[180px] flex flex-col items-center p-3 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors group"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="mb-2 relative">
                      {getItemIconForDisplay(item)}
                      {isOwner && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFromFolder(item.item_id, item.item_type);
                          }}
                          className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 text-center truncate w-full">
                      {getItemTitle(item)}
                    </p>
                  </div>
                );
              })}
                    </div>
                  </div>
                );
              })}
              {/* Drag-and-drop hint */}
              <div className="flex items-center justify-center gap-2 py-3 text-gray-400 text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>Drag and drop files here to upload</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
              <div className="text-6xl mb-4 opacity-50">📂</div>
              <p>Empty folder</p>
              <div className="flex items-center justify-center gap-2 mt-3 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>Drag and drop files here or use the + menu to add items</span>
              </div>
            </div>
          )}
          </div>

          {/* Hidden file input for document upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleDocumentUpload}
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.json,.zip"
          />

          {/* Upload progress overlay */}
          {uploadingDocument && (
            <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-50">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-700 font-medium">{uploadProgress || 'Uploading...'}</p>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Grid View */}
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {folders.map(folder => (
                <div
                  key={folder.id}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => loadFolderDetail(folder.id)}
                >
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-t-lg overflow-hidden flex flex-col items-start p-3 gap-1.5 min-h-[140px]">
                    <div className="flex items-center gap-2 w-full">
                      <span className="text-3xl">📂</span>
                      <span className="text-sm font-semibold text-amber-900">{folder.item_count || 0} items</span>
                    </div>
                    {folder.type_counts && Object.keys(folder.type_counts).length > 0 && (
                      <div className="flex flex-col gap-1.5 w-full">
                        {folder.type_counts.folder ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-amber-700">📁 {folder.type_counts.folder} folder{folder.type_counts.folder > 1 ? 's' : ''}</span>
                          </div>
                        ) : null}
                        {folder.type_counts.album ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] text-amber-700">📷 {folder.type_counts.album} album{folder.type_counts.album > 1 ? 's' : ''}</span>
                            {folder.previews?.album_previews && folder.previews.album_previews.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {folder.previews.album_previews.map(album => (
                                  <div key={album.id} className="w-8 h-8 rounded shadow-sm overflow-hidden bg-white flex-shrink-0" title={album.title}>
                                    {(album.keyphoto_thumbnail || album.keyphoto) ? (
                                      <img src={album.keyphoto_thumbnail || album.keyphoto} alt={album.title} className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                      <div className="w-full h-full bg-purple-100 flex items-center justify-center">
                                        <span className="text-[10px]">📷</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                        {folder.type_counts.asset ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] text-amber-700">🖼️ {folder.type_counts.asset} photo{folder.type_counts.asset > 1 ? 's' : ''}</span>
                            {folder.previews?.asset_previews && folder.previews.asset_previews.length > 0 && (
                              <div className="flex gap-1 items-center">
                                {folder.previews.asset_previews.map(asset => (
                                  <div key={asset.id} className="w-7 h-7 rounded overflow-hidden bg-white flex-shrink-0">
                                    <img src={asset.thumbnail || asset.web_uri || ''} alt="" className="w-full h-full object-cover" loading="lazy" />
                                  </div>
                                ))}
                                {folder.type_counts.asset > 5 && (
                                  <span className="text-[10px] text-amber-600 font-medium">+{folder.type_counts.asset - 5}</span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : null}
                        {folder.type_counts.document ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-amber-700">📄 {folder.type_counts.document} document{folder.type_counts.document > 1 ? 's' : ''}</span>
                          </div>
                        ) : null}
                        {folder.type_counts.list ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-amber-700">✓ {folder.type_counts.list} list{folder.type_counts.list > 1 ? 's' : ''}</span>
                          </div>
                        ) : null}
                        {folder.type_counts.live_event ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-amber-700">🎥 {folder.type_counts.live_event} event{folder.type_counts.live_event > 1 ? 's' : ''}</span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate flex-1 text-sm">{folder.title}</h3>
                      {folder.isOwner ? (
                        <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
                          Owner
                        </span>
                      ) : (
                        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getRoleColor(folder.shared_via?.[0]?.role || 'read_only')}`}>
                          {(folder.shared_via?.[0]?.role || 'read_only').replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    {!folder.isOwner && folder.shared_via && folder.shared_via.length > 0 && (
                      <p className="text-[10px] text-blue-600 mt-0.5 truncate">
                        via {folder.shared_via.map(s => s.circle_name).filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* List View */
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Folder</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {folders.map(folder => (
                    <tr key={folder.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="text-2xl mr-3">📂</span>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{folder.title}</div>
                            {folder.description && (
                              <div className="text-sm text-gray-500 truncate max-w-xs">{folder.description}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {folder.isOwner ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            Owner
                          </span>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(folder.shared_via?.[0]?.role || 'read_only')}`}>
                            {(folder.shared_via?.[0]?.role || 'read_only').replace('_', ' ')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{folder.item_count || 0} items</span>
                          {folder.type_counts && Object.keys(folder.type_counts).length > 0 && (
                            <>
                              {folder.type_counts.folder ? <span className="text-xs text-gray-500">📁 {folder.type_counts.folder} folder{folder.type_counts.folder > 1 ? 's' : ''}</span> : null}
                              {folder.type_counts.album ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-500">📷 {folder.type_counts.album} album{folder.type_counts.album > 1 ? 's' : ''}</span>
                                  {folder.previews?.album_previews && folder.previews.album_previews.length > 0 && (
                                    <div className="flex gap-0.5">
                                      {folder.previews.album_previews.map(album => (
                                        <div key={album.id} className="w-6 h-6 rounded shadow-sm overflow-hidden bg-white flex-shrink-0" title={album.title}>
                                          {(album.keyphoto_thumbnail || album.keyphoto) ? (
                                            <img src={album.keyphoto_thumbnail || album.keyphoto} alt={album.title} className="w-full h-full object-cover" loading="lazy" />
                                          ) : (
                                            <div className="w-full h-full bg-purple-100 flex items-center justify-center"><span className="text-[8px]">📷</span></div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : null}
                              {folder.type_counts.asset ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-500">🖼️ {folder.type_counts.asset} photo{folder.type_counts.asset > 1 ? 's' : ''}</span>
                                  {folder.previews?.asset_previews && folder.previews.asset_previews.length > 0 && (
                                    <div className="flex gap-0.5 items-center">
                                      {folder.previews.asset_previews.map(asset => (
                                        <div key={asset.id} className="w-5 h-5 rounded overflow-hidden bg-white flex-shrink-0">
                                          <img src={asset.thumbnail || asset.web_uri || ''} alt="" className="w-full h-full object-cover" loading="lazy" />
                                        </div>
                                      ))}
                                      {folder.type_counts.asset > 5 && (
                                        <span className="text-[10px] text-gray-400 font-medium">+{folder.type_counts.asset - 5}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : null}
                              {folder.type_counts.document ? <span className="text-xs text-gray-500">📄 {folder.type_counts.document} document{folder.type_counts.document > 1 ? 's' : ''}</span> : null}
                              {folder.type_counts.list ? <span className="text-xs text-gray-500">✓ {folder.type_counts.list} list{folder.type_counts.list > 1 ? 's' : ''}</span> : null}
                              {folder.type_counts.live_event ? <span className="text-xs text-gray-500">🎥 {folder.type_counts.live_event} event{folder.type_counts.live_event > 1 ? 's' : ''}</span> : null}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => loadFolderDetail(folder.id)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            View
                          </button>
                          {folder.isOwner && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFolder(folder.id);
                              }}
                              className="text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {folders.length === 0 && (
            <div className="text-center py-16">
              <div className="text-6xl mb-4 opacity-50">📂</div>
              <h3 className="text-2xl font-bold text-gray-700 mb-2">No Folders Yet</h3>
              <p className="text-gray-500">Create a folder to organize your albums, documents, and more.</p>
            </div>
          )}
        </>
      )}

      {/* Create Subfolder Modal */}
      {showCreateSubfolder && selectedFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Create Subfolder</h3>
              <button
                onClick={() => {
                  setShowCreateSubfolder(false);
                  setSubfolderTitle('');
                  setSubfolderDescription('');
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                x
              </button>
            </div>
            <form onSubmit={handleCreateSubfolder} className="p-6 space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg flex items-center gap-2 text-sm text-gray-600">
                <span>📂</span>
                <span>Creating inside: <strong>{selectedFolder.title}</strong></span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Folder Name *
                </label>
                <input
                  type="text"
                  value={subfolderTitle}
                  onChange={(e) => setSubfolderTitle(e.target.value)}
                  placeholder="Enter folder name"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={subfolderDescription}
                  onChange={(e) => setSubfolderDescription(e.target.value)}
                  placeholder="Enter description"
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateSubfolder(false);
                    setSubfolderTitle('');
                    setSubfolderDescription('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!subfolderTitle.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-md transition-colors"
                >
                  Create Subfolder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Create New Folder</h3>
              <button
                onClick={() => {
                  setShowCreateFolder(false);
                  setNewFolderTitle('');
                  setNewFolderDescription('');
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                x
              </button>
            </div>
            <form onSubmit={handleCreateFolder} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Folder Name *
                </label>
                <input
                  type="text"
                  value={newFolderTitle}
                  onChange={(e) => setNewFolderTitle(e.target.value)}
                  placeholder="Enter folder name"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={newFolderDescription}
                  onChange={(e) => setNewFolderDescription(e.target.value)}
                  placeholder="Enter description"
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateFolder(false);
                    setNewFolderTitle('');
                    setNewFolderDescription('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderTitle.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-md transition-colors"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Folder Modal */}
      {showEditModal && selectedFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Edit Folder</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                x
              </button>
            </div>
            <form onSubmit={handleUpdateFolder} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Folder Name *
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editTitle.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-md transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Folder Modal */}
      {showShareModal && selectedFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900">Share Folder</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                x
              </button>
            </div>
            <form onSubmit={handleShareFolder} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Circles
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                  {circles.map(circle => (
                    <label key={circle.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCircleIds.includes(circle.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCircleIds([...selectedCircleIds, circle.id]);
                          } else {
                            setSelectedCircleIds(selectedCircleIds.filter(id => id !== circle.id));
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">{circle.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Permission Level
                </label>
                <select
                  value={shareRole}
                  onChange={(e) => setShareRole(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="read_only">Read Only</option>
                  <option value="contributor">Contributor</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                >
                  Update Sharing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Items Modal */}
      {showAddItemsModal && selectedFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xl font-semibold text-gray-900">Add Items to Folder</h3>
              <button
                onClick={() => setShowAddItemsModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                x
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-xl">📷</span>
                Add Albums
              </h4>

              {loadingAlbums ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : availableAlbums.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-gray-500">No albums available to add</p>
                  <p className="text-sm text-gray-400 mt-1">All your albums are already in this folder</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableAlbums.map((album: any) => (
                    <div
                      key={album.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                        {album.keyphoto_thumbnail ? (
                          <img src={album.keyphoto_thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl">📷</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{album.title}</p>
                        <p className="text-sm text-gray-500">{album.album_assets?.length || 0} photos</p>
                      </div>
                      <button
                        onClick={() => handleAddAlbumToFolder(album.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex-shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t px-6 py-4 flex justify-end flex-shrink-0">
              <button
                onClick={() => setShowAddItemsModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Uploader */}
      {showMediaUploader && selectedFolder && (
        <ImageUploader
          onImagesUploaded={handleMediaUploaded}
          onClose={handleMediaUploaderClose}
          initialFiles={mediaUploaderFiles}
          onAssetCreated={handleAssetCreated}
        />
      )}

      {/* Asset Viewer */}
      {viewingAsset && (
        <MediaViewer
          asset={{
            asset_id: viewingAsset.asset?.id || viewingAsset.item_id,
            asset_uri: viewingAsset.asset?.web_uri || viewingAsset.asset?.path || '',
            web_uri: viewingAsset.asset?.web_uri || null,
            thumbnail: viewingAsset.asset?.thumbnail || null,
            asset_type: viewingAsset.asset?.media_type === 'video' ? 'video' : 'image',
          }}
          displayUrl={viewingAsset.asset?.web_uri || viewingAsset.asset?.thumbnail || viewingAsset.asset?.path || null}
          originalUrl={viewingAsset.asset?.web_uri || viewingAsset.asset?.path || null}
          onClose={() => setViewingAsset(null)}
        />
      )}

      {/* Document Viewer Modal */}
      {viewingDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-lg w-full max-w-5xl h-[90vh] flex flex-col mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="scale-75">{getItemIconForDisplay(viewingDocument)}</div>
                <div>
                  <h3 className="font-semibold text-gray-900">{viewingDocument.document?.title || getItemTitle(viewingDocument)}</h3>
                  <p className="text-sm text-gray-500">{viewingDocument.document?.file_mime_type || 'Document'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {viewingDocument.document?.file_url && (
                  <a
                    href={viewingDocument.document.file_url}
                    download={viewingDocument.document.title}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
                  >
                    Download
                  </a>
                )}
                <button
                  onClick={() => setViewingDocument(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl px-2"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto bg-gray-100">
              {!viewingDocument.document ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                    <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h4 className="text-xl font-semibold text-gray-900 mb-2">
                    Document not found
                  </h4>
                  <p className="text-gray-500">This document may have been deleted or is unavailable.</p>
                </div>
              ) : isViewableInBrowser(viewingDocument.document.file_mime_type) ? (
                // Render viewable content
                viewingDocument.document.file_mime_type?.startsWith('image/') ? (
                  <div className="flex items-center justify-center h-full p-4">
                    <img
                      src={viewingDocument.document.file_url || ''}
                      alt={viewingDocument.document.title}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                ) : viewingDocument.document.file_mime_type === 'application/pdf' ||
                    isOfficeDocument(viewingDocument.document.file_mime_type) ? (
                  <iframe
                    src={getGoogleDocsViewerUrl(viewingDocument.document.file_url || '')}
                    className="w-full h-full"
                    title={viewingDocument.document.title}
                  />
                ) : viewingDocument.document.file_mime_type?.startsWith('video/') ? (
                  <div className="flex items-center justify-center h-full p-4">
                    <video
                      src={viewingDocument.document.file_url || ''}
                      controls
                      className="max-w-full max-h-full"
                    />
                  </div>
                ) : viewingDocument.document.file_mime_type?.startsWith('audio/') ? (
                  <div className="flex items-center justify-center h-full p-4">
                    <audio
                      src={viewingDocument.document.file_url || ''}
                      controls
                      className="w-full max-w-md"
                    />
                  </div>
                ) : viewingDocument.document.file_mime_type?.startsWith('text/') ||
                    viewingDocument.document.file_mime_type === 'application/json' ? (
                  <iframe
                    src={viewingDocument.document.file_url || ''}
                    className="w-full h-full bg-white"
                    title={viewingDocument.document.title}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500">Preview not available</p>
                  </div>
                )
              ) : (
                // Unsupported format
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <div className="mb-4">{getItemIconForDisplay(viewingDocument)}</div>
                  <h4 className="text-xl font-semibold text-gray-900 mb-2">
                    Preview not available
                  </h4>
                  <p className="text-gray-500 mb-6 max-w-md">
                    This file type ({viewingDocument.document?.file_mime_type || 'unknown'}) cannot be previewed in the browser.
                    Would you like to download it instead?
                  </p>
                  {viewingDocument.document?.file_url && (
                    <a
                      href={viewingDocument.document.file_url}
                      download={viewingDocument.document.title}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
                    >
                      Download File
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
