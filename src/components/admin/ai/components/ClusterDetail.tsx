/**
 * ClusterDetail Component
 * Shows details of a selected face cluster with face selection
 */

import React, { useState, useEffect } from 'react';
import type { FaceCluster, SampleFace } from '../../../../types/ai';

interface ClusterDetailProps {
  cluster: FaceCluster;
  sampleFaces?: SampleFace[];
  onClose: () => void;
  onAssign: (excludedFaceIds: string[]) => void;
  loading?: boolean;
}

export const ClusterDetail: React.FC<ClusterDetailProps> = ({
  cluster,
  sampleFaces = [],
  onClose,
  onAssign,
  loading = false,
}) => {
  // Track which faces are excluded (unchecked)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // Reset exclusions when cluster changes
  useEffect(() => {
    setExcludedIds(new Set());
  }, [cluster.id]);

  const toggleFace = (faceId: string) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      if (next.has(faceId)) {
        next.delete(faceId);
      } else {
        next.add(faceId);
      }
      return next;
    });
  };

  const handleAssignClick = () => {
    onAssign(Array.from(excludedIds));
  };

  const includedCount = sampleFaces.length - excludedIds.size;

  return (
    <div className="cluster-detail">
      <div className="cluster-detail__header">
        <div>
          <h3 className="cluster-detail__title">
            {cluster.name || 'Unknown Person'}
          </h3>
          <p className="cluster-detail__subtitle">
            {cluster.face_count} {cluster.face_count === 1 ? 'face' : 'faces'} in cluster
          </p>
        </div>
        <button className="cluster-detail__close" onClick={onClose}>
          ×
        </button>
      </div>

      {/* Status */}
      <div className="cluster-detail__status">
        {cluster.knox_contact_id ? (
          <span className="cluster-card__badge cluster-card__badge--labeled">
            Linked to contact
          </span>
        ) : (
          <span className="cluster-card__badge cluster-card__badge--unlabeled">
            Not linked
          </span>
        )}
      </div>

      {/* All faces with selection */}
      {loading ? (
        <div className="ai-empty" style={{ padding: '1rem' }}>
          <div className="ai-spinner" />
        </div>
      ) : (
        <div className="cluster-detail__faces-section">
          <h4 className="cluster-detail__faces-title">
            Faces ({includedCount} of {sampleFaces.length} selected)
          </h4>
          <p className="cluster-detail__faces-hint">
            Click faces to exclude them from assignment
          </p>
          <div className="cluster-detail__faces-grid">
            {sampleFaces.length > 0 ? (
              sampleFaces.map((face, i) => {
                const faceId = face.id || `${face.asset_id}-${face.face_index}`;
                const isExcluded = excludedIds.has(faceId);

                return (
                  <div
                    key={faceId}
                    onClick={() => toggleFace(faceId)}
                    className={`cluster-detail__face ${isExcluded ? 'cluster-detail__face--excluded' : ''}`}
                  >
                    {face.thumbnail_url ? (
                      <>
                        <img
                          src={face.thumbnail_url}
                          alt={`Face ${i + 1}`}
                          className="cluster-detail__face-img"
                        />
                        {isExcluded && (
                          <div className="cluster-detail__face-excluded-mark">
                            ✕
                          </div>
                        )}
                        {face.is_from_video && (
                          <div className="cluster-detail__face-video-badge">
                            ▶
                          </div>
                        )}
                      </>
                    ) : (
                      '👤'
                    )}
                  </div>
                );
              })
            ) : (
              <p className="cluster-detail__empty">
                No face samples available
              </p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="cluster-detail__actions">
        <button
          className="ai-button ai-button--primary"
          onClick={handleAssignClick}
          style={{ flex: 1 }}
        >
          {cluster.knox_contact_id ? 'Change Contact' : 'Assign to Contact'}
        </button>
      </div>
    </div>
  );
};
