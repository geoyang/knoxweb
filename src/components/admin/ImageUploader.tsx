import React, { useState, useCallback } from 'react';
import heic2any from 'heic2any';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface ImageUploaderProps {
  targetAlbumId: string;
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

// Check if file is HEIC/HEIF
const isHeicFile = (file: File): boolean => {
  const name = file.name.toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif') ||
    file.type === 'image/heic' || file.type === 'image/heif';
};

// Convert HEIC to JPEG
const convertHeicToJpeg = async (file: File): Promise<Blob> => {
  console.log('Converting HEIC to JPEG:', file.name);
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92
  });
  // heic2any can return an array for multi-image HEIC files
  const blob = Array.isArray(result) ? result[0] : result;
  console.log('HEIC conversion complete, size:', Math.round(blob.size / 1024), 'KB');
  return blob;
};

// Generate thumbnail from image file
const generateThumbnail = async (file: File | Blob, maxSize: number = 300): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      // Calculate thumbnail dimensions
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      } else {
        reject(new Error('Could not get canvas context'));
      }

      URL.revokeObjectURL(img.src);
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for thumbnail'));
    };

    img.src = URL.createObjectURL(file);
  });
};

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  targetAlbumId,
  onImagesUploaded,
  onClose
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const { user } = useAuth();

  // Generate unique file ID
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Upload to ImageKit
  const uploadToImageKit = async (file: File): Promise<string> => {
    if (!import.meta.env.VITE_IMAGEKIT_KEY || import.meta.env.VITE_IMAGEKIT_KEY.trim() === '') {
      throw new Error('ImageKit key not configured, using Supabase fallback');
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', `knox_${Date.now()}_${file.name}`);
    formData.append('folder', '/knox-uploads');

    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(import.meta.env.VITE_IMAGEKIT_KEY + ':')}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ImageKit upload failed: ${error}`);
    }

    const result = await response.json();
    return result.url;
  };

  // Upload to Supabase Storage
  const uploadToSupabase = async (file: File | Blob, customPath?: string): Promise<string> => {
    const fileName = customPath || `${user!.id}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${(file as File).name?.split('.').pop() || 'jpg'}`;

    const { data, error } = await supabase.storage
      .from('assets')
      .upload(fileName, file, { upsert: true });

    if (error) {
      throw error;
    }

    // Manual URL construction as workaround for URL duplication bug
    const manualUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/assets/${data.path}`;
    console.log('Uploaded to:', manualUrl);

    return manualUrl;
  };

  // Handle file selection
  const handleFileSelect = useCallback(async (files: FileList) => {
    const processedFiles: UploadedFile[] = [];

    for (const file of Array.from(files)) {
      // Check if it's a HEIC file by extension (type might be wrong/empty)
      const isHeic = isHeicFile(file);

      // Validate file type - allow image, video, and HEIC
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && !isHeic) {
        console.log('Skipping unsupported file:', file.name, file.type);
        continue;
      }

      // Validate file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        console.log('Skipping large file:', file.name, file.size);
        continue;
      }

      let preview: string;

      // For HEIC files, convert to get preview
      if (isHeic) {
        try {
          console.log('Converting HEIC for preview:', file.name);
          const jpegBlob = await convertHeicToJpeg(file);
          preview = URL.createObjectURL(jpegBlob);
        } catch (err) {
          console.warn('Could not create HEIC preview:', err);
          // Use a placeholder for failed HEIC preview
          preview = '';
        }
      } else {
        preview = URL.createObjectURL(file);
      }

      processedFiles.push({
        file,
        id: generateId(),
        preview,
        status: 'pending' as const,
        progress: 0
      });
    }

    if (processedFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...processedFiles]);
    }
  }, []);

  // Handle drag and drop
  // Handle drag visual feedback only
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🔵 handleDragOver triggered', {
      target: (e.target as HTMLElement).tagName,
      currentTarget: (e.currentTarget as HTMLElement).tagName,
      className: (e.currentTarget as HTMLElement).className?.slice(0, 50),
    });
    setIsDragOver(true);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🟢 handleDragEnter triggered', {
      target: (e.target as HTMLElement).tagName,
      files: e.dataTransfer?.files?.length,
      types: e.dataTransfer?.types,
    });
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🟡 handleDragLeave triggered');
    // Only set to false if we're actually leaving the drop zone
    const rect = e.currentTarget.getBoundingClientRect();
    const isStillInside = e.clientX >= rect.left && e.clientX <= rect.right &&
                          e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!isStillInside) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🔴 handleDrop triggered!', {
      files: e.dataTransfer?.files?.length,
      fileNames: e.dataTransfer?.files ? Array.from(e.dataTransfer.files).map(f => f.name) : [],
      types: e.dataTransfer?.types,
    });
    setIsDragOver(false);

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      console.log('✅ Calling handleFileSelect with', e.dataTransfer.files.length, 'files');
      handleFileSelect(e.dataTransfer.files);
    } else {
      console.log('❌ No files in dataTransfer');
    }
  }, [handleFileSelect]);

  // Prevent browser default drag behavior (opening files)
  React.useEffect(() => {
    console.log('📦 ImageUploader mounted - setting up drag handlers');

    const preventDefaults = (e: DragEvent) => {
      e.preventDefault();
      console.log('🌐 Window dragover/drop prevented default', e.type);
    };

    // Only prevent default, don't stop propagation so React handlers work
    window.addEventListener('dragover', preventDefaults);
    window.addEventListener('drop', preventDefaults);

    return () => {
      console.log('📦 ImageUploader unmounting - removing drag handlers');
      window.removeEventListener('dragover', preventDefaults);
      window.removeEventListener('drop', preventDefaults);
    };
  }, []);

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

  // Upload single file - follows mobile app pattern
  const uploadFile = async (fileObj: UploadedFile) => {
    try {
      // Update status to uploading
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, status: 'uploading', progress: 0 } : f
      ));

      const isHeic = isHeicFile(fileObj.file);
      const isImage = fileObj.file.type.startsWith('image/') || isHeic;
      const timestamp = Date.now();

      // Step 1: Upload original file (including HEIC - preserves Live Photos etc.)
      console.log('Uploading original file:', fileObj.file.name);
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, progress: 10 } : f
      ));

      const originalPath = `${user!.id}/${timestamp}_${fileObj.file.name}`;
      const originalUrl = await uploadToSupabase(fileObj.file, originalPath);
      console.log('Original uploaded:', originalUrl);

      // Step 2: For HEIC, convert and upload web-compatible JPEG
      let webUrl = originalUrl; // Default to original
      if (isHeic) {
        console.log('Converting HEIC to JPEG for web display...');
        setUploadedFiles(prev => prev.map(f =>
          f.id === fileObj.id ? { ...f, progress: 30 } : f
        ));

        try {
          const jpegBlob = await convertHeicToJpeg(fileObj.file);
          const webFilename = `web_${timestamp}_${fileObj.file.name.replace(/\.(heic|heif)$/i, '.jpg')}`;
          const webPath = `${user!.id}/web/${webFilename}`;
          webUrl = await uploadToSupabase(jpegBlob, webPath);
          console.log('Web version uploaded:', webUrl);
        } catch (heicError) {
          console.warn('HEIC conversion failed, using original:', heicError);
          // Continue with original - will show as not displayable
        }
      }

      // Step 3: Generate base64 thumbnail
      let thumbnailData: string | null = null;
      if (isImage) {
        setUploadedFiles(prev => prev.map(f =>
          f.id === fileObj.id ? { ...f, progress: 50 } : f
        ));

        try {
          // For HEIC, we need to convert first to generate thumbnail
          const imageForThumbnail = isHeic ? await convertHeicToJpeg(fileObj.file) : fileObj.file;
          thumbnailData = await generateThumbnail(imageForThumbnail);
          console.log('Thumbnail generated, size:', Math.round(thumbnailData.length / 1024), 'KB');
        } catch (thumbError) {
          console.warn('Thumbnail generation failed:', thumbError);
        }
      }

      setUploadedFiles(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, progress: 60 } : f
      ));

      // Step 4: Create entry in assets table (following mobile pattern)
      const assetId = `web_${generateId()}`;
      const assetEntry = {
        id: assetId,
        path: originalUrl,
        thumbnail: thumbnailData || originalUrl,
        web_uri: webUrl,
        user_id: user!.id,
        created_at: new Date().toISOString(),
        media_type: fileObj.file.type.startsWith('video/') ? 'video' : 'photo',
      };

      console.log('Creating assets entry:', assetEntry.id);
      const { error: assetError } = await supabase
        .from('assets')
        .insert(assetEntry);

      if (assetError) {
        console.error('Failed to create asset entry:', assetError);
        // Continue anyway - album_assets can still work without assets entry
      }

      // Update progress to 75% after uploads
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, progress: 75 } : f
      ));

      // Step 5: Get the highest display order in the target album
      const { data: maxOrderData } = await supabase
        .from('album_assets')
        .select('display_order')
        .eq('album_id', targetAlbumId)
        .order('display_order', { ascending: false })
        .limit(1);

      const displayOrder = (maxOrderData?.[0]?.display_order || 0) + 1;

      // Step 6: Create album asset entry linking to the assets table entry
      // asset_uri uses web URL for display, asset_id references the assets table
      const albumAssetData = {
        album_id: targetAlbumId,
        asset_id: assetId, // Links to assets table
        asset_uri: webUrl, // Web-compatible URL for display
        asset_type: fileObj.file.type.startsWith('video/') ? 'video' : 'image',
        display_order: displayOrder,
        date_added: new Date().toISOString(),
        user_id: user!.id
      };

      console.log('Inserting album asset:', albumAssetData);

      const { error: insertError } = await supabase
        .from('album_assets')
        .insert(albumAssetData);

      if (insertError) {
        throw insertError;
      }

      // Update status to success
      setUploadedFiles(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, status: 'success', progress: 100, url: webUrl } : f
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

    setIsUploading(true);

    // Upload files in batches of 3 to avoid overwhelming the server
    const batchSize = 3;
    for (let i = 0; i < filesToUpload.length; i += batchSize) {
      const batch = filesToUpload.slice(i, i + batchSize);
      await Promise.all(batch.map(file => uploadFile(file)));
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
  };

  // Retry failed upload
  const retryUpload = (fileObj: UploadedFile) => {
    uploadFile(fileObj);
  };

  const pendingFiles = uploadedFiles.filter(f => f.status === 'pending');
  const successfulUploads = uploadedFiles.filter(f => f.status === 'success').length;
  const failedUploads = uploadedFiles.filter(f => f.status === 'error').length;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col" data-drop-zone="true">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Upload Photos</h2>
            <p className="text-sm text-gray-600 mt-1">
              Add photos from your camera roll or device
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Upload Area */}
        <div
          className="flex-1 overflow-y-auto p-6"
          data-drop-zone="true"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
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
              onDrop={handleDrop}
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