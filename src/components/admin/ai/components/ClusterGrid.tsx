/**
 * ClusterGrid Component
 * Displays grid of face clusters
 */

import React from 'react';
import type { FaceCluster, SampleFace } from '../../../../types/ai';

interface ExtendedFaceCluster extends FaceCluster {
  sample_faces?: SampleFace[];
}

interface ClusterGridProps {
  clusters: ExtendedFaceCluster[];
  selectedIds?: string[];
  onSelect?: (clusterId: string) => void;
  onToggleSelect?: (clusterId: string) => void;
  selectionMode?: boolean;
  loading?: boolean;
  contactNames?: Record<string, string>;
}

export const ClusterGrid: React.FC<ClusterGridProps> = ({
  clusters,
  selectedIds = [],
  onSelect,
  onToggleSelect,
  selectionMode = false,
  loading = false,
  contactNames = {},
}) => {
  if (loading) {
    return (
      <div className="ai-empty">
        <div className="ai-spinner ai-spinner--large" />
        <p className="ai-empty__text">Loading clusters...</p>
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="ai-empty">
        <div className="ai-empty__icon">👥</div>
        <p className="ai-empty__text">No face clusters found</p>
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
          Process some images with face detection to create clusters
        </p>
      </div>
    );
  }

  const handleClick = (cluster: FaceCluster) => {
    if (selectionMode && onToggleSelect) {
      onToggleSelect(cluster.id);
    } else if (onSelect) {
      onSelect(cluster.id);
    }
  };

  return (
    <div className="cluster-grid">
      {clusters.map(cluster => {
        const isSelected = selectedIds.includes(cluster.id);
        const isLabeled = !!cluster.contact_id || !!cluster.name;
        const displayName = cluster.name
          || (cluster.contact_id && contactNames[cluster.contact_id])
          || undefined;
        const firstFace = cluster.sample_faces?.[0];
        const isFromVideo = firstFace?.is_from_video ?? false;

        return (
          <div
            key={cluster.id}
            className={`cluster-card ${isSelected ? 'cluster-card--selected' : ''}`}
            onClick={() => handleClick(cluster)}
          >
            {selectionMode && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect?.(cluster.id)}
                style={{ position: 'absolute', top: '0.5rem', left: '0.5rem' }}
                onClick={e => e.stopPropagation()}
              />
            )}

            <div
              className="cluster-card__thumbnail"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {firstFace?.thumbnail_url ? (
                <>
                  <img
                    src={firstFace.thumbnail_url}
                    alt={displayName || 'Face'}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  {isFromVideo && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '4px',
                        right: '4px',
                        background: 'rgba(0,0,0,0.7)',
                        color: 'white',
                        fontSize: '0.625rem',
                        padding: '2px 4px',
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      <span style={{ fontSize: '0.5rem' }}>▶</span> Video
                    </div>
                  )}
                </>
              ) : (
                <span>👤</span>
              )}
            </div>

            <div className="cluster-card__info">
              <div className="cluster-card__name">
                {displayName || 'Unknown'}
              </div>
              <div className="cluster-card__count">
                {cluster.face_count} {cluster.face_count === 1 ? 'face' : 'faces'}
              </div>
              <span className={`cluster-card__badge ${
                isLabeled ? 'cluster-card__badge--labeled' : 'cluster-card__badge--unlabeled'
              }`}>
                {isLabeled ? (displayName || 'Linked') : 'Unlabeled'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
