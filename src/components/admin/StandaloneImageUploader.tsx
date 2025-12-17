import React, { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface StandaloneImageUploaderProps {
  onImagesUploaded: (count: number) => void;
  onClose: () => void;
}

interface UploadedFile {
  file: File;
  id: string;
  preview: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  url?: string;
  error?: string;
}

export const StandaloneImageUploader: React.FC<StandaloneImageUploaderProps> = ({
  onImagesUploaded,
  onClose
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('');
  const [userAlbums, setUserAlbums] = useState<Array<{id: string, title: string}>>([]);
  const [createNewAlbum, setCreateNewAlbum] = useState(false);
  const [newAlbumTitle, setNewAlbumTitle] = useState('');

  const { user } = useAuth();

  // Generate unique file ID
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Load user's albums
  React.useEffect(() => {
    const loadUserAlbums = async () => {
      if (!user?.id) return;

      const { data: albums } = await supabase
        .from('albums')
        .select('id, title')
        .eq('user_id', user.id)
        .order('title');

      setUserAlbums(albums || []);
    };

    loadUserAlbums();
  }, [user?.id]);

  // Upload to ImageKit and generate thumbnail
  const uploadToImageKit = async (file: File): Promise<{ originalUrl: string, thumbnailUrl: string }> => {
    // Debug environment variables
    console.log('Available env vars:', {
      VITE_IMAGEKIT_KEY: import.meta.env.VITE_IMAGEKIT_KEY?.substring(0, 20) + '...',
      VITE_IMAGEKIT_URL: import.meta.env.VITE_IMAGEKIT_URL,
      EXPO_PUBLIC_IMAGEKIT_URL: import.meta.env.EXPO_PUBLIC_IMAGEKIT_URL,
      NODE_ENV: import.meta.env.NODE_ENV,
      MODE: import.meta.env.MODE
    });
    
    // Use the private key for authentication
    const imagekitPrivateKey = import.meta.env.VITE_IMAGEKIT_KEY;
    const imagekitUrl = import.meta.env.VITE_IMAGEKIT_URL || import.meta.env.EXPO_PUBLIC_IMAGEKIT_URL;
    
    if (!imagekitPrivateKey || imagekitPrivateKey.trim() === '') {
      console.error('ImageKit private key not available:', {
        hasKey: !!imagekitPrivateKey,
        keyLength: imagekitPrivateKey?.length,
        keyStart: imagekitPrivateKey?.substring(0, 10)
      });
      throw new Error('ImageKit private key not configured, using Supabase fallback');
    }
    
    if (!imagekitUrl || imagekitUrl.trim() === '') {
      throw new Error('ImageKit URL not configured, using Supabase fallback');
    }
    
    console.log('Using ImageKit with URL:', imagekitUrl);
    console.log('Private key format check:', {
      length: imagekitPrivateKey.length,
      startsWithPrivate: imagekitPrivateKey.startsWith('private_')
    });
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', `knox_${Date.now()}_${file.name}`);
    formData.append('folder', '/knox-uploads');

    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(imagekitPrivateKey + ':')}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ImageKit upload error:', errorText);
      throw new Error(`ImageKit upload failed: ${errorText}`);
    }

    const result = await response.json();
    console.log('ImageKit upload result:', result);
    
    const originalUrl = result.url;
    
    // Generate thumbnail URL using ImageKit transformation
    const thumbnailUrl = originalUrl + '?tr=w-80,h-80,c-at_max';
    
    return { originalUrl, thumbnailUrl };
  };

  // Create thumbnail from canvas for Supabase uploads
  const createThumbnailBlob = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Set canvas size to 80x80
        canvas.width = 80;
        canvas.height = 80;
        
        // Calculate aspect ratio
        const aspectRatio = img.width / img.height;
        let drawWidth, drawHeight, offsetX, offsetY;
        
        if (aspectRatio > 1) {
          // Landscape
          drawHeight = 80;
          drawWidth = 80 * aspectRatio;
          offsetX = -(drawWidth - 80) / 2;
          offsetY = 0;
        } else {
          // Portrait
          drawWidth = 80;
          drawHeight = 80 / aspectRatio;
          offsetX = 0;
          offsetY = -(drawHeight - 80) / 2;
        }
        
        // Clear canvas and draw image
        ctx!.clearRect(0, 0, 80, 80);
        ctx!.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        
        // Convert to blob
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create thumbnail blob'));
          }
        }, 'image/jpeg', 0.8);
      };
      
      img.onerror = () => reject(new Error('Failed to load image for thumbnail'));
      img.src = URL.createObjectURL(file);
    });
  };

  // Upload to Supabase Storage as fallback
  const uploadToSupabase = async (file: File): Promise<{ originalUrl: string, thumbnailUrl: string }> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${user!.id}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

    // Upload original file
    const { data, error } = await supabase.storage
      .from('assets')
      .upload(fileName, file);

    if (error) {
      throw error;
    }

    // Generate and upload thumbnail for images
    let thumbnailUrl = '';
    if (file.type.startsWith('image/')) {
      try {
        const thumbnailBlob = await createThumbnailBlob(file);
        const thumbnailFileName = `${user!.id}/thumbnails/${Date.now()}_${Math.random().toString(36).substr(2, 9)}_thumb.jpg`;
        
        const { data: thumbData, error: thumbError } = await supabase.storage
          .from('assets')
          .upload(thumbnailFileName, thumbnailBlob);
          
        if (!thumbError && thumbData) {
          const { data: thumbUrlData } = supabase.storage
            .from('assets')
            .getPublicUrl(thumbData.path);
          thumbnailUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/assets/${thumbData.path}`;
        }
      } catch (thumbError) {
        console.warn('Failed to create thumbnail, using original image:', thumbError);
      }
    }

    const { data: publicUrlData } = supabase.storage
      .from('assets')
      .getPublicUrl(data.path);

    // Manual URL construction as workaround for URL duplication bug
    const originalUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/assets/${data.path}`;
    
    console.log('Supabase upload successful:', {
      uploadPath: data.path,
      originalUrl: originalUrl,
      thumbnailUrl: thumbnailUrl
    });

    return { originalUrl, thumbnailUrl: thumbnailUrl || originalUrl };
  };

  // Create new album if needed
  const createAlbumIfNeeded = async (): Promise<string> => {
    if (createNewAlbum && newAlbumTitle.trim()) {
      const { data: album, error } = await supabase
        .from('albums')
        .insert({
          title: newAlbumTitle.trim(),
          user_id: user!.id,
          date_created: new Date().toISOString(),
          date_modified: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return album.id;
    }

    return selectedAlbumId;
  };

  // Handle file selection
  const handleFileSelect = useCallback((files: FileList) => {
    const newFiles: UploadedFile[] = Array.from(files).map(file => {
      // Validate file type
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        return null;
      }
      
      // Validate file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        return null;
      }

      return {
        file,
        id: generateId(),
        preview: URL.createObjectURL(file),
        status: 'pending' as const,
        progress: 0
      };
    }).filter(Boolean) as UploadedFile[];

    setUploadedFiles(prev => [...prev, ...newFiles]);
  }, []);

  // Handle drag visual feedback only
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're actually leaving the drop zone
    const rect = e.currentTarget.getBoundingClientRect();
    const isStillInside = e.clientX >= rect.left && e.clientX <= rect.right && 
                          e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!isStillInside) {
      setIsDragOver(false);
    }
  }, []);

  // Comprehensive drag and drop handling
  React.useEffect(() => {
    const handleDocumentDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDocumentDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Check if we're dropping on our upload area
      const target = e.target as HTMLElement;
      const dropZone = target.closest('[data-drop-zone="true"]');
      
      if (dropZone && e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files);
      }
    };

    const handleDocumentDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDocumentDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener('dragover', handleDocumentDragOver);
    document.addEventListener('drop', handleDocumentDrop);
    document.addEventListener('dragenter', handleDocumentDragEnter);
    document.addEventListener('dragleave', handleDocumentDragLeave);

    return () => {
      document.removeEventListener('dragover', handleDocumentDragOver);
      document.removeEventListener('drop', handleDocumentDrop);
      document.removeEventListener('dragenter', handleDocumentDragEnter);
      document.removeEventListener('dragleave', handleDocumentDragLeave);
    };
  }, [handleFileSelect]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileSelect(e.target.files);
    }
  }, [handleFileSelect]);

  // Remove file
  const removeFile = (id: string) => {
    setUploadedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  // Upload single file
  const uploadFile = async (fileObj: UploadedFile, albumId: string) => {
    try {
      // Update status to uploading
      setUploadedFiles(prev => prev.map(f => 
        f.id === fileObj.id ? { ...f, status: 'uploading', progress: 0 } : f
      ));

      let uploadResult: { originalUrl: string, thumbnailUrl: string };
      
      try {
        // Try ImageKit first
        uploadResult = await uploadToImageKit(fileObj.file);
      } catch (imagekitError) {
        console.warn('ImageKit upload failed, trying Supabase:', imagekitError);
        // Fallback to Supabase
        uploadResult = await uploadToSupabase(fileObj.file);
      }

      // Update progress to 75% after upload
      setUploadedFiles(prev => prev.map(f => 
        f.id === fileObj.id ? { ...f, progress: 75 } : f
      ));

      // Get the highest display order in the target album
      const { data: maxOrderData } = await supabase
        .from('album_assets')
        .select('display_order')
        .eq('album_id', albumId)
        .order('display_order', { ascending: false })
        .limit(1);

      const displayOrder = (maxOrderData?.[0]?.display_order || 0) + 1;

      // Create album asset entry with thumbnail
      const assetData = {
        album_id: albumId,
        asset_id: generateId(),
        asset_uri: uploadResult.originalUrl,
        thumbnail_uri: uploadResult.thumbnailUrl,
        asset_type: fileObj.file.type.startsWith('video/') ? 'video' : 'image',
        display_order: displayOrder,
        date_added: new Date().toISOString(),
        user_id: user!.id
      };

      console.log('Creating asset with data:', assetData);

      const { error: insertError } = await supabase
        .from('album_assets')
        .insert(assetData);

      if (insertError) {
        throw insertError;
      }

      // Update status to success
      setUploadedFiles(prev => prev.map(f => 
        f.id === fileObj.id ? { ...f, status: 'success', progress: 100, url: uploadResult.originalUrl } : f
      ));

    } catch (error) {
      console.error('Upload error:', error);
      setUploadedFiles(prev => prev.map(f => 
        f.id === fileObj.id ? { 
          ...f, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Upload failed' 
        } : f
      ));
    }
  };

  // Upload all files
  const handleUploadAll = async () => {
    const filesToUpload = uploadedFiles.filter(f => f.status === 'pending');
    if (filesToUpload.length === 0) return;

    // Validate album selection
    if (!createNewAlbum && !selectedAlbumId) {
      alert('Please select an album or create a new one');
      return;
    }

    if (createNewAlbum && !newAlbumTitle.trim()) {
      alert('Please enter a title for the new album');
      return;
    }

    setIsUploading(true);

    try {
      // Create album if needed
      const albumId = await createAlbumIfNeeded();

      // Upload files in batches of 3 to avoid overwhelming the server
      const batchSize = 3;
      for (let i = 0; i < filesToUpload.length; i += batchSize) {
        const batch = filesToUpload.slice(i, i + batchSize);
        await Promise.all(batch.map(file => uploadFile(file, albumId)));
      }

      setIsUploading(false);
      setUploadComplete(true);

      // Count successful uploads
      const successCount = uploadedFiles.filter(f => f.status === 'success').length;
      
      // Auto-close after successful upload
      setTimeout(() => {
        onImagesUploaded(successCount);
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Upload process failed:', error);
      setIsUploading(false);
      alert('Upload failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  // Retry failed upload
  const retryUpload = async (fileObj: UploadedFile) => {
    if (!selectedAlbumId && !createNewAlbum) return;
    
    try {
      const albumId = await createAlbumIfNeeded();
      await uploadFile(fileObj, albumId);
    } catch (error) {
      console.error('Retry failed:', error);
    }
  };

  const pendingFiles = uploadedFiles.filter(f => f.status === 'pending');
  const successfulUploads = uploadedFiles.filter(f => f.status === 'success').length;
  const failedUploads = uploadedFiles.filter(f => f.status === 'error').length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-modal="upload">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col" data-drop-zone="true">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Upload Photos to Library</h2>
            <p className="text-sm text-gray-600 mt-1">
              Upload photos from your camera roll to your image library
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Album Selection */}
        <div className="border-b px-6 py-4 bg-gray-50">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Choose destination album:</h3>
          
          <div className="space-y-3">
            {/* Existing Album Option */}
            <label className="flex items-center">
              <input
                type="radio"
                name="albumChoice"
                checked={!createNewAlbum}
                onChange={() => setCreateNewAlbum(false)}
                className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Add to existing album:</span>
            </label>
            
            {!createNewAlbum && (
              <select
                value={selectedAlbumId}
                onChange={(e) => setSelectedAlbumId(e.target.value)}
                className="ml-6 block w-full max-w-sm px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                disabled={createNewAlbum}
              >
                <option value="">Select an album...</option>
                {userAlbums.map(album => (
                  <option key={album.id} value={album.id}>
                    {album.title}
                  </option>
                ))}
              </select>
            )}

            {/* New Album Option */}
            <label className="flex items-center">
              <input
                type="radio"
                name="albumChoice"
                checked={createNewAlbum}
                onChange={() => setCreateNewAlbum(true)}
                className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Create new album:</span>
            </label>
            
            {createNewAlbum && (
              <input
                type="text"
                value={newAlbumTitle}
                onChange={(e) => setNewAlbumTitle(e.target.value)}
                placeholder="Enter album title..."
                className="ml-6 block w-full max-w-sm px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                disabled={!createNewAlbum}
              />
            )}
          </div>
        </div>

        {/* Upload Area */}
        <div className="flex-1 overflow-y-auto p-6" data-drop-zone="true">
          {uploadedFiles.length === 0 ? (
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                isDragOver 
                  ? 'border-blue-400 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
            >
              <div className="text-6xl mb-4 opacity-50">📸</div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                Drag photos here or click to browse
              </h3>
              <p className="text-gray-500 mb-6">
                Supports JPG, PNG, GIF, MP4, MOV up to 50MB each
              </p>
              
              <label className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg cursor-pointer inline-flex items-center gap-2 transition-colors">
                <span>📷</span>
                Choose Files
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div>
              {/* Upload Summary */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} selected
                    {successfulUploads > 0 && (
                      <span className="ml-2 text-green-600">
                        • {successfulUploads} uploaded
                      </span>
                    )}
                    {failedUploads > 0 && (
                      <span className="ml-2 text-red-600">
                        • {failedUploads} failed
                      </span>
                    )}
                  </div>
                  
                  <label className="text-blue-600 hover:text-blue-800 cursor-pointer text-sm font-medium">
                    Add More
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* File List */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {uploadedFiles.map(fileObj => (
                  <div key={fileObj.id} className="relative group">
                    <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                      <img
                        src={fileObj.preview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      
                      {/* Status Overlay */}
                      <div className={`absolute inset-0 flex items-center justify-center ${
                        fileObj.status === 'uploading' ? 'bg-blue-500/20' :
                        fileObj.status === 'success' ? 'bg-green-500/20' :
                        fileObj.status === 'error' ? 'bg-red-500/20' : ''
                      }`}>
                        {fileObj.status === 'uploading' && (
                          <div className="text-center">
                            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mb-2"></div>
                            <div className="text-white text-sm font-medium">{fileObj.progress}%</div>
                          </div>
                        )}
                        {fileObj.status === 'success' && (
                          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                        {fileObj.status === 'error' && (
                          <button
                            onClick={() => retryUpload(fileObj)}
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Remove Button */}
                    {fileObj.status === 'pending' && (
                      <button
                        onClick={() => removeFile(fileObj.id)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-sm group-hover:opacity-100 opacity-0 transition-opacity"
                      >
                        ×
                      </button>
                    )}

                    {/* Error Message */}
                    {fileObj.status === 'error' && fileObj.error && (
                      <div className="mt-1 text-xs text-red-600 truncate" title={fileObj.error}>
                        {fileObj.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {uploadedFiles.length > 0 && (
          <div className="border-t px-6 py-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} ready to upload
              {uploadComplete && successfulUploads > 0 && (
                <span className="ml-2 text-green-600 font-medium">
                  ✓ Upload complete! Closing...
                </span>
              )}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                {uploadComplete ? 'Close' : 'Cancel'}
              </button>
              
              {pendingFiles.length > 0 && (
                <button
                  onClick={handleUploadAll}
                  disabled={isUploading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-md transition-colors flex items-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Uploading...
                    </>
                  ) : (
                    `Upload ${pendingFiles.length} Photo${pendingFiles.length !== 1 ? 's' : ''}`
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};