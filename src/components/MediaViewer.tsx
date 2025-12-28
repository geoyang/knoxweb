import React, { useState } from 'react';
import { VideoPlayer } from './VideoPlayer';

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

  return (
    <div
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div className="relative max-w-5xl max-h-full" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white text-3xl hover:text-gray-300 z-10"
        >
          ×
        </button>

        {/* Media content */}
        {isVideo ? (
          <div style={{ marginTop: '10px' }}>
            <VideoPlayer
              src={displayUrl || ''}
              className="max-w-full max-h-[80vh] rounded-lg"
            />
          </div>
        ) : (
          <img
            src={displayUrl || ''}
            alt="Full size"
            className="max-w-full max-h-[80vh] rounded-lg"
            style={{ marginTop: '10px' }}
          />
        )}

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

          {/* Memories button */}
          {showMemories && onShowMemories && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShowMemories();
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg flex items-center gap-2 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Memories
              {memoryCount > 0 && (
                <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
                  {memoryCount}
                </span>
              )}
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
