/**
 * TagSyncPreviewTab Component
 * Preview and apply manual face tag to AI detection matching
 */

import React, { useState, useCallback, useRef } from 'react';
import { aiApi } from '../../../services/aiApi';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TaggedBy {
  source?: string;
  worker_id?: string;
  model?: string;
  similarity?: number;
}

interface ManualTag {
  tag_id: string;
  contact_id: string;
  contact_name?: string;
  bounding_box: BoundingBox;
  tagged_by?: TaggedBy | null;
}

interface AIDetection {
  face_id: string;
  bounding_box: BoundingBox;
  cluster_id?: string;
  thumbnail_url?: string;
}

interface TagMatch {
  manual_tag_id: string;
  ai_face_id: string;
  iou_score: number;
  status: 'matched' | 'low_confidence' | 'no_match';
}

interface DetectedObject {
  id: string;
  object_class: string;
  confidence: number;
  bounding_box?: BoundingBox;
  model_version?: string;
}

interface AssetPreview {
  asset_id: string;
  thumbnail_url?: string;
  image_width?: number;
  image_height?: number;
  metadata?: any;
  manual_tags: ManualTag[];
  ai_detections: AIDetection[];
  detected_objects?: DetectedObject[];
  matches: TagMatch[];
}

interface Summary {
  total_assets: number;
  total_manual_tags: number;
  total_ai_faces: number;
  matched: number;
  unmatched_manual: number;
  unmatched_ai: number;
}

export const TagSyncPreviewTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessStatus, setReprocessStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetPreview[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [iouThreshold, setIouThreshold] = useState(0.4);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [renderedSizes, setRenderedSizes] = useState<Record<string, { naturalWidth: number; naturalHeight: number; displayWidth: number; displayHeight: number }>>({});

  // Tag source: manual (green), AI-matched (purple), or AI detection (blue)
  const isAiMatched = (tag: ManualTag): boolean => !!tag.tagged_by?.source;
  const getTagColor = (tag: ManualTag): string => isAiMatched(tag) ? '#a855f7' : '#22c55e';
  const getTagLabel = (tag: ManualTag): string => isAiMatched(tag) ? 'AI Matched' : 'Manual';

  // Helper to calculate position in 0-100 range for SVG viewBox
  // Manual tags use normalized 0-1 values, AI detections may use pixels
  const getBboxCoord = (value: number, dimension: number | undefined, isNormalized: boolean): number => {
    if (isNormalized) {
      // Already 0-1 range, just multiply by 100
      return value * 100;
    }
    // Pixel values - divide by dimension
    if (!dimension || dimension === 0) return 0;
    return (value / dimension) * 100;
  };

  // Check if bounding box values are normalized (0-1) or pixel values
  const isNormalizedBbox = (bbox: BoundingBox): boolean => {
    return bbox.x <= 1 && bbox.y <= 1 && bbox.width <= 1 && bbox.height <= 1;
  };

  const loadPreview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await aiApi.previewTagSync({ iou_threshold: iouThreshold, limit: 200 });
      if (result.success && result.data) {
        setAssets(result.data.assets);
        setSummary(result.data.summary);
        const initialSelected = new Set<string>();
        result.data.assets.forEach(asset => {
          asset.matches.forEach(match => {
            if (match.status === 'matched') {
              initialSelected.add(`${match.manual_tag_id}:${match.ai_face_id}`);
            }
          });
        });
        setSelectedMatches(initialSelected);
      } else {
        setError(result.error || 'Failed to load preview');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  }, [iouThreshold]);

  const toggleMatch = (manualTagId: string, aiFaceId: string) => {
    const key = `${manualTagId}:${aiFaceId}`;
    setSelectedMatches(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const applyMatches = async () => {
    const matches = Array.from(selectedMatches).map(key => {
      const [manual_tag_id, ai_face_id] = key.split(':');
      return { manual_tag_id, ai_face_id };
    });

    if (matches.length === 0) {
      setError('No matches selected');
      return;
    }

    try {
      setApplying(true);
      setError(null);
      const result = await aiApi.applyTagSync(matches);
      if (result.success && result.data) {
        alert(`Applied ${result.data.applied} matches successfully!`);
        loadPreview();
      } else {
        setError(result.error || 'Failed to apply matches');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply matches');
    } finally {
      setApplying(false);
    }
  };

  const reprocessAssets = async () => {
    if (assets.length === 0) return;
    const assetIds = assets.map(a => a.asset_id);
    try {
      setReprocessing(true);
      setError(null);
      setReprocessStatus(`Submitting ${assetIds.length} assets for reprocessing (faces + objects)...`);
      const result = await aiApi.processBatch({
        asset_ids: assetIds,
        operations: ['faces', 'objects'],
        force_reprocess: true,
      });
      if (result.success && result.data) {
        setReprocessStatus(`Job started: ${result.data.total} assets queued. Reload preview when done.`);
      } else {
        setError(result.error || 'Failed to start reprocessing');
        setReprocessStatus(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start reprocessing');
      setReprocessStatus(null);
    } finally {
      setReprocessing(false);
    }
  };

  const getMatchStatus = (match: TagMatch): string => {
    const key = `${match.manual_tag_id}:${match.ai_face_id}`;
    const isSelected = selectedMatches.has(key);
    if (match.status === 'matched' && isSelected) return 'selected-match';
    if (match.status === 'matched' && !isSelected) return 'deselected-match';
    if (match.status === 'low_confidence' && isSelected) return 'selected-low';
    if (match.status === 'low_confidence' && !isSelected) return 'unselected-low';
    return 'no-match';
  };

  return (
    <div className="tag-sync-preview-tab">
      <div className="section-header">
        <h3>Tag Sync Preview</h3>
        <p className="section-description">
          Compare manual face tags from the mobile app with AI detections.
          Review matches and apply confirmed ones to train clustering.
        </p>
      </div>

      <div className="controls-row">
        <div className="threshold-control">
          <label>IoU Threshold:</label>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.1"
            value={iouThreshold}
            onChange={(e) => setIouThreshold(parseFloat(e.target.value))}
          />
          <span>{iouThreshold.toFixed(1)}</span>
        </div>
        <label className="debug-toggle">
          <input
            type="checkbox"
            checked={showDebug}
            onChange={(e) => setShowDebug(e.target.checked)}
          />
          Show Debug Info
        </label>
        <button
          className="btn btn-primary"
          onClick={loadPreview}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Load Preview'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {reprocessStatus && (
        <div className="reprocess-status">{reprocessStatus}</div>
      )}

      {summary && (
        <div className="summary-cards">
          <div className="summary-card">
            <span className="summary-value">{summary.total_assets}</span>
            <span className="summary-label">Assets</span>
          </div>
          {(() => {
            const manualCount = assets.reduce((sum, a) => sum + a.manual_tags.filter(t => !t.tagged_by?.source).length, 0);
            const aiMatchedCount = assets.reduce((sum, a) => sum + a.manual_tags.filter(t => !!t.tagged_by?.source).length, 0);
            return (
              <>
                <div className="summary-card">
                  <span className="summary-value">{manualCount}</span>
                  <span className="summary-label">Manual Tags</span>
                </div>
                {aiMatchedCount > 0 && (
                  <div className="summary-card" style={{ borderColor: '#a855f7' }}>
                    <span className="summary-value" style={{ color: '#a855f7' }}>{aiMatchedCount}</span>
                    <span className="summary-label">AI Matched</span>
                  </div>
                )}
              </>
            );
          })()}
          <div className="summary-card">
            <span className="summary-value">{summary.total_ai_faces}</span>
            <span className="summary-label">AI Detections</span>
          </div>
          <div className="summary-card success">
            <span className="summary-value">{summary.matched}</span>
            <span className="summary-label">Matched</span>
          </div>
          <div className="summary-card warning">
            <span className="summary-value">{summary.unmatched_manual}</span>
            <span className="summary-label">Unmatched Tags</span>
          </div>
          <div className="summary-card info">
            <span className="summary-value">{summary.unmatched_ai}</span>
            <span className="summary-label">Unmatched AI</span>
          </div>
        </div>
      )}

      {assets.length > 0 && (
        <>
          <div className="apply-section">
            <span>{selectedMatches.size} matches selected</span>
            <div className="apply-section__buttons">
              <button
                className="btn btn-secondary"
                onClick={reprocessAssets}
                disabled={reprocessing}
              >
                {reprocessing ? 'Submitting...' : `Reprocess ${assets.length} Assets (Faces + Objects)`}
              </button>
              <button
                className="btn btn-success"
                onClick={applyMatches}
                disabled={applying || selectedMatches.size === 0}
              >
                {applying ? 'Applying...' : `Apply ${selectedMatches.size} Matches`}
              </button>
            </div>
          </div>

          <div className="assets-grid">
            {assets.map((asset, index) => (
              <div
                key={asset.asset_id}
                className={`asset-preview-card ${expandedAsset === asset.asset_id ? 'expanded' : ''}`}
                onClick={() => setExpandedAsset(expandedAsset === asset.asset_id ? null : asset.asset_id)}
              >
                <div className="asset-image-container">
                  {asset.thumbnail_url ? (
                    <img
                      src={asset.thumbnail_url}
                      alt="Asset"
                      className="asset-thumbnail"
                      onLoad={(e) => {
                        const img = e.target as HTMLImageElement;
                        setRenderedSizes(prev => ({
                          ...prev,
                          [asset.asset_id]: {
                            naturalWidth: img.naturalWidth,
                            naturalHeight: img.naturalHeight,
                            displayWidth: img.clientWidth,
                            displayHeight: img.clientHeight
                          }
                        }));
                      }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        target.nextElementSibling?.classList.add('visible');
                      }}
                    />
                  ) : null}
                  <div className={`no-thumbnail ${!asset.thumbnail_url ? 'visible' : ''}`}>
                    No Image
                    <span className="debug-url" style={{ marginTop: '0.5rem', fontSize: '0.6rem' }}>
                      ID: {asset.asset_id.slice(0, 8)}...
                    </span>
                    {showDebug && <span className="debug-url">{asset.thumbnail_url || 'thumbnail: null'}</span>}
                  </div>
                  <svg className="bbox-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {asset.manual_tags.map(tag => {
                      const isNorm = isNormalizedBbox(tag.bounding_box);
                      const color = getTagColor(tag);
                      return (
                        <g key={tag.tag_id}>
                          <rect
                            x={getBboxCoord(tag.bounding_box.x, asset.image_width, isNorm)}
                            y={getBboxCoord(tag.bounding_box.y, asset.image_height, isNorm)}
                            width={getBboxCoord(tag.bounding_box.width, asset.image_width, isNorm)}
                            height={getBboxCoord(tag.bounding_box.height, asset.image_height, isNorm)}
                            fill="none"
                            stroke={color}
                            strokeWidth="1"
                            strokeDasharray={isAiMatched(tag) ? '2 1' : undefined}
                          />
                          <text
                            x={getBboxCoord(tag.bounding_box.x, asset.image_width, isNorm)}
                            y={Math.max(2, getBboxCoord(tag.bounding_box.y, asset.image_height, isNorm) - 1)}
                            fill={color}
                            fontSize="3"
                            fontWeight="bold"
                            style={{ textShadow: '0 0 2px white' }}
                          >
                            {tag.contact_name || 'Unknown'}
                          </text>
                        </g>
                      );
                    })}
                    {(() => {
                      // Skip blue boxes for AI detections already covered by AI-matched tags
                      const aiMatchedTagIds = new Set(
                        asset.manual_tags.filter(t => isAiMatched(t)).map(t => t.tag_id)
                      );
                      const coveredAiFaceIds = new Set(
                        asset.matches
                          .filter(m => aiMatchedTagIds.has(m.manual_tag_id))
                          .map(m => m.ai_face_id)
                      );
                      return asset.ai_detections
                        .filter(det => !coveredAiFaceIds.has(det.face_id))
                        .map(det => {
                          const isNorm = isNormalizedBbox(det.bounding_box);
                          return (
                            <rect
                              key={det.face_id}
                              x={getBboxCoord(det.bounding_box.x, asset.image_width, isNorm)}
                              y={getBboxCoord(det.bounding_box.y, asset.image_height, isNorm)}
                              width={getBboxCoord(det.bounding_box.width, asset.image_width, isNorm)}
                              height={getBboxCoord(det.bounding_box.height, asset.image_height, isNorm)}
                              fill="none"
                              stroke="#3b82f6"
                              strokeWidth="1"
                              strokeDasharray="2 1"
                            />
                          );
                        });
                    })()}
                  </svg>
                </div>
                <div className="asset-info">
                  <span className="tag-count" style={{ background: '#1f2937', color: 'white' }}>#{index}</span>
                  {(() => {
                    const manualCount = asset.manual_tags.filter(t => !t.tagged_by?.source).length;
                    const aiMatchedCount = asset.manual_tags.filter(t => !!t.tagged_by?.source).length;
                    return (
                      <>
                        {manualCount > 0 && (
                          <span className="tag-count green">{manualCount} manual</span>
                        )}
                        {aiMatchedCount > 0 && (
                          <span className="tag-count" style={{ background: '#a855f7', color: 'white' }}>{aiMatchedCount} AI matched</span>
                        )}
                      </>
                    );
                  })()}
                  <span className="tag-count blue">{asset.ai_detections.length} AI</span>
                  <span className="tag-count">{asset.matches.filter(m => m.status === 'matched').length} matches</span>
                  {(asset.detected_objects?.length ?? 0) > 0 && (
                    <span className="tag-count" style={{ background: '#a855f7', color: 'white' }}>
                      {asset.detected_objects!.length} objects
                    </span>
                  )}
                </div>
                {showDebug && (
                  <div className="debug-info" onClick={e => e.stopPropagation()}>
                    <div className="debug-dimensions">
                      <strong>DB Dimensions:</strong> {asset.image_width ?? 'null'} x {asset.image_height ?? 'null'}
                      {' | '}
                      <strong>Actual Image:</strong> {renderedSizes[asset.asset_id]?.naturalWidth ?? '?'} x {renderedSizes[asset.asset_id]?.naturalHeight ?? '?'}
                    </div>
                    <div className="debug-boxes">
                      <strong>Tags ({asset.manual_tags.length}):</strong>
                      {asset.manual_tags.map(tag => {
                        const isNorm = tag.bounding_box ? isNormalizedBbox(tag.bounding_box) : false;
                        const color = getTagColor(tag);
                        return (
                          <div key={tag.tag_id} className="debug-box-item">
                            <span style={{color}}>[{getTagLabel(tag)}]</span>{' '}
                            {tag.contact_name}: x={tag.bounding_box?.x?.toFixed(3) ?? 'null'}, y={tag.bounding_box?.y?.toFixed(3) ?? 'null'},
                            w={tag.bounding_box?.width?.toFixed(3) ?? 'null'}, h={tag.bounding_box?.height?.toFixed(3) ?? 'null'}
                            <span style={{color: '#059669'}}> [{isNorm ? 'normalized' : 'pixels'}] → {getBboxCoord(tag.bounding_box?.x || 0, asset.image_width, isNorm).toFixed(1)}%, {getBboxCoord(tag.bounding_box?.y || 0, asset.image_height, isNorm).toFixed(1)}%</span>
                          </div>
                        );
                      })}
                      <strong>AI Detections ({asset.ai_detections.length}):</strong>
                      {asset.ai_detections.map(det => {
                        const isNorm = det.bounding_box ? isNormalizedBbox(det.bounding_box) : false;
                        return (
                          <div key={det.face_id} className="debug-box-item">
                            face: x={det.bounding_box?.x?.toFixed(3) ?? 'null'}, y={det.bounding_box?.y?.toFixed(3) ?? 'null'},
                            w={det.bounding_box?.width?.toFixed(3) ?? 'null'}, h={det.bounding_box?.height?.toFixed(3) ?? 'null'}
                            <span style={{color: '#3b82f6'}}> [{isNorm ? 'normalized' : 'pixels'}] → {getBboxCoord(det.bounding_box?.x || 0, asset.image_width, isNorm).toFixed(1)}%, {getBboxCoord(det.bounding_box?.y || 0, asset.image_height, isNorm).toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                    {(asset.detected_objects?.length ?? 0) > 0 && (
                      <div className="debug-boxes">
                        <strong style={{color: '#a855f7'}}>Detected Objects ({asset.detected_objects!.length}):</strong>
                        {asset.detected_objects!.map(obj => (
                          <div key={obj.id} className="debug-box-item">
                            <span style={{color: '#a855f7'}}>{obj.object_class}</span>
                            {' '}confidence: {(obj.confidence * 100).toFixed(0)}%
                            {obj.bounding_box && (
                              <span style={{color: '#9ca3af'}}>
                                {' '}bbox: [{obj.bounding_box.x.toFixed(1)}, {obj.bounding_box.y.toFixed(1)}, {obj.bounding_box.width.toFixed(1)}, {obj.bounding_box.height.toFixed(1)}]
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {expandedAsset === asset.asset_id && (
                  <div className="matches-list" onClick={e => e.stopPropagation()}>
                    <h4>Matches</h4>
                    {asset.matches.length === 0 ? (
                      <p className="no-matches">No matches found</p>
                    ) : (
                      asset.matches.map(match => {
                        const manualTag = asset.manual_tags.find(t => t.tag_id === match.manual_tag_id);
                        const aiDet = asset.ai_detections.find(d => d.face_id === match.ai_face_id);
                        return (
                          <div
                            key={`${match.manual_tag_id}-${match.ai_face_id}`}
                            className={`match-item ${getMatchStatus(match)}`}
                            onClick={() => toggleMatch(match.manual_tag_id, match.ai_face_id)}
                          >
                            <input
                              type="checkbox"
                              checked={selectedMatches.has(`${match.manual_tag_id}:${match.ai_face_id}`)}
                              onChange={() => {}}
                            />
                            <a
                              className="contact-name"
                              href={`/admin/contacts?id=${manualTag?.contact_id || ''}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}
                              title="Open contact details"
                            >
                              {manualTag?.contact_name || 'Unknown'}
                            </a>
                            <span className="iou-score">IoU: {(match.iou_score * 100).toFixed(0)}%</span>
                            {aiDet?.thumbnail_url && (
                              <img src={aiDet.thumbnail_url} alt="Face" className="face-thumb" />
                            )}
                            <span className={`status-badge ${match.status}`}>{match.status}</span>
                          </div>
                        );
                      })
                    )}
                    <div className="legend">
                      <span className="legend-item"><span className="box green"></span> Manual Tag</span>
                      <span className="legend-item"><span className="box purple dashed"></span> AI Matched</span>
                      <span className="legend-item"><span className="box blue dashed"></span> AI Detection</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
