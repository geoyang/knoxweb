/**
 * ImagePicker Component
 * Select image from URL, upload, drag and drop, or browse library
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import heic2any from 'heic2any';
import { adminApi } from '../../../../services/adminApi';

interface Asset {
  id: string;
  web_uri: string;
  filename: string;
}

// Check if file is HEIC/HEIF
const isHeicFile = (file: File): boolean => {
  const name = file.name.toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif') ||
    file.type === 'image/heic' || file.type === 'image/heif';
};

// Check if file is a video
const isVideoFile = (file: File): boolean => {
  return file.type.startsWith('video/') ||
    /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(file.name);
};

// Extract frames from video at specified intervals
const extractVideoFrames = async (
  file: File,
  numFrames: number = 4
): Promise<{ blob: Blob; timestamp: number }[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const frames: { blob: Blob; timestamp: number }[] = [];
    let currentFrame = 0;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      // Calculate timestamps: skip first/last 5% to avoid black frames
      const startTime = duration * 0.05;
      const endTime = duration * 0.95;
      const interval = (endTime - startTime) / (numFrames - 1);

      const timestamps = Array.from({ length: numFrames }, (_, i) =>
        Math.min(startTime + (interval * i), duration - 0.1)
      );

      const captureFrame = () => {
        if (currentFrame >= timestamps.length) {
          URL.revokeObjectURL(video.src);
          resolve(frames);
          return;
        }

        video.currentTime = timestamps[currentFrame];
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(video, 0, 0);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                frames.push({ blob, timestamp: timestamps[currentFrame] });
              }
              currentFrame++;
              captureFrame();
            },
            'image/jpeg',
            0.9
          );
        } else {
          currentFrame++;
          captureFrame();
        }
      };

      captureFrame();
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };

    video.src = URL.createObjectURL(file);
  });
};

// Convert HEIC to JPEG
const convertHeicToJpeg = async (file: File): Promise<Blob> => {
  console.log('ImagePicker: Converting HEIC to JPEG:', file.name);
  try {
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92
    });
    const blob = Array.isArray(result) ? result[0] : result;
    console.log('ImagePicker: HEIC conversion complete');
    return blob;
  } catch (error) {
    console.error('ImagePicker: heic2any failed, trying canvas fallback:', error);
    // Try canvas fallback for browsers with native HEIC support
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(img.src);
              if (blob) resolve(blob);
              else reject(new Error('Canvas toBlob failed'));
            },
            'image/jpeg',
            0.92
          );
        } else {
          URL.revokeObjectURL(img.src);
          reject(new Error('No canvas context'));
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Image load failed'));
      };
      img.src = URL.createObjectURL(file);
    });
  }
};

interface VideoFrame {
  blob: Blob;
  timestamp: number;
  url: string;
  base64?: string;
}

interface ImagePickerProps {
  imageUrl: string | null;
  onImageSelect: (url: string, base64?: string, assetId?: string) => void;
  onClear: () => void;
  disabled?: boolean;
  // For video frame support
  onVideoFramesExtracted?: (frames: { url: string; base64: string; timestamp: number }[]) => void;
}

export const ImagePicker: React.FC<ImagePickerProps> = ({
  imageUrl,
  onImageSelect,
  onClear,
  disabled = false,
  onVideoFramesExtracted,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Video frame extraction state
  const [videoFrames, setVideoFrames] = useState<VideoFrame[]>([]);
  const [extractingFrames, setExtractingFrames] = useState(false);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(null);

  // Load assets when library is opened
  useEffect(() => {
    if (showLibrary) {
      loadAssets();
    }
  }, [showLibrary]);

  const loadAssets = async () => {
    setLoadingAssets(true);
    try {
      const result = await adminApi.getImages('all', 'date_added');
      if (result.success && result.data?.assets) {
        const assetList = result.data.assets.slice(0, 50).map((a: any) => ({
          id: a.id,
          web_uri: a.web_uri || a.path || '',
          filename: a.filename || a.id,
        }));
        setAssets(assetList);
      }
    } catch (err) {
      console.error('Failed to load assets:', err);
    } finally {
      setLoadingAssets(false);
    }
  };

  const [converting, setConverting] = useState(false);

  const processFile = useCallback(async (file: File) => {
    const isHeic = isHeicFile(file);
    const isVideo = isVideoFile(file);

    // Handle video files
    if (isVideo) {
      setExtractingFrames(true);
      setVideoFrames([]);
      try {
        console.log('Extracting frames from video:', file.name);
        const frames = await extractVideoFrames(file, 4);
        console.log('Extracted', frames.length, 'frames');

        // Convert blobs to base64 and create URLs
        const processedFrames: VideoFrame[] = await Promise.all(
          frames.map(async (frame) => {
            const url = URL.createObjectURL(frame.blob);
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(frame.blob);
            });
            return { ...frame, url, base64 };
          })
        );

        setVideoFrames(processedFrames);
        setSelectedFrameIndex(0); // Auto-select first frame

        // Notify parent if callback provided
        if (onVideoFramesExtracted) {
          onVideoFramesExtracted(
            processedFrames.map((f) => ({
              url: f.url,
              base64: f.base64!,
              timestamp: f.timestamp,
            }))
          );
        }

        // Auto-select first frame for processing
        if (processedFrames.length > 0) {
          onImageSelect(processedFrames[0].url, processedFrames[0].base64, undefined);
        }
      } catch (error) {
        console.error('Video frame extraction failed:', error);
        alert('Failed to extract frames from video.');
      }
      setExtractingFrames(false);
      return;
    }

    // Accept image/* or HEIC files
    if (!file.type.startsWith('image/') && !isHeic) return;

    let fileToProcess: File | Blob = file;

    // Convert HEIC to JPEG
    if (isHeic) {
      setConverting(true);
      try {
        fileToProcess = await convertHeicToJpeg(file);
      } catch (error) {
        console.error('HEIC conversion failed:', error);
        alert('Failed to convert HEIC file. Please convert to JPEG first.');
        setConverting(false);
        return;
      }
      setConverting(false);
    }

    // Clear video frames when selecting an image
    setVideoFrames([]);
    setSelectedFrameIndex(null);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      onImageSelect(URL.createObjectURL(fileToProcess), base64, undefined);
    };
    reader.readAsDataURL(fileToProcess);
  }, [onImageSelect, onVideoFramesExtracted]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [disabled, processFile]);

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onImageSelect(urlInput.trim(), undefined, undefined);
      setShowUrlInput(false);
      setUrlInput('');
    }
  };

  const handleAssetSelect = (asset: Asset) => {
    setSelectedAssetId(asset.id);
    onImageSelect(asset.web_uri, undefined, asset.id);
    setShowLibrary(false);
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFrameSelect = (index: number) => {
    setSelectedFrameIndex(index);
    const frame = videoFrames[index];
    if (frame) {
      onImageSelect(frame.url, frame.base64, undefined);
    }
  };

  const handleClearAll = () => {
    onClear();
    setSelectedAssetId(null);
    setVideoFrames([]);
    setSelectedFrameIndex(null);
  };

  if (imageUrl) {
    return (
      <div className="image-picker image-picker--has-image">
        <img src={imageUrl} alt="Selected" className="image-picker__preview" />

        {/* Video frames selector */}
        {videoFrames.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
              Video Frames (click to analyze different frame):
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              {videoFrames.map((frame, index) => (
                <div
                  key={index}
                  onClick={() => handleFrameSelect(index)}
                  style={{
                    cursor: 'pointer',
                    border: selectedFrameIndex === index ? '2px solid #3b82f6' : '2px solid transparent',
                    borderRadius: '0.375rem',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <img
                    src={frame.url}
                    alt={`Frame ${index + 1}`}
                    style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                  />
                  <span style={{
                    position: 'absolute',
                    bottom: '2px',
                    right: '2px',
                    background: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    fontSize: '0.6rem',
                    padding: '1px 3px',
                    borderRadius: '2px',
                  }}>
                    {formatTimestamp(frame.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedAssetId && (
          <p style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.5rem' }}>
            ✓ Asset ID: {selectedAssetId.slice(0, 8)}...
          </p>
        )}
        <button
          className="ai-button ai-button--secondary"
          onClick={handleClearAll}
          disabled={disabled}
          style={{ marginTop: '0.5rem' }}
        >
          Clear {videoFrames.length > 0 ? 'Video' : 'Image'}
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className={`image-picker ${isDragging ? 'image-picker--dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.heic,.heif"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          disabled={disabled}
        />

        {showUrlInput ? (
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', padding: '1rem' }}>
            <input
              type="url"
              className="ai-input"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="Enter image URL..."
              disabled={disabled}
              onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
            />
            <button className="ai-button ai-button--primary" onClick={handleUrlSubmit} disabled={disabled || !urlInput.trim()}>Load</button>
            <button className="ai-button ai-button--secondary" onClick={() => setShowUrlInput(false)}>Cancel</button>
          </div>
        ) : (
          <div
            className={`image-picker__placeholder ${isDragging ? 'image-picker__placeholder--dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {converting || extractingFrames ? (
              <>
                <div className="ai-spinner ai-spinner--large" style={{ marginBottom: '1rem' }} />
                <p>{extractingFrames ? 'Extracting video frames...' : 'Converting HEIC to JPEG...'}</p>
              </>
            ) : (
              <>
                <div className="image-picker__icon">{isDragging ? '📥' : '📷'}</div>
                <p style={{ marginBottom: '1rem' }}>
                  {isDragging ? 'Drop image or video here' : 'Drag & drop an image or video, or'}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="ai-button ai-button--primary" onClick={() => setShowLibrary(true)} disabled={disabled}>
                    Browse Library
                  </button>
                  <button className="ai-button ai-button--secondary" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
                    Upload File
                  </button>
                  <button className="ai-button ai-button--secondary" onClick={() => setShowUrlInput(true)} disabled={disabled}>
                    Enter URL
                  </button>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.75rem' }}>
                  Videos: 4 frames extracted for analysis • Use "Browse Library" to store results
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Library Modal */}
      {showLibrary && (
        <div className="ai-modal">
          <div className="ai-modal__overlay" onClick={() => setShowLibrary(false)} />
          <div className="ai-modal__content" style={{ maxWidth: '800px', maxHeight: '80vh' }}>
            <div className="ai-modal__header">
              <h3 className="ai-modal__title">Select from Library</h3>
              <button className="ai-modal__close" onClick={() => setShowLibrary(false)}>×</button>
            </div>
            <div className="ai-modal__body" style={{ overflowY: 'auto', maxHeight: '60vh' }}>
              {loadingAssets ? (
                <div className="ai-empty">
                  <div className="ai-spinner ai-spinner--large" />
                  <p>Loading assets...</p>
                </div>
              ) : assets.length === 0 ? (
                <div className="ai-empty">
                  <p>No assets found</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem' }}>
                  {assets.map(asset => (
                    <div
                      key={asset.id}
                      onClick={() => handleAssetSelect(asset)}
                      style={{
                        cursor: 'pointer',
                        borderRadius: '0.5rem',
                        overflow: 'hidden',
                        border: '2px solid transparent',
                        transition: 'border-color 0.2s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#3b82f6')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                    >
                      <img
                        src={asset.web_uri}
                        alt={asset.filename}
                        style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
