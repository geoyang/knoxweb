import React, { useState, useEffect, useCallback } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { ReactionBar } from './ReactionBar';
import { memoriesApi, Memory, MemoryInput } from '../services/memoriesApi';

interface MediaAsset {
  id?: string;
  asset_id?: string;
  asset_uri?: string;
  web_uri?: string | null;
  path?: string | null;
  thumbnail?: string | null;
  thumbnail_uri?: string | null;
  asset_type: 'image' | 'video' | 'photo';
  // Metadata fields
  created_at?: string;
  date_added?: string;
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
}

interface MediaViewerProps {
  asset: MediaAsset;
  displayUrl: string | null;
  originalUrl?: string | null;
  onClose: () => void;
  onShowInfo?: () => void;
  onShowMemories?: () => void;
  memoryCount?: number;
  showDownload?: boolean;
  showInfo?: boolean;
  showMemories?: boolean;
  children?: React.ReactNode; // For additional action buttons
}

export const MediaViewer: React.FC<MediaViewerProps> = ({
  asset,
  displayUrl,
  originalUrl,
  onClose,
  onShowInfo,
  onShowMemories,
  memoryCount = 0,
  showDownload = true,
  showInfo = true,
  showMemories = true,
  children,
}) => {
  const isVideo = asset.asset_type === 'video';
  const downloadUrl = originalUrl || displayUrl;

  // Memories state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(true);
  const [showAddMemoryForm, setShowAddMemoryForm] = useState(false);
  const [memoryText, setMemoryText] = useState('');
  const [submittingMemory, setSubmittingMemory] = useState(false);

  const assetId = asset.asset_id || asset.id || '';

  const loadMemories = useCallback(async () => {
    if (!assetId) return;
    try {
      setMemoriesLoading(true);
      const result = await memoriesApi.getMemories(assetId);
      if (result.success && result.data) {
        setMemories(result.data.memories);
      }
    } catch (err) {
      console.error('Failed to load memories:', err);
    } finally {
      setMemoriesLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memoryText.trim()) return;

    try {
      setSubmittingMemory(true);
      const input: MemoryInput = {
        memory_type: 'text',
        content_text: memoryText.trim(),
      };
      const result = await memoriesApi.addMemory(assetId, input);
      if (result.success) {
        setMemoryText('');
        setShowAddMemoryForm(false);
        loadMemories();
      }
    } catch (err) {
      console.error('Failed to add memory:', err);
    } finally {
      setSubmittingMemory(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 overflow-y-auto"
      onClick={onClose}
    >
      <div className="min-h-full flex flex-col items-center justify-start p-4 pt-12">
        <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-3xl hover:text-gray-300 z-10"
        >
          ×
        </button>

        {/* Media content */}
        <div className="flex justify-center">
          {isVideo ? (
            <div style={{ marginTop: '10px' }}>
              <VideoPlayer
                src={displayUrl || ''}
                className="max-w-full max-h-[60vh] rounded-lg"
              />
            </div>
          ) : (
            <img
              src={displayUrl || ''}
              alt="Full size"
              className="max-w-full max-h-[60vh] rounded-lg object-contain"
              style={{ marginTop: '10px' }}
            />
          )}
        </div>

        {/* Reactions bar */}
        <div className="mt-4 flex justify-center">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
            <ReactionBar
              targetId={assetId}
              targetType="asset"
              className="justify-center"
            />
          </div>
        </div>

        {/* Memories section */}
        <div className="mt-4 bg-white rounded-xl max-h-[30vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-800">
              Memories {memories.length > 0 && `(${memories.length})`}
            </h3>
            {!showAddMemoryForm && (
              <button
                onClick={() => setShowAddMemoryForm(true)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                <span>+</span> Add Memory
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Add memory form */}
            {showAddMemoryForm && (
              <form onSubmit={handleAddMemory} className="mb-4 pb-4 border-b">
                <textarea
                  value={memoryText}
                  onChange={(e) => setMemoryText(e.target.value)}
                  placeholder="Share a memory, thought, or story..."
                  className="w-full h-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddMemoryForm(false);
                      setMemoryText('');
                    }}
                    className="px-3 py-1.5 text-sm text-gray-600 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingMemory || !memoryText.trim()}
                    className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 rounded-lg transition-colors flex items-center gap-1"
                  >
                    {submittingMemory ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Posting...
                      </>
                    ) : (
                      'Post'
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Memories list */}
            {memoriesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : memories.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-3xl mb-2">💭</div>
                <p className="text-sm">No memories yet</p>
                {!showAddMemoryForm && (
                  <button
                    onClick={() => setShowAddMemoryForm(true)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Be the first to add one!
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {memories.map((memory) => (
                  <div key={memory.id} className="flex gap-3">
                    {memory.user.avatar_url ? (
                      <img
                        src={memory.user.avatar_url}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-600 text-sm font-medium">
                          {(memory.user.name || memory.user.email || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm text-gray-900">
                          {memory.user.name || memory.user.email}
                        </span>
                        <span className="text-xs text-gray-500">{formatTimeAgo(memory.created_at)}</span>
                      </div>
                      {memory.memory_type === 'text' ? (
                        <p className="text-sm text-gray-700">{memory.content_text}</p>
                      ) : memory.memory_type === 'image' ? (
                        <img
                          src={memory.content_url || ''}
                          alt="Memory"
                          className="max-w-xs rounded-lg cursor-pointer hover:opacity-90"
                          onClick={() => window.open(memory.content_url || '', '_blank')}
                        />
                      ) : memory.memory_type === 'video' ? (
                        <video src={memory.content_url || ''} controls className="max-w-xs rounded-lg" />
                      ) : memory.memory_type === 'audio' ? (
                        <audio src={memory.content_url || ''} controls className="w-full max-w-xs" />
                      ) : null}
                      {/* Reaction bar for memory */}
                      <div className="mt-1">
                        <ReactionBar
                          targetId={memory.id}
                          targetType="memory"
                          compact
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex justify-center gap-3 flex-wrap">
          {/* Info button */}
          {showInfo && onShowInfo && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShowInfo();
              }}
              className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-6 rounded-lg flex items-center gap-2 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Info
            </button>
          )}

          {/* Download button */}
          {showDownload && downloadUrl && (
            <a
              href={downloadUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-6 rounded-lg flex items-center gap-2 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Original
            </a>
          )}

          {/* Additional custom buttons */}
          {children}
        </div>
        </div>
      </div>
    </div>
  );
};

// Info Modal Component
interface MediaInfoModalProps {
  asset: MediaAsset;
  thumbnailUrl?: string | null;
  onClose: () => void;
}

export const MediaInfoModal: React.FC<MediaInfoModalProps> = ({
  asset,
  thumbnailUrl,
  onClose,
}) => {
  // Format metadata value for display
  const formatValue = (key: string, value: any): string => {
    if (value === null || value === undefined) return '-';

    switch (key) {
      case 'created_at':
      case 'date_added':
        return new Date(value).toLocaleString();
      case 'aperture':
        return `f/${value}`;
      case 'focal_length':
      case 'focal_length_35mm':
        return `${value}mm`;
      case 'iso':
        return `ISO ${value}`;
      case 'width':
      case 'height':
        return `${value}px`;
      default:
        return String(value);
    }
  };

  // Get metadata fields to display
  const getMetadataFields = () => {
    const fields: { label: string; value: string }[] = [];

    if (asset.created_at) fields.push({ label: 'Date Taken', value: formatValue('created_at', asset.created_at) });
    if (asset.date_added) fields.push({ label: 'Date Added', value: formatValue('date_added', asset.date_added) });
    if (asset.width && asset.height) fields.push({ label: 'Dimensions', value: `${asset.width} × ${asset.height}` });
    if (asset.location_name) fields.push({ label: 'Location', value: asset.location_name });
    if (asset.camera_make || asset.camera_model) {
      const camera = [asset.camera_make, asset.camera_model].filter(Boolean).join(' ');
      fields.push({ label: 'Camera', value: camera });
    }
    if (asset.lens_make || asset.lens_model) {
      const lens = [asset.lens_make, asset.lens_model].filter(Boolean).join(' ');
      fields.push({ label: 'Lens', value: lens });
    }
    if (asset.aperture) fields.push({ label: 'Aperture', value: formatValue('aperture', asset.aperture) });
    if (asset.shutter_speed) fields.push({ label: 'Shutter Speed', value: asset.shutter_speed });
    if (asset.iso) fields.push({ label: 'ISO', value: formatValue('iso', asset.iso) });
    if (asset.focal_length) fields.push({ label: 'Focal Length', value: formatValue('focal_length', asset.focal_length) });
    if (asset.focal_length_35mm) fields.push({ label: 'Focal Length (35mm)', value: formatValue('focal_length_35mm', asset.focal_length_35mm) });
    if (asset.flash) fields.push({ label: 'Flash', value: asset.flash });
    if (asset.white_balance) fields.push({ label: 'White Balance', value: asset.white_balance });

    return fields;
  };

  const metadataFields = getMetadataFields();

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold text-gray-800">Photo Info</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Thumbnail */}
          {thumbnailUrl && (
            <div className="mb-4 flex justify-center">
              <img
                src={thumbnailUrl}
                alt="Photo"
                className="max-h-40 rounded-lg object-contain"
              />
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-3">
            {metadataFields.length > 0 ? (
              metadataFields.map((field, index) => (
                <div key={index} className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500 text-sm">{field.label}</span>
                  <span className="text-gray-800 text-sm font-medium text-right max-w-[60%]">{field.value}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📷</div>
                <p>No metadata available</p>
              </div>
            )}

            {/* Always show type */}
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500 text-sm">Type</span>
              <span className="text-gray-800 text-sm font-medium capitalize">
                {asset.asset_type === 'photo' ? 'image' : asset.asset_type}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaViewer;
