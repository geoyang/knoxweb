/**
 * SingleImageTab Component
 * Test AI processing on a single image
 */

import React, { useState } from 'react';
import { aiApi } from '../../../services/aiApi';
import { AI_CONFIG } from './config';
import { ImagePicker, OperationSelector, ProcessingResults } from './components';
import type { ProcessingOperation, ProcessingResult, DetectedObject, FaceDetection } from '../../../types/ai';

interface VideoFrame {
  url: string;
  base64: string;
  timestamp: number;
}

export const SingleImageTab: React.FC = () => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [operations, setOperations] = useState<ProcessingOperation[]>(AI_CONFIG.defaultOperations);
  const [storeResults, setStoreResults] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Video frames support
  const [videoFrames, setVideoFrames] = useState<VideoFrame[]>([]);
  const [processingAllFrames, setProcessingAllFrames] = useState(false);
  const [frameProgress, setFrameProgress] = useState<{ current: number; total: number } | null>(null);

  const handleImageSelect = (url: string, base64?: string, selectedAssetId?: string) => {
    setImageUrl(url);
    setImageBase64(base64 || null);
    setAssetId(selectedAssetId || null);
    setResult(null);
    setError(null);
  };

  const handleVideoFramesExtracted = (frames: VideoFrame[]) => {
    console.log('Video frames extracted:', frames.length);
    setVideoFrames(frames);
    setResult(null);
    setError(null);
  };

  const handleProcessAllFrames = async () => {
    if (videoFrames.length === 0) return;
    if (operations.length === 0) {
      setError('Please select at least one operation');
      return;
    }

    setProcessingAllFrames(true);
    setError(null);
    setResult(null);

    try {
      const allObjects: DetectedObject[] = [];
      const allFaces: FaceDetection[] = [];
      const allTexts: string[] = [];
      const allDescriptions: string[] = [];

      for (let i = 0; i < videoFrames.length; i++) {
        setFrameProgress({ current: i + 1, total: videoFrames.length });

        const frame = videoFrames[i];
        const params: Record<string, unknown> = {
          operations: operations,
          store_results: false, // Don't store video frames
          image_base64: frame.base64,
        };

        const response = await aiApi.processImage(params as Parameters<typeof aiApi.processImage>[0]);

        if (response.success && response.data) {
          const apiResult = response.data.result || response.data;

          // Collect objects (with frame reference)
          const frameObjects = (apiResult.objects?.objects || []).map((obj: DetectedObject) => ({
            ...obj,
            class_name: obj.class_name || obj.class,
          }));
          allObjects.push(...frameObjects);

          // Collect faces (with frame reference)
          const frameFaces = (apiResult.faces?.faces || []).map((face: FaceDetection, idx: number) => ({
            ...face,
            face_index: face.index ?? face.face_index ?? idx,
          }));
          allFaces.push(...frameFaces);

          // Collect text
          if (apiResult.ocr?.text) {
            allTexts.push(`[Frame ${i + 1} @ ${formatTimestamp(frame.timestamp)}]: ${apiResult.ocr.text}`);
          }

          // Collect descriptions
          if (apiResult.description?.description) {
            allDescriptions.push(`[Frame ${i + 1} @ ${formatTimestamp(frame.timestamp)}]: ${apiResult.description.description}`);
          }
        }
      }

      // Deduplicate objects by class name (keep highest confidence)
      const uniqueObjects: DetectedObject[] = [];
      const seenClasses = new Map<string, DetectedObject>();
      for (const obj of allObjects) {
        const className = obj.class_name || obj.class || '';
        const existing = seenClasses.get(className);
        if (!existing || obj.confidence > existing.confidence) {
          seenClasses.set(className, obj);
        }
      }
      uniqueObjects.push(...seenClasses.values());

      // Combine results
      const combinedResult: ProcessingResult = {
        objects: uniqueObjects,
        faces: allFaces,
        text: allTexts.length > 0 ? allTexts.join('\n\n') : undefined,
        description: allDescriptions.length > 0 ? allDescriptions.join('\n\n') : undefined,
      };

      setResult(combinedResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setProcessingAllFrames(false);
      setFrameProgress(null);
    }
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleClear = () => {
    setImageUrl(null);
    setImageBase64(null);
    setAssetId(null);
    setResult(null);
    setError(null);
    setVideoFrames([]);
    setFrameProgress(null);
  };

  const handleProcess = async () => {
    if (!imageUrl && !imageBase64) return;
    if (operations.length === 0) {
      setError('Please select at least one operation');
      return;
    }
    if (storeResults && !assetId) {
      setError('Select an asset from library to store results');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const params: Record<string, unknown> = {
        operations: operations,
        store_results: storeResults,
      };

      if (assetId) {
        params.asset_id = assetId;
      }

      if (imageBase64) {
        params.image_base64 = imageBase64;
      } else if (imageUrl) {
        params.image_url = imageUrl;
      }

      const response = await aiApi.processImage(params as Parameters<typeof aiApi.processImage>[0]);

      if (response.success && response.data) {
        // Transform nested API response to flat structure for display
        const apiResult = response.data.result || response.data;
        const transformed: ProcessingResult = {
          asset_id: apiResult.asset_id,
          objects: apiResult.objects?.objects || [],
          faces: apiResult.faces?.faces || [],
          text: apiResult.ocr?.text || undefined,
          description: apiResult.description?.description || undefined,
          embedding: apiResult.embedding?.dimension ? new Array(apiResult.embedding.dimension) : undefined,
        };
        setResult(transformed);
      } else {
        setError(response.error || 'Processing failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
        Single Image Test
      </h3>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
        Test AI processing on a single image before batch operations.
      </p>

      {/* Image Picker */}
      <div style={{ marginBottom: '1.5rem' }}>
        <ImagePicker
          imageUrl={imageUrl}
          onImageSelect={handleImageSelect}
          onClear={handleClear}
          disabled={loading || processingAllFrames}
          onVideoFramesExtracted={handleVideoFramesExtracted}
        />
      </div>

      {/* Operations */}
      <div className="form-group">
        <label className="form-group__label">Operations</label>
        <OperationSelector
          selected={operations}
          onChange={setOperations}
          disabled={loading}
        />
      </div>

      {/* Store Results Toggle */}
      <div className="form-group">
        <label className="operation-selector__item" style={{ display: 'inline-flex', cursor: 'pointer' }}>
          <input
            type="checkbox"
            className="operation-selector__checkbox"
            checked={storeResults}
            onChange={(e) => setStoreResults(e.target.checked)}
            disabled={loading}
          />
          <span className="operation-selector__label">
            Store results to database
          </span>
        </label>
        {storeResults && (
          <p className="form-group__help" style={{ color: assetId ? '#059669' : '#dc2626' }}>
            {assetId
              ? `✓ Will save to asset: ${assetId.slice(0, 8)}...`
              : '⚠ Select image from library (not drag & drop) to store results'}
          </p>
        )}
      </div>

      {/* Error */}
      {error && <div className="ai-error">{error}</div>}

      {/* Process Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button
          className="ai-button ai-button--primary"
          onClick={handleProcess}
          disabled={loading || processingAllFrames || (!imageUrl && !imageBase64) || operations.length === 0}
        >
          {loading ? (
            <>
              <span className="ai-spinner" style={{ width: '1rem', height: '1rem' }} />
              Processing...
            </>
          ) : (
            'Process Current Frame'
          )}
        </button>

        {videoFrames.length > 0 && (
          <button
            className="ai-button ai-button--secondary"
            onClick={handleProcessAllFrames}
            disabled={loading || processingAllFrames || operations.length === 0}
            style={{
              background: processingAllFrames ? '#e5e7eb' : '#10b981',
              color: 'white',
              border: 'none',
            }}
          >
            {processingAllFrames ? (
              <>
                <span className="ai-spinner" style={{ width: '1rem', height: '1rem' }} />
                Processing Frame {frameProgress?.current}/{frameProgress?.total}...
              </>
            ) : (
              `🎬 Process All ${videoFrames.length} Frames`
            )}
          </button>
        )}
      </div>

      {/* Video frames info */}
      {videoFrames.length > 0 && !processingAllFrames && (
        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
          💡 Tip: "Process All Frames" analyzes all extracted frames and combines detected objects, faces, and text.
        </p>
      )}

      {/* Results */}
      <ProcessingResults result={result} loading={loading} />
    </div>
  );
};
