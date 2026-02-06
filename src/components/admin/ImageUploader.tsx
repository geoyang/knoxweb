import React, { useState, useCallback } from 'react';
import heic2any from 'heic2any';
import exifr from 'exifr';
import { supabase } from '../../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../../lib/environments';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { addPhotosToAlbum, createAssetInLibrary, UploadLimitError } from '../../services/albumsApi';

// Interface for extracted EXIF metadata (matches mobile app's AssetMetadata)
interface ExifMetadata {
  createdAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  make: string | null;
  model: string | null;
  lensMake: string | null;
  lensModel: string | null;
  width: number | null;
  height: number | null;
  orientation: number | null;
  iso: number | null;
  focalLength: number | null;
  focalLength35mm: number | null;
  aperture: number | null;
  shutterSpeed: string | null;  // As string like "1/125"
  flash: string | null;
  whiteBalance: string | null;
  duration: number | null;  // Video duration in seconds
  // Raw EXIF data for storage in metadata JSONB column
  rawExif: Record<string, unknown> | null;
}

// Reverse geocode coordinates to location name using OpenStreetMap Nominatim
const reverseGeocode = async (latitude: number, longitude: number): Promise<string | null> => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=14`,
      {
        headers: {
          'User-Agent': 'Kizu Photo App/1.0',
        },
      }
    );

    if (!response.ok) {
      console.warn('Reverse geocoding failed:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.address) {
      // Build a readable location name from address components
      const parts: string[] = [];

      // Add neighborhood/suburb/village if available
      if (data.address.neighbourhood) {
        parts.push(data.address.neighbourhood);
      } else if (data.address.suburb) {
        parts.push(data.address.suburb);
      } else if (data.address.village) {
        parts.push(data.address.village);
      }

      // Add city/town
      if (data.address.city) {
        parts.push(data.address.city);
      } else if (data.address.town) {
        parts.push(data.address.town);
      } else if (data.address.municipality) {
        parts.push(data.address.municipality);
      }

      // Add state/region
      if (data.address.state) {
        parts.push(data.address.state);
      } else if (data.address.region) {
        parts.push(data.address.region);
      }

      // Add country
      if (data.address.country) {
        parts.push(data.address.country);
      }

      if (parts.length > 0) {
        return parts.join(', ');
      }
    }

    // Fallback to display_name if structured address not available
    if (data.display_name) {
      return data.display_name;
    }

    return null;
  } catch (error) {
    console.warn('Reverse geocoding error:', error);
    return null;
  }
};

// Extract video metadata using HTML5 video element
const extractVideoMetadata = async (file: File): Promise<ExifMetadata> => {
  return new Promise((resolve) => {
    const defaultMetadata: ExifMetadata = {
      createdAt: null,
      latitude: null,
      longitude: null,
      locationName: null,
      make: null,
      model: null,
      lensMake: null,
      lensModel: null,
      width: null,
      height: null,
      orientation: null,
      iso: null,
      focalLength: null,
      focalLength35mm: null,
      aperture: null,
      shutterSpeed: null,
      flash: null,
      whiteBalance: null,
      duration: null,
      rawExif: null,
    };

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    video.onloadedmetadata = () => {
      console.log('=== VIDEO METADATA EXTRACTION ===');
      console.log('Video file:', file.name);
      console.log('Video duration:', video.duration);
      console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight);

      // Try to get last modified date from file as creation date fallback
      let createdAt: Date | null = null;
      if (file.lastModified) {
        createdAt = new Date(file.lastModified);
        console.log('File last modified:', createdAt);
      }

      const metadata: ExifMetadata = {
        ...defaultMetadata,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration: video.duration || null,
        createdAt,
        rawExif: {
          video_duration: video.duration,
          video_width: video.videoWidth,
          video_height: video.videoHeight,
          file_type: file.type,
          file_size: file.size,
        },
      };

      console.log('Extracted video metadata:', metadata);
      console.log('=== VIDEO METADATA EXTRACTION COMPLETE ===');

      URL.revokeObjectURL(video.src);
      resolve(metadata);
    };

    video.onerror = () => {
      console.warn('Could not load video metadata');
      URL.revokeObjectURL(video.src);
      // Still return file's last modified date if available
      resolve({
        ...defaultMetadata,
        createdAt: file.lastModified ? new Date(file.lastModified) : null,
      });
    };

    video.src = URL.createObjectURL(file);
  });
};

// Extract EXIF metadata from an image file
const extractExifMetadata = async (file: File): Promise<ExifMetadata> => {
  const defaultMetadata: ExifMetadata = {
    createdAt: null,
    latitude: null,
    longitude: null,
    locationName: null,
    make: null,
    model: null,
    lensMake: null,
    lensModel: null,
    width: null,
    height: null,
    orientation: null,
    iso: null,
    focalLength: null,
    focalLength35mm: null,
    aperture: null,
    shutterSpeed: null,
    flash: null,
    whiteBalance: null,
    duration: null,
    rawExif: null,
  };

  try {
    // Parse all EXIF data including GPS, TIFF, IPTC, etc.
    const exif = await exifr.parse(file, {
      // Parse all segments for comprehensive metadata
      tiff: true,
      exif: true,
      gps: true,
      ifd1: true,     // Thumbnail IFD
      iptc: true,     // IPTC metadata
      xmp: true,      // XMP metadata
      icc: false,     // Skip ICC profile (usually not needed)
      translateKeys: true,
      translateValues: false,  // Keep raw values (orientation as number, not "Rotate 90 CW")
      reviveValues: true,
    });

    if (!exif) {
      console.log('No EXIF data found in file:', file.name);
      return defaultMetadata;
    }

    console.log('Extracted EXIF data (full):', JSON.stringify(exif, null, 2));

    // Get creation date - try various fields
    let createdAt: Date | null = null;
    if (exif.DateTimeOriginal) {
      createdAt = new Date(exif.DateTimeOriginal);
    } else if (exif.CreateDate) {
      createdAt = new Date(exif.CreateDate);
    } else if (exif.ModifyDate) {
      createdAt = new Date(exif.ModifyDate);
    }

    // Validate the date - if invalid, use null
    if (createdAt && isNaN(createdAt.getTime())) {
      createdAt = null;
    }

    // Get GPS coordinates - exifr parses these directly
    const latitude = exif.latitude ?? exif.GPSLatitude ?? null;
    const longitude = exif.longitude ?? exif.GPSLongitude ?? null;

    // Get dimensions
    const width = exif.ImageWidth ?? exif.ExifImageWidth ?? null;
    const height = exif.ImageHeight ?? exif.ExifImageHeight ?? null;

    // Clean the raw EXIF data for JSON storage (remove any circular refs or non-serializable values)
    let rawExif: Record<string, unknown> | null = null;
    try {
      // Convert to JSON and back to ensure it's serializable
      rawExif = JSON.parse(JSON.stringify(exif));
    } catch {
      console.warn('Could not serialize raw EXIF data');
    }

    // Get parsed coordinates
    const parsedLatitude = typeof latitude === 'number' ? latitude : null;
    const parsedLongitude = typeof longitude === 'number' ? longitude : null;

    // Reverse geocode to get location name if we have coordinates
    let locationName: string | null = null;
    if (parsedLatitude !== null && parsedLongitude !== null) {
      console.log('Reverse geocoding coordinates:', parsedLatitude, parsedLongitude);
      locationName = await reverseGeocode(parsedLatitude, parsedLongitude);
      console.log('Location name:', locationName);
    }

    // Format shutter speed as string (e.g., "1/125")
    let shutterSpeed: string | null = null;
    if (exif.ExposureTime) {
      const exposure = exif.ExposureTime;
      shutterSpeed = exposure < 1 ? `1/${Math.round(1 / exposure)}` : `${exposure}s`;
    }

    // Format flash mode
    let flash: string | null = null;
    if (exif.Flash !== undefined) {
      const flashModes: Record<number, string> = {
        0: 'No Flash', 1: 'Fired', 5: 'Fired, Return not detected', 7: 'Fired, Return detected',
        16: 'Off', 24: 'Auto, Did not fire', 25: 'Auto, Fired', 32: 'No flash function',
      };
      flash = flashModes[exif.Flash] || `Flash: ${exif.Flash}`;
    }

    // Format white balance
    let whiteBalance: string | null = null;
    if (exif.WhiteBalance !== undefined) {
      whiteBalance = exif.WhiteBalance === 0 ? 'Auto' : 'Manual';
    }

    return {
      createdAt,
      latitude: parsedLatitude,
      longitude: parsedLongitude,
      locationName,
      make: exif.Make ?? null,
      model: exif.Model ?? null,
      lensMake: exif.LensMake ?? null,
      lensModel: exif.LensModel ?? exif.Lens ?? null,
      width,
      height,
      duration: null,  // Photos don't have duration
      orientation: exif.Orientation ?? null,
      iso: exif.ISO ?? exif.ISOSpeedRatings ?? null,
      focalLength: exif.FocalLength ?? null,
      focalLength35mm: exif.FocalLengthIn35mmFormat ?? exif.FocalLenIn35mmFilm ?? null,
      aperture: exif.FNumber ?? null,
      shutterSpeed,
      flash,
      whiteBalance,
      rawExif,
    };
  } catch (error) {
    console.warn('Failed to extract EXIF data:', error);
    return defaultMetadata;
  }
};

interface ImageUploaderProps {
  targetAlbumId?: string | null;  // Optional - if not provided, uploads to assets only
  onImagesUploaded: (count: number) => void;
  onClose: () => void;
  initialFiles?: File[];  // Optional - files to process immediately on mount (e.g., from drag-drop)
  onAssetCreated?: (assetId: string) => void | Promise<void>;  // Optional - called after each asset is created (e.g., for folder linking)
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

// Check if file is a video by extension (fallback when MIME type is not recognized)
const isVideoFile = (file: File): boolean => {
  const name = file.name.toLowerCase();
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv', '.flv'];
  return videoExtensions.some(ext => name.endsWith(ext)) || file.type.startsWith('video/');
};

// Convert HEIC to JPEG with better error handling
const convertHeicToJpeg = async (file: File): Promise<Blob> => {
  console.log('Converting HEIC to JPEG:', file.name, 'size:', Math.round(file.size / 1024), 'KB');

  try {
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92
    });
    // heic2any can return an array for multi-image HEIC files
    const blob = Array.isArray(result) ? result[0] : result;
    console.log('HEIC conversion complete, size:', Math.round(blob.size / 1024), 'KB');
    return blob;
  } catch (error) {
    console.error('heic2any conversion failed:', error);

    // Try using canvas as fallback (works on some browsers with HEIC support)
    try {
      console.log('Trying canvas fallback for HEIC...');
      return await convertWithCanvas(file);
    } catch (canvasError) {
      console.error('Canvas fallback also failed:', canvasError);
      throw new Error(`HEIC conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Fallback: try to convert using canvas (works if browser has HEIC support)
const convertWithCanvas = async (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(img.src);
            if (blob) {
              console.log('Canvas conversion successful, size:', Math.round(blob.size / 1024), 'KB');
              resolve(blob);
            } else {
              reject(new Error('Canvas toBlob returned null'));
            }
          },
          'image/jpeg',
          0.92
        );
      } else {
        URL.revokeObjectURL(img.src);
        reject(new Error('Could not get canvas context'));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Image failed to load'));
    };

    img.src = URL.createObjectURL(file);
  });
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

// Generate thumbnail from video file at 2 seconds
const generateVideoThumbnail = async (file: File, maxSize: number = 300): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      // Seek to 2 seconds or 10% of video duration, whichever is smaller
      const seekTime = Math.min(2, video.duration * 0.1);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      // Calculate thumbnail dimensions
      let width = video.videoWidth;
      let height = video.videoHeight;

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
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        URL.revokeObjectURL(video.src);
        resolve(dataUrl);
      } else {
        URL.revokeObjectURL(video.src);
        reject(new Error('Could not get canvas context'));
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video for thumbnail'));
    };

    video.src = URL.createObjectURL(file);
  });
};

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  targetAlbumId,
  onImagesUploaded,
  onClose,
  initialFiles,
  onAssetCreated
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadLimitInfo, setUploadLimitInfo] = useState<{
    code: string;
    current: number;
    limit: number;
    message: string;
  } | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const initialFilesProcessed = React.useRef(false);
  const skipLimitCheckRef = React.useRef(false);
  const uploadedFilesRef = React.useRef<UploadedFile[]>([]);
  const onAssetCreatedRef = React.useRef(onAssetCreated);
  // Keep onAssetCreated ref in sync
  onAssetCreatedRef.current = onAssetCreated;

  // Wrapper to keep uploadedFilesRef in sync immediately (not deferred via useEffect)
  const setUploadedFilesTracked = React.useCallback((updater: React.SetStateAction<UploadedFile[]>) => {
    setUploadedFiles(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      uploadedFilesRef.current = next;
      return next;
    });
  }, []);

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

  // Generate UUID v4
  const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // Upload to Supabase Storage - returns URL and storage object ID
  const uploadToSupabase = async (file: File | Blob, customPath?: string, contentType?: string): Promise<{ url: string; objectId: string }> => {
    const fileName = customPath || `${user!.id}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${(file as File).name?.split('.').pop() || 'jpg'}`;

    // Determine content type - explicit > blob.type > file type
    const mimeType = contentType || (file as Blob).type || (file as File).type;
    console.log('Uploading file with contentType:', mimeType, 'size:', file.size);

    const { data, error } = await supabase.storage
      .from('assets')
      .upload(fileName, file, {
        upsert: true,
        contentType: mimeType
      });

    if (error) {
      throw error;
    }

    // Manual URL construction as workaround for URL duplication bug
    const manualUrl = `${getSupabaseUrl()}/storage/v1/object/public/assets/${data.path}`;
    // Use storage id if available, otherwise generate a UUID
    const objectId = data.id || generateUUID();
    console.log('Uploaded to:', manualUrl, 'objectId:', objectId, '(from storage:', !!data.id, ')');

    return { url: manualUrl, objectId };
  };

  // Handle file selection
  const handleFileSelect = useCallback(async (files: FileList | File[]) => {
    const processedFiles: UploadedFile[] = [];

    for (const file of Array.from(files)) {
      // Check if it's a HEIC file by extension (type might be wrong/empty)
      const isHeic = isHeicFile(file);

      // Check if it's a video file by extension (type might be wrong/empty for .avi, etc.)
      const isVideo = isVideoFile(file);

      // Validate file type - allow image, video, audio, and HEIC
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/') && !isHeic && !isVideo) {
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
          preview = '';
        }
      } else if (file.type.startsWith('audio/')) {
        // Audio files have no visual preview
        preview = '';
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
      setUploadedFilesTracked(prev => [...prev, ...processedFiles]);
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

  // Process initial files if provided (e.g., from global drag-drop)
  React.useEffect(() => {
    if (initialFiles && initialFiles.length > 0 && !initialFilesProcessed.current) {
      initialFilesProcessed.current = true;
      handleFileSelect(initialFiles);
    }
  }, [initialFiles, handleFileSelect]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileSelect(e.target.files);
    }
  }, [handleFileSelect]);

  // Remove file
  const removeFile = (id: string) => {
    setUploadedFilesTracked(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  // Upload single file - follows mobile app pattern
  // Returns true if successful, false otherwise, 'limit' if upload limit reached
  const uploadFile = async (fileObj: UploadedFile): Promise<boolean | 'limit'> => {
    try {
      // Update status to uploading
      setUploadedFilesTracked(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, status: 'uploading', progress: 0 } : f
      ));

      const isHeic = isHeicFile(fileObj.file);
      const isVideo = isVideoFile(fileObj.file);
      const isImage = (fileObj.file.type.startsWith('image/') || isHeic) && !isVideo;
      const isAudio = fileObj.file.type.startsWith('audio/');
      const timestamp = Date.now();

      // Step 0: Extract metadata before uploading (EXIF for images, video metadata for videos)
      let exifMetadata: ExifMetadata | null = null;
      if (isVideo) {
        console.log('Extracting video metadata from:', fileObj.file.name);
        exifMetadata = await extractVideoMetadata(fileObj.file);
        console.log('Video metadata:', exifMetadata);
      } else if (isImage) {
        console.log('Extracting EXIF metadata from:', fileObj.file.name);
        exifMetadata = await extractExifMetadata(fileObj.file);
        console.log('EXIF metadata:', exifMetadata);
      }

      // Step 1: Upload original file (including HEIC - preserves Live Photos etc.)
      console.log('Uploading original file:', fileObj.file.name);
      console.log('File type:', fileObj.file.type);
      console.log('File size:', Math.round(fileObj.file.size / 1024 / 1024 * 100) / 100, 'MB');
      console.log('Is video:', isVideo);
      setUploadedFilesTracked(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, progress: 10 } : f
      ));

      const originalPath = `${user!.id}/${timestamp}_${fileObj.file.name}`;
      console.log('Upload path:', originalPath);
      const originalUpload = await uploadToSupabase(fileObj.file, originalPath, fileObj.file.type);
      const originalUrl = originalUpload.url;
      const objectId = originalUpload.objectId;
      console.log('Original uploaded:', originalUrl);
      console.log('Object ID:', objectId);

      // Step 2: For HEIC, convert and upload web-compatible JPEG
      let webUrl = originalUrl; // Default to original
      if (isHeic) {
        console.log('Converting HEIC to JPEG for web display...');
        setUploadedFilesTracked(prev => prev.map(f =>
          f.id === fileObj.id ? { ...f, progress: 30 } : f
        ));

        try {
          const jpegBlob = await convertHeicToJpeg(fileObj.file);
          const webFilename = `web_${timestamp}_${fileObj.file.name.replace(/\.(heic|heif)$/i, '.jpg')}`;
          const webPath = `${user!.id}/web/${webFilename}`;
          // Convert Blob to File to ensure proper handling by Supabase client
          const jpegFile = new File([jpegBlob], webFilename, { type: 'image/jpeg' });
          console.log('Converted blob to File:', jpegFile.name, jpegFile.type, jpegFile.size);
          const webUpload = await uploadToSupabase(jpegFile, webPath, 'image/jpeg');
          webUrl = webUpload.url;
          console.log('Web version uploaded:', webUrl);
        } catch (heicError) {
          console.error('HEIC conversion failed:', heicError);
          // Don't continue with HEIC URL - throw error so user knows
          throw new Error(`HEIC conversion failed for ${fileObj.file.name}. Please convert to JPEG before uploading.`);
        }
      }

      // Step 3: Generate base64 thumbnail
      let thumbnailData: string | null = null;

      setUploadedFilesTracked(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, progress: 50 } : f
      ));

      if (isAudio) {
        // Audio files have no visual thumbnail
        console.log('Audio file - skipping thumbnail generation');
      } else if (isVideo) {
        // Generate thumbnail from video at 2 seconds
        try {
          thumbnailData = await generateVideoThumbnail(fileObj.file);
          console.log('Video thumbnail generated, size:', Math.round(thumbnailData.length / 1024), 'KB');
        } catch (thumbError) {
          console.warn('Video thumbnail generation failed:', thumbError);
        }
      } else if (isImage) {
        try {
          // For HEIC, we need to convert first to generate thumbnail
          const imageForThumbnail = isHeic ? await convertHeicToJpeg(fileObj.file) : fileObj.file;
          thumbnailData = await generateThumbnail(imageForThumbnail);
          console.log('Thumbnail generated, size:', Math.round(thumbnailData.length / 1024), 'KB');
        } catch (thumbError) {
          console.warn('Thumbnail generation failed:', thumbError);
        }
      }

      setUploadedFilesTracked(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, progress: 60 } : f
      ));

      // Step 4: Build asset data with all metadata
      // Use EXIF creation date if available, otherwise use current time
      const photoCreatedAt = exifMetadata?.createdAt
        ? exifMetadata.createdAt.toISOString()
        : new Date().toISOString();
      const uploadedAt = new Date().toISOString();
      const mediaType = isVideo ? 'video' : isAudio ? 'audio' : 'photo';

      // Build asset data with all metadata (used for both album and library-only uploads)
      const assetData: Record<string, unknown> = {
        needsCreation: true,
        path: originalUrl,
        thumbnail: thumbnailData || originalUrl,
        web_uri: webUrl,
        asset_file_id: objectId,
        created_at: photoCreatedAt,
        uploaded_at: uploadedAt,
        media_type: mediaType,
        uri: webUrl,
        mediaType: mediaType,
      };

      // Add EXIF/video metadata (matching mobile app's field names)
      if (exifMetadata) {
        if (exifMetadata.latitude !== null) assetData.latitude = exifMetadata.latitude;
        if (exifMetadata.longitude !== null) assetData.longitude = exifMetadata.longitude;
        if (exifMetadata.locationName) assetData.location_name = exifMetadata.locationName;
        if (exifMetadata.make) assetData.camera_make = exifMetadata.make;
        if (exifMetadata.model) assetData.camera_model = exifMetadata.model;
        if (exifMetadata.lensMake) assetData.lens_make = exifMetadata.lensMake;
        if (exifMetadata.lensModel) assetData.lens_model = exifMetadata.lensModel;
        if (exifMetadata.width) assetData.width = exifMetadata.width;
        if (exifMetadata.height) assetData.height = exifMetadata.height;
        if (exifMetadata.duration !== null) assetData.duration = exifMetadata.duration;
        if (exifMetadata.orientation) assetData.orientation = exifMetadata.orientation;
        if (exifMetadata.iso) assetData.iso = exifMetadata.iso;
        if (exifMetadata.aperture) assetData.aperture = exifMetadata.aperture;
        if (exifMetadata.focalLength) assetData.focal_length = exifMetadata.focalLength;
        if (exifMetadata.focalLength35mm) assetData.focal_length_35mm = exifMetadata.focalLength35mm;
        if (exifMetadata.shutterSpeed) assetData.shutter_speed = exifMetadata.shutterSpeed;
        if (exifMetadata.flash) assetData.flash = exifMetadata.flash;
        if (exifMetadata.whiteBalance) assetData.white_balance = exifMetadata.whiteBalance;
        // Sanitize raw EXIF data to avoid Unicode escape issues in PostgreSQL
        if (exifMetadata.rawExif) {
          try {
            // Test that it can be serialized to JSON without issues
            const sanitized = JSON.parse(JSON.stringify(exifMetadata.rawExif, (key, value) => {
              // Skip binary data, buffers, and problematic values
              if (value instanceof ArrayBuffer || value instanceof Uint8Array) return undefined;
              if (typeof value === 'string') {
                // Remove null bytes and invalid Unicode escape sequences
                return value.replace(/\x00/g, '').replace(/\\u0000/g, '');
              }
              return value;
            }));
            assetData.metadata = sanitized;
          } catch (e) {
            console.warn('Could not serialize EXIF metadata, skipping:', e);
          }
        }
      }

      // Update progress to 75% after uploads
      setUploadedFilesTracked(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, progress: 75 } : f
      ));

      // Step 5: Create asset and optionally add to album
      // Use edge function for BOTH album and library-only uploads (consistent with mobile app)
      if (targetAlbumId) {
        // Upload to album - use admin-albums-api with needsCreation
        console.log('Adding to album with needsCreation:', assetData);
        await addPhotosToAlbum({
          albumId: targetAlbumId,
          assets: [assetData],
        });
        console.log('Photo added to album via edge function');
      } else {
        // Library-only upload - use admin-images-api POST
        console.log('Creating asset in library:', assetData);
        const result = await createAssetInLibrary(assetData, skipLimitCheckRef.current);
        console.log('Asset created in library via edge function, id:', result.id);
        if (onAssetCreatedRef.current) {
          await onAssetCreatedRef.current(result.id);
        }
      }

      // Update status to success
      setUploadedFilesTracked(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, status: 'success', progress: 100, url: webUrl } : f
      ));

      return true; // Success

    } catch (error) {
      console.error('Upload error:', error);
      if (error instanceof UploadLimitError) {
        // Reset file status back to pending so it can be retried
        setUploadedFilesTracked(prev => prev.map(f =>
          f.id === fileObj.id ? { ...f, status: 'pending', progress: 0 } : f
        ));
        setUploadLimitInfo({
          code: error.code,
          current: error.current,
          limit: error.limit,
          message: error.message,
        });
        return 'limit';
      }
      setUploadedFilesTracked(prev => prev.map(f =>
        f.id === fileObj.id ? {
          ...f,
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed'
        } : f
      ));
      return false; // Failure
    }
  };

  // Upload all files
  const handleUploadAll = async () => {
    // Read from ref to get latest state (avoids stale closure after limit dialog)
    const filesToUpload = uploadedFilesRef.current.filter(f => f.status === 'pending');
    if (filesToUpload.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let hitLimit = false;

    // Upload files one at a time to detect limit errors early
    for (const file of filesToUpload) {
      const result = await uploadFile(file);
      if (result === 'limit') {
        hitLimit = true;
        break;
      }
      if (result === true) {
        successCount++;
      }
    }

    setIsUploading(false);

    if (hitLimit) {
      // Dialog will be shown by the uploadLimitInfo state set in uploadFile
      // Don't close or mark complete — user needs to choose an action
      return;
    }

    setUploadComplete(true);

    // Auto-close after successful upload
    const totalSuccess = uploadedFilesRef.current.filter(f => f.status === 'success').length;
    setTimeout(() => {
      onImagesUploaded(totalSuccess);
      onClose();
    }, 2000);
  };

  // Handle "Import what fits" — remove remaining pending files and finish
  const handleImportWhatFits = () => {
    setUploadLimitInfo(null);
    // Remove all pending files (they can't be uploaded within the limit)
    setUploadedFilesTracked(prev => prev.filter(f => f.status !== 'pending'));
    const successCount = uploadedFilesRef.current.filter(f => f.status === 'success').length;
    setUploadComplete(true);
    setTimeout(() => {
      onImagesUploaded(successCount);
      onClose();
    }, 2000);
  };

  // Handle "Import anyway" — retry with limit check skipped
  const handleImportAnyway = async () => {
    setUploadLimitInfo(null);
    skipLimitCheckRef.current = true;
    // Re-trigger upload for remaining pending files
    await handleUploadAll();
    skipLimitCheckRef.current = false;
  };

  // Handle "Upgrade" — navigate to subscription page
  const handleUpgrade = () => {
    setUploadLimitInfo(null);
    onClose();
    navigate('/subscription');
  };

  // Handle "Cancel" — dismiss the dialog, keep files in their current state
  const handleLimitCancel = () => {
    setUploadLimitInfo(null);
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
                  accept="image/*,video/*,audio/*"
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
                      accept="image/*,video/*,audio/*"
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
                      {isVideoFile(fileObj.file) ? (
                        <video
                          src={fileObj.preview}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      ) : fileObj.preview ? (
                        <img
                          src={fileObj.preview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                          <span className="text-3xl mb-1">{fileObj.file.type.startsWith('audio/') ? '🎵' : '📄'}</span>
                          <span className="text-xs text-center px-2 truncate w-full">{fileObj.file.name}</span>
                        </div>
                      )}
                      
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

      {/* Upload Limit Dialog */}
      {uploadLimitInfo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-md w-full shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Upload Limit Reached</h3>
                  <p className="text-sm text-gray-600 mt-1">{uploadLimitInfo.message}</p>
                  <div className="mt-2 bg-gray-50 rounded-md px-3 py-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">
                        {uploadLimitInfo.code === 'VIDEO_LIMIT_REACHED' ? 'Video minutes used' : 'Photos uploaded'}
                      </span>
                      <span className="font-medium text-gray-900">
                        {uploadLimitInfo.current} / {uploadLimitInfo.limit}
                      </span>
                    </div>
                    <div className="mt-1.5 w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-amber-500 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (uploadLimitInfo.current / uploadLimitInfo.limit) * 100)}%` }}
                      />
                    </div>
                  </div>
                  {uploadedFiles.filter(f => f.status === 'pending').length > 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      {uploadedFiles.filter(f => f.status === 'pending').length} file{uploadedFiles.filter(f => f.status === 'pending').length !== 1 ? 's' : ''} remaining
                      {uploadedFiles.filter(f => f.status === 'success').length > 0 && (
                        <span>, {uploadedFiles.filter(f => f.status === 'success').length} uploaded successfully</span>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="border-t px-6 py-4 flex flex-col gap-2">
              {uploadedFiles.filter(f => f.status === 'success').length > 0 && (
                <button
                  onClick={handleImportWhatFits}
                  className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
                >
                  Keep {uploadedFiles.filter(f => f.status === 'success').length} uploaded, skip the rest
                </button>
              )}
              <button
                onClick={handleImportAnyway}
                className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md text-sm font-medium transition-colors"
              >
                Import anyway (exceed limit)
              </button>
              <button
                onClick={handleUpgrade}
                className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                Upgrade plan
              </button>
              <button
                onClick={handleLimitCancel}
                className="w-full px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};