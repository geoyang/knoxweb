/**
 * AlbumProcessingTab Component
 * Process and index images in an album for AI search
 */

import React, { useState, useEffect, useRef } from 'react';
import { aiApi } from '../../../services/aiApi';
import { adminApi } from '../../../services/adminApi';
import { supabase } from '../../../lib/supabase';
import { AI_CONFIG } from './config';
import { OperationSelector, ProgressBar } from './components';
import type { ProcessingOperation } from '../../../types/ai';

// Check if URL is a video
const isVideoUrl = (url: string): boolean => {
  const videoExtensions = /\.(mp4|mov|avi|webm|mkv|m4v|quicktime)$/i;
  const videoMimeIndicators = ['video/', 'quicktime'];
  return videoExtensions.test(url) || videoMimeIndicators.some(m => url.toLowerCase().includes(m));
};

// Extract frames from video URL
const extractFramesFromVideoUrl = async (
  videoUrl: string,
  numFrames: number = 2
): Promise<{ blob: Blob; base64: string; timestamp: number }[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const frames: { blob: Blob; base64: string; timestamp: number }[] = [];
    let currentFrame = 0;
    let timestamps: number[] = [];

    video.onloadedmetadata = () => {
      const duration = video.duration;
      // Calculate timestamps: skip first/last 10% to avoid black frames
      const startTime = duration * 0.1;
      const endTime = duration * 0.9;
      const interval = (endTime - startTime) / Math.max(1, numFrames - 1);

      timestamps = Array.from({ length: numFrames }, (_, i) =>
        Math.min(startTime + (interval * i), duration - 0.1)
      );

      console.log('Video duration:', duration, 'Extracting at:', timestamps);
      captureFrame();
    };

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
              const reader = new FileReader();
              reader.onload = () => {
                frames.push({
                  blob,
                  base64: reader.result as string,
                  timestamp: timestamps[currentFrame]
                });
                currentFrame++;
                captureFrame();
              };
              reader.readAsDataURL(blob);
            } else {
              currentFrame++;
              captureFrame();
            }
          },
          'image/jpeg',
          0.85
        );
      } else {
        currentFrame++;
        captureFrame();
      }
    };

    video.onerror = (e) => {
      console.error('Video load error:', e);
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };

    // Set timeout for video loading
    const timeout = setTimeout(() => {
      reject(new Error('Video load timeout'));
    }, 30000);

    video.oncanplay = () => clearTimeout(timeout);
    video.src = videoUrl;
  });
};

interface AlbumAsset {
  id: string;
  asset_id: string;
  web_uri?: string;
  asset_uri?: string;
  media_type?: string;
}

interface Album {
  id: string;
  title: string;
  album_assets?: AlbumAsset[];
}

interface Asset {
  id: string;
  web_uri: string;
  filename: string;
  media_type?: string;
  ai_processed_at?: string;
}

interface ProcessingStats {
  current: number;
  total: number;
  succeeded: number;
  failed: number;
  currentAsset?: string;
}

interface ProcessingLog {
  assetId: string;
  thumbnail: string;
  objects: string[];
  faces: number;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  isVideo?: boolean;
  description?: string;
  text?: string;
}

export const AlbumProcessingTab: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [operations, setOperations] = useState<ProcessingOperation[]>(['embedding', 'objects', 'faces']);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState<ProcessingStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [processingLogs, setProcessingLogs] = useState<ProcessingLog[]>([]);
  const [skipProcessed, setSkipProcessed] = useState(true);
  const [forceReprocess, setForceReprocess] = useState(false);
  const abortRef = useRef(false);

  // Load albums list via edge function
  useEffect(() => {
    const loadAlbums = async () => {
      try {
        const result = await adminApi.getAlbums();
        if (result.success && result.data?.albums) {
          setAlbums(result.data.albums);
        }
      } catch (err) {
        console.error('Failed to load albums:', err);
      } finally {
        setLoadingAlbums(false);
      }
    };
    loadAlbums();
  }, []);

  // Fetch album assets when album is selected (using edge function with album_id)
  useEffect(() => {
    if (!selectedAlbumId) {
      setAssets([]);
      return;
    }

    const fetchAlbumAssets = async () => {
      setLoadingAssets(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.error('No session for fetching album assets');
          setAssets([]);
          return;
        }

        // Call edge function with album_id to get the specific album's assets
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-albums-api?album_id=${selectedAlbumId}`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            }
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch album assets');
        }

        const data = await response.json();
        console.log('AI Tab - Album detail response:', data);

        // Assets are at the top level as data.assets (not inside data.album)
        if (data.assets && Array.isArray(data.assets)) {
          const assetList = data.assets
            .filter((item: any) => item.asset_id || item.id)
            .map((item: any) => ({
              id: item.asset_id || item.id,
              web_uri: item.web_uri || item.asset_uri || item.path || '',
              filename: item.asset_id || item.id || 'unknown',
              media_type: item.media_type || (isVideoUrl(item.web_uri || item.asset_uri || item.path || '') ? 'video' : 'photo'),
              ai_processed_at: item.ai_processed_at,
            }));
          const processedCount = assetList.filter((a: Asset) => a.ai_processed_at).length;
          console.log('AI Tab - Extracted assets:', assetList.length, 'already processed:', processedCount);
          setAssets(assetList);
        } else {
          console.log('AI Tab - No assets in response');
          setAssets([]);
        }
      } catch (err) {
        console.error('Failed to load album assets:', err);
        setAssets([]);
      } finally {
        setLoadingAssets(false);
      }
    };

    fetchAlbumAssets();
  }, [selectedAlbumId]);

  const handleStartProcessing = async () => {
    if (assets.length === 0 || operations.length === 0) return;

    setProcessing(true);
    setError(null);
    setProcessingLogs([]);
    abortRef.current = false;

    // Filter assets based on skip processed setting
    const assetsToProcess = skipProcessed
      ? assets.filter(a => !a.ai_processed_at)
      : assets;

    if (assetsToProcess.length === 0) {
      setError('All assets have already been processed. Uncheck "Skip already processed" to reprocess them.');
      setProcessing(false);
      return;
    }

    const newStats: ProcessingStats = {
      current: 0,
      total: assetsToProcess.length,
      succeeded: 0,
      failed: 0,
    };
    setStats(newStats);

    for (const asset of assetsToProcess) {
      if (abortRef.current) break;

      const isVideo = asset.media_type === 'video' || isVideoUrl(asset.web_uri);
      setStats(prev => prev ? { ...prev, currentAsset: `${asset.filename}${isVideo ? ' (video)' : ''}`, current: prev.current } : null);

      try {
        // Handle video files by extracting frames
        if (isVideo) {
          if (abortRef.current) break;
          console.log('Processing video:', asset.web_uri);
          try {
            const frames = await extractFramesFromVideoUrl(asset.web_uri, 2);
            if (abortRef.current) break;
            console.log('Extracted', frames.length, 'frames from video');

            if (frames.length === 0) {
              throw new Error('No frames extracted from video');
            }

            // Process each frame
            let allObjects: string[] = [];
            let totalFaces = 0;
            let frameSucceeded = false;
            let allDescriptions: string[] = [];
            let allTexts: string[] = [];

            for (let i = 0; i < frames.length; i++) {
              if (abortRef.current) break;
              const frame = frames[i];
              const response = await aiApi.processImage({
                asset_id: asset.id,
                image_base64: frame.base64,
                operations: operations,
                store_results: true,
                force_reprocess: forceReprocess,
              });

              if (response.success) {
                frameSucceeded = true;
                const result = response.data?.result || response.data;
                const objects = result?.objects?.objects || result?.objects || [];
                const faces = result?.faces?.faces || result?.faces || [];
                const description = result?.description?.description || result?.description;
                const text = result?.ocr?.text || result?.text;

                // Collect objects from all frames (dedupe by class name)
                objects.forEach((o: any) => {
                  const objStr = `${o.class || o.class_name} (${Math.round((o.confidence || 0) * 100)}%)`;
                  if (!allObjects.includes(objStr)) {
                    allObjects.push(objStr);
                  }
                });
                totalFaces = Math.max(totalFaces, faces.length);

                // Collect descriptions and text
                if (description && typeof description === 'string') {
                  allDescriptions.push(`Frame ${i + 1}: ${description}`);
                }
                if (text && typeof text === 'string') {
                  allTexts.push(text);
                }
              }
            }

            const log: ProcessingLog = {
              assetId: asset.id,
              thumbnail: frames[0]?.base64 || asset.web_uri,
              objects: allObjects,
              faces: totalFaces,
              status: frameSucceeded ? 'success' : 'failed',
              error: frameSucceeded ? undefined : 'All frames failed to process',
              isVideo: true,
              description: allDescriptions.length > 0 ? allDescriptions.join(' | ') : undefined,
              text: allTexts.length > 0 ? [...new Set(allTexts)].join(' ') : undefined,
            };
            setProcessingLogs(prev => [log, ...prev]);

            if (frameSucceeded) {
              newStats.succeeded++;
            } else {
              newStats.failed++;
            }

          } catch (videoError) {
            console.error('Video processing error:', videoError);
            const log: ProcessingLog = {
              assetId: asset.id,
              thumbnail: asset.web_uri,
              objects: [],
              faces: 0,
              status: 'skipped',
              error: `Video: ${videoError instanceof Error ? videoError.message : 'Failed to extract frames'}`,
              isVideo: true,
            };
            setProcessingLogs(prev => [log, ...prev]);
            newStats.failed++;
          }
        } else {
          // Handle regular images
          if (abortRef.current) break;
          const response = await aiApi.processImage({
            asset_id: asset.id,
            image_url: asset.web_uri,
            operations: operations,
            store_results: true,
            force_reprocess: forceReprocess,
          });
          if (abortRef.current) break;

          // Extract detected objects, faces, description, and text from response
          const result = response.data?.result || response.data;
          const objects = result?.objects?.objects || result?.objects || [];
          const faces = result?.faces?.faces || result?.faces || [];
          const description = result?.description?.description || result?.description;
          const text = result?.ocr?.text || result?.text;

          const log: ProcessingLog = {
            assetId: asset.id,
            thumbnail: asset.web_uri,
            objects: objects.map((o: any) => `${o.class || o.class_name} (${Math.round((o.confidence || 0) * 100)}%)`),
            faces: faces.length,
            status: response.success ? 'success' : (response.data?.status === 'skipped' ? 'skipped' : 'failed'),
            error: response.error || response.data?.error,
            description: typeof description === 'string' ? description : undefined,
            text: typeof text === 'string' ? text : undefined,
          };

          setProcessingLogs(prev => [log, ...prev]);

          if (response.success) {
            newStats.succeeded++;
          } else {
            newStats.failed++;
            console.error(`Failed to process ${asset.filename}:`, response.error);
          }
        }
      } catch (err) {
        const log: ProcessingLog = {
          assetId: asset.id,
          thumbnail: asset.web_uri,
          objects: [],
          faces: 0,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        };
        setProcessingLogs(prev => [log, ...prev]);
        newStats.failed++;
        console.error(`Error processing ${asset.filename}:`, err);
      }

      newStats.current++;
      setStats({ ...newStats });
    }

    setProcessing(false);
    setStats(prev => prev ? { ...prev, currentAsset: undefined } : null);
  };

  const handleStop = () => {
    abortRef.current = true;
    setStats(prev => prev ? { ...prev, currentAsset: 'Stopping...' } : null);
  };

  const selectedAlbum = albums.find(a => a.id === selectedAlbumId);

  return (
    <div>
      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
        Index Album for Search
      </h3>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
        Process all images in an album to enable AI-powered search. Embeddings will be stored in the database.
      </p>

      {/* Album Selection */}
      <div className="form-group">
        <label className="form-group__label">Select Album</label>
        <select
          className="ai-select"
          value={selectedAlbumId}
          onChange={e => setSelectedAlbumId(e.target.value)}
          disabled={loadingAlbums || processing}
        >
          <option value="">Choose an album...</option>
          {albums.map(album => (
            <option key={album.id} value={album.id}>
              {album.title}
            </option>
          ))}
        </select>
        {selectedAlbumId && (
          <p className="form-group__help">
            {loadingAssets ? 'Loading assets...' : (() => {
              const videoCount = assets.filter(a => a.media_type === 'video' || isVideoUrl(a.web_uri)).length;
              const photoCount = assets.length - videoCount;
              return `${photoCount} photos${videoCount > 0 ? `, ${videoCount} videos (2 frames each)` : ''} in this album`;
            })()}
          </p>
        )}
      </div>

      {/* Operations */}
      <div className="form-group">
        <label className="form-group__label">Operations to Run</label>
        <OperationSelector
          selected={operations}
          onChange={setOperations}
          disabled={processing}
        />
        <p className="form-group__help">
          Select "Embeddings" for search, "Faces" for face recognition, "Objects" for object search
        </p>
      </div>

      {/* Processing Options */}
      <div className="form-group">
        <label className="form-group__label">Processing Options</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={skipProcessed}
              onChange={(e) => setSkipProcessed(e.target.checked)}
              disabled={processing}
              style={{ accentColor: '#3b82f6' }}
            />
            <span style={{ fontSize: '0.875rem', color: '#374151' }}>
              Skip already processed
              {assets.length > 0 && (
                <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>
                  ({assets.filter(a => a.ai_processed_at).length} of {assets.length} already done)
                </span>
              )}
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={forceReprocess}
              onChange={(e) => setForceReprocess(e.target.checked)}
              disabled={processing || skipProcessed}
              style={{ accentColor: '#3b82f6' }}
            />
            <span style={{ fontSize: '0.875rem', color: skipProcessed ? '#9ca3af' : '#374151' }}>
              Force reprocess (clear existing AI data first)
            </span>
          </label>
        </div>
      </div>

      {/* Error */}
      {error && <div className="ai-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Progress */}
      {stats && (
        <div style={{ marginBottom: '1.5rem' }}>
          <ProgressBar
            progress={(stats.current / stats.total) * 100}
            processed={stats.current}
            total={stats.total}
          />
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.875rem' }}>
            <span style={{ color: '#059669' }}>✓ {stats.succeeded} succeeded</span>
            {stats.failed > 0 && <span style={{ color: '#dc2626' }}>✗ {stats.failed} failed</span>}
          </div>
          {stats.currentAsset && (
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
              Processing: {stats.currentAsset}
            </p>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        {!processing ? (
          <button
            className="ai-button ai-button--primary"
            onClick={handleStartProcessing}
            disabled={assets.length === 0 || operations.length === 0 || loadingAssets || (skipProcessed && assets.filter(a => !a.ai_processed_at).length === 0)}
          >
            Start Indexing ({skipProcessed ? assets.filter(a => !a.ai_processed_at).length : assets.length} photos)
          </button>
        ) : (
          <button
            className="ai-button ai-button--danger"
            onClick={handleStop}
          >
            Stop Processing
          </button>
        )}
      </div>

      {/* Processing Logs */}
      {processingLogs.length > 0 && (
        <div style={{ marginTop: '1.5rem', maxHeight: '400px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: '600', padding: '0.75rem', borderBottom: '1px solid #e5e7eb', margin: 0, position: 'sticky', top: 0, background: '#fff' }}>
            Processing Results
          </h4>
          {processingLogs.map((log, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' }}>
              <img
                src={log.thumbnail}
                alt=""
                style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '0.25rem', flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '0.125rem 0.375rem',
                    borderRadius: '0.25rem',
                    background: log.status === 'success' ? '#d1fae5' : log.status === 'skipped' ? '#fef3c7' : '#fee2e2',
                    color: log.status === 'success' ? '#065f46' : log.status === 'skipped' ? '#92400e' : '#991b1b',
                  }}>
                    {log.status}
                  </span>
                  {log.isVideo && (
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>🎥 video</span>
                  )}
                  {log.faces > 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>👤 {log.faces} face{log.faces > 1 ? 's' : ''}</span>
                  )}
                </div>
                {log.objects.length > 0 && (
                  <div style={{ fontSize: '0.8rem', color: '#374151' }}>
                    <strong>Objects:</strong> {log.objects.join(', ')}
                  </div>
                )}
                {log.description && (
                  <div style={{ fontSize: '0.8rem', color: '#4b5563', marginTop: '0.25rem' }}>
                    <strong>📝 AI:</strong> {log.description}
                  </div>
                )}
                {log.text && (
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    <strong>📄 Text:</strong> {log.text.length > 100 ? log.text.slice(0, 100) + '...' : log.text}
                  </div>
                )}
                {!log.objects.length && !log.description && !log.text && log.status === 'success' && (
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No detections</div>
                )}
                {log.error && (
                  <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>{log.error}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completion Message */}
      {stats && !processing && stats.current === stats.total && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: '#d1fae5',
          borderRadius: '0.5rem',
          color: '#065f46',
        }}>
          <strong>Indexing Complete!</strong>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
            {stats.succeeded} images indexed successfully. You can now search for these images using the Search tab.
          </p>
        </div>
      )}

      {/* Preview Grid */}
      {assets.length > 0 && !processing && (
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '1rem', color: '#6b7280' }}>
            Preview ({assets.length} photos)
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '0.5rem' }}>
            {assets.slice(0, 20).map(asset => {
              const isVideo = asset.media_type === 'video' || isVideoUrl(asset.web_uri);
              return (
                <div key={asset.id} style={{ position: 'relative' }}>
                  <img
                    src={asset.web_uri}
                    alt={asset.filename}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '0.25rem' }}
                  />
                  {isVideo && (
                    <div style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      background: 'rgba(0,0,0,0.7)',
                      color: 'white',
                      fontSize: '0.6rem',
                      padding: '2px 4px',
                      borderRadius: '2px',
                    }}>
                      🎥
                    </div>
                  )}
                </div>
              );
            })}
            {assets.length > 20 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f3f4f6',
                borderRadius: '0.25rem',
                aspectRatio: '1',
                fontSize: '0.75rem',
                color: '#6b7280',
              }}>
                +{assets.length - 20} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
