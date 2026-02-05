import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MediaViewer, MediaInfoModal } from './MediaViewer';
import { ReactionBar } from './ReactionBar';

// Shared asset interface for both public and admin views
// Reaction summary for display
export interface ReactionSummary {
  emoji: string;
  emojiChar: string;
  count: number;
}

export interface AlbumAsset {
  id: string;
  album_id?: string;
  asset_id: string;
  asset_uri: string;
  web_uri?: string | null;
  web_video_url?: string | null;
  thumbnail_uri?: string | null;
  asset_type: 'image' | 'video' | 'photo';
  display_order?: number;
  date_added?: string;
  path?: string | null;
  thumbnail?: string | null;
  transcoding_status?: 'pending' | 'processing' | 'completed' | 'failed' | null;
  // Metadata fields
  created_at?: string;
  width?: number;
  height?: number;
  location_name?: string;
  camera_make?: string;
  camera_model?: string;
  lens_make?: string;
  lens_model?: string;
  aperture?: number;
  shutter_speed?: string;
  iso?: number;
  focal_length?: number;
  focal_length_35mm?: number;
  flash?: string;
  white_balance?: string;
  // Reaction fields
  reactions?: ReactionSummary[];
  reactionCount?: number;
}

export interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: (asset: AlbumAsset) => void;
  color?: 'blue' | 'red' | 'green' | 'gray';
}

interface AlbumPhotoGridProps {
  assets: AlbumAsset[];
  onAssetClick?: (asset: AlbumAsset) => void;
  contextMenuItems?: ContextMenuItem[];
  memoryCounts?: Record<string, number>;
  onMemoryClick?: (assetId: string) => void;
  showMetadataOnHover?: boolean;
  gridSize?: 'small' | 'medium' | 'large';
  showDownload?: boolean;
  showInfo?: boolean;
  showMemories?: boolean;
  onShowMemories?: (asset: AlbumAsset) => void;
}

// Helper functions
const isWebAccessibleUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:');
};

const isHeicUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith('.heic') || lower.endsWith('.heif');
};

const getThumbnailUrl = (asset: AlbumAsset): string | null => {
  // Priority: base64 thumbnail > web_uri > thumbnail_uri > asset_uri
  if (asset.thumbnail_uri?.startsWith('data:')) {
    return asset.thumbnail_uri;
  }
  if (asset.thumbnail?.startsWith('data:')) {
    return asset.thumbnail;
  }
  if (asset.web_uri && isWebAccessibleUrl(asset.web_uri) && !isHeicUrl(asset.web_uri)) {
    return asset.web_uri;
  }
  if (asset.thumbnail_uri && isWebAccessibleUrl(asset.thumbnail_uri) && !isHeicUrl(asset.thumbnail_uri)) {
    return asset.thumbnail_uri;
  }
  if (asset.thumbnail && isWebAccessibleUrl(asset.thumbnail) && !isHeicUrl(asset.thumbnail)) {
    return asset.thumbnail;
  }
  if (asset.asset_uri && isWebAccessibleUrl(asset.asset_uri) && !isHeicUrl(asset.asset_uri)) {
    return asset.asset_uri;
  }
  return null;
};

const getDisplayUrl = (asset: AlbumAsset): string | null => {
  // For videos, prefer the transcoded web_video_url if available
  if (asset.asset_type === 'video' && asset.web_video_url && isWebAccessibleUrl(asset.web_video_url)) {
    return asset.web_video_url;
  }
  // For full-size display: web_uri > asset_uri > thumbnail
  if (asset.web_uri && isWebAccessibleUrl(asset.web_uri) && !isHeicUrl(asset.web_uri)) {
    return asset.web_uri;
  }
  if (asset.asset_uri && isWebAccessibleUrl(asset.asset_uri) && !isHeicUrl(asset.asset_uri)) {
    return asset.asset_uri;
  }
  return getThumbnailUrl(asset);
};

const getMetadataFields = (asset: AlbumAsset): { label: string; value: string }[] => {
  const fields: { label: string; value: string }[] = [];

  if (asset.created_at) {
    fields.push({ label: 'Date Taken', value: new Date(asset.created_at).toLocaleString() });
  }
  if (asset.date_added) {
    fields.push({ label: 'Date Added', value: new Date(asset.date_added).toLocaleString() });
  }
  if (asset.width && asset.height) {
    fields.push({ label: 'Dimensions', value: `${asset.width} × ${asset.height}` });
  }
  if (asset.location_name) {
    fields.push({ label: 'Location', value: asset.location_name });
  }
  if (asset.camera_make || asset.camera_model) {
    const camera = [asset.camera_make, asset.camera_model].filter(Boolean).join(' ');
    fields.push({ label: 'Camera', value: camera });
  }
  if (asset.lens_make || asset.lens_model) {
    const lens = [asset.lens_make, asset.lens_model].filter(Boolean).join(' ');
    fields.push({ label: 'Lens', value: lens });
  }
  if (asset.aperture) {
    fields.push({ label: 'Aperture', value: `f/${asset.aperture}` });
  }
  if (asset.shutter_speed) {
    fields.push({ label: 'Shutter Speed', value: asset.shutter_speed });
  }
  if (asset.iso) {
    fields.push({ label: 'ISO', value: `ISO ${asset.iso}` });
  }
  if (asset.focal_length) {
    fields.push({ label: 'Focal Length', value: `${asset.focal_length}mm` });
  }
  if (asset.focal_length_35mm) {
    fields.push({ label: 'Focal Length (35mm)', value: `${asset.focal_length_35mm}mm` });
  }
  if (asset.flash) {
    fields.push({ label: 'Flash', value: asset.flash });
  }
  if (asset.white_balance) {
    fields.push({ label: 'White Balance', value: asset.white_balance });
  }

  return fields;
};

const getMetadataSummary = (asset: AlbumAsset): string[] => {
  const summary: string[] = [];

  if (asset.created_at) {
    summary.push(new Date(asset.created_at).toLocaleDateString());
  }
  if (asset.location_name) {
    summary.push(asset.location_name);
  }
  if (asset.camera_make || asset.camera_model) {
    summary.push([asset.camera_make, asset.camera_model].filter(Boolean).join(' '));
  }
  if (asset.aperture) {
    summary.push(`f/${asset.aperture}`);
  }
  if (asset.iso) {
    summary.push(`ISO ${asset.iso}`);
  }

  return summary;
};

export const AlbumPhotoGrid: React.FC<AlbumPhotoGridProps> = ({
  assets,
  onAssetClick,
  contextMenuItems = [],
  memoryCounts = {},
  onMemoryClick,
  showMetadataOnHover = true,
  gridSize = 'small',
  showDownload = true,
  showInfo = true,
  showMemories = true,
  onShowMemories,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; asset: AlbumAsset } | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AlbumAsset | null>(null);
  const [infoAsset, setInfoAsset] = useState<AlbumAsset | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, asset: AlbumAsset) => {
    e.preventDefault();
    e.stopPropagation();
    if (contextMenuItems.length > 0) {
      setContextMenu({ x: e.clientX, y: e.clientY, asset });
    }
  }, [contextMenuItems]);

  const handleLongPressStart = useCallback((e: React.MouseEvent | React.TouchEvent, asset: AlbumAsset) => {
    if (contextMenuItems.length === 0) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    longPressTimer.current = setTimeout(() => {
      setContextMenu({ x: clientX, y: clientY, asset });
    }, 500);
  }, [contextMenuItems]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleAssetClick = useCallback((asset: AlbumAsset) => {
    if (contextMenu) {
      setContextMenu(null);
      return;
    }
    if (onAssetClick) {
      onAssetClick(asset);
    } else {
      setSelectedAsset(asset);
    }
  }, [contextMenu, onAssetClick]);

  const sizeClasses = {
    small: 'w-[156px] h-[156px]',
    medium: 'w-[219px] h-[219px]',
    large: 'w-[282px] h-[282px]',
  };

  const getColorClass = (color?: string) => {
    switch (color) {
      case 'red': return 'text-red-600 hover:bg-red-50';
      case 'green': return 'text-green-600 hover:bg-green-50';
      case 'gray': return 'text-gray-600 hover:bg-gray-50';
      default: return 'text-blue-600 hover:bg-blue-50';
    }
  };

  return (
    <>
      {/* Hover overlay styles */}
      <style>{`
        .photo-grid-card {
          position: relative;
        }
        .photo-grid-card .photo-grid-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.75);
          opacity: 0;
          transition: opacity 0.2s;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 4px;
          pointer-events: none;
          border-radius: 8px;
        }
        .photo-grid-card:hover .photo-grid-overlay {
          opacity: 1;
        }
        .photo-grid-overlay-text {
          color: white;
          font-size: 9px;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>

      <div className="flex flex-wrap gap-2" onClick={() => setContextMenu(null)}>
        {assets.map(asset => {
          const thumbnailUrl = getThumbnailUrl(asset);
          const isVideo = asset.asset_type === 'video';
          const memoryCount = memoryCounts[asset.asset_id] || 0;
          const metadataSummary = showMetadataOnHover ? getMetadataSummary(asset) : [];

          return (
            <div key={asset.id} className="flex flex-col">
              <div
                className={`photo-grid-card ${sizeClasses[gridSize]} bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform ${
                  contextMenu?.asset.id === asset.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => handleAssetClick(asset)}
                onContextMenu={(e) => handleContextMenu(e, asset)}
                onMouseDown={(e) => handleLongPressStart(e, asset)}
                onMouseUp={handleLongPressEnd}
                onMouseLeave={handleLongPressEnd}
                onTouchStart={(e) => handleLongPressStart(e, asset)}
                onTouchEnd={handleLongPressEnd}
              >
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt="Photo"
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                  <div className="text-sm mb-0.5">{isVideo ? '🎥' : '📸'}</div>
                  <div className="text-[9px] text-center px-1">{isVideo ? 'Video' : 'Image'}</div>
                </div>
              )}

              {/* Video play indicator */}
              {isVideo && thumbnailUrl && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 rounded-full p-1">
                    <span className="text-white text-xs">▶️</span>
                  </div>
                </div>
              )}

              {/* Metadata hover overlay */}
              {showMetadataOnHover && metadataSummary.length > 0 && (
                <div className="photo-grid-overlay">
                  {metadataSummary.slice(0, 3).map((text, i) => (
                    <div key={i} className="photo-grid-overlay-text">{text}</div>
                  ))}
                </div>
              )}

              {/* Memory indicator */}
              {memoryCount > 0 && onMemoryClick && (
                <button
                  className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 rounded-full p-1 flex items-center gap-0.5 transition-colors z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMemoryClick(asset.asset_id);
                  }}
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {memoryCount > 1 && (
                    <span className="text-white text-[10px] font-medium">{memoryCount}</span>
                  )}
                </button>
              )}

            </div>

              {/* Reactions bar below the photo */}
              <div className="mt-1 px-0.5">
                <ReactionBar
                  targetId={asset.asset_id}
                  targetType="asset"
                  compact
                  className="justify-start"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && contextMenuItems.length > 0 && (
        <div
          className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                item.onClick(contextMenu.asset);
                setContextMenu(null);
              }}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${getColorClass(item.color)}`}
            >
              {item.icon && <span>{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Media Viewer Modal */}
      {selectedAsset && (
        <MediaViewer
          asset={selectedAsset}
          displayUrl={getDisplayUrl(selectedAsset)}
          originalUrl={selectedAsset.asset_uri}
          onClose={() => setSelectedAsset(null)}
          onShowInfo={showInfo ? () => {
            setInfoAsset(selectedAsset);
          } : undefined}
          onShowMemories={showMemories && onShowMemories ? () => {
            onShowMemories(selectedAsset);
          } : undefined}
          memoryCount={memoryCounts[selectedAsset.asset_id] || 0}
          showDownload={showDownload}
          showInfo={showInfo}
          showMemories={showMemories}
        />
      )}

      {/* Info Modal */}
      {infoAsset && (
        <MediaInfoModal
          asset={infoAsset}
          thumbnailUrl={getThumbnailUrl(infoAsset)}
          onClose={() => setInfoAsset(null)}
        />
      )}
    </>
  );
};

// Export helper functions for use in other components
export { getThumbnailUrl, getDisplayUrl, getMetadataFields, getMetadataSummary, isWebAccessibleUrl, isHeicUrl };

export default AlbumPhotoGrid;
