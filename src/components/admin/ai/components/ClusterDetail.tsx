/**
 * ClusterDetail Component
 * Shows details of a selected face cluster
 */

import React from 'react';
import type { FaceCluster, SampleFace } from '../../../../types/ai';

interface ClusterDetailProps {
  cluster: FaceCluster;
  sampleFaces?: SampleFace[];
  onClose: () => void;
  onAssign: () => void;
  loading?: boolean;
}

export const ClusterDetail: React.FC<ClusterDetailProps> = ({
  cluster,
  sampleFaces = [],
  onClose,
  onAssign,
  loading = false,
}) => {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '0.5rem',
      padding: '1rem',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '1rem',
      }}>
        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
            {cluster.name || 'Unknown Person'}
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {cluster.face_count} {cluster.face_count === 1 ? 'face' : 'faces'} in cluster
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            color: '#6b7280',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>

      {/* Status */}
      <div style={{ marginBottom: '1rem' }}>
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

      {/* Sample faces */}
      {loading ? (
        <div className="ai-empty" style={{ padding: '1rem' }}>
          <div className="ai-spinner" />
        </div>
      ) : (
        <div style={{ marginBottom: '1rem' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
            Sample Faces
          </h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.5rem',
          }}>
            {sampleFaces.length > 0 ? (
              sampleFaces.slice(0, 8).map((face, i) => (
                <div
                  key={face.id || i}
                  style={{
                    aspectRatio: '1',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                  }}
                >
                  {face.thumbnail_url ? (
                    <img
                      src={face.thumbnail_url}
                      alt={`Face ${i + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '0.25rem',
                      }}
                    />
                  ) : (
                    '👤'
                  )}
                </div>
              ))
            ) : (
              <p style={{ gridColumn: 'span 4', color: '#9ca3af', fontSize: '0.875rem' }}>
                No face samples available
              </p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          className="ai-button ai-button--primary"
          onClick={onAssign}
          style={{ flex: 1 }}
        >
          {cluster.knox_contact_id ? 'Change Contact' : 'Assign to Contact'}
        </button>
      </div>
    </div>
  );
};
