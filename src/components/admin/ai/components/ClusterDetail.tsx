/**
 * ClusterDetail Component
 * Shows details of a selected face cluster with face selection
 */

import React, { useState, useEffect } from 'react';
import type { FaceCluster, SampleFace } from '../../../../types/ai';
import { contactsApi, type Contact } from '../../../../services/contactsApi';

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
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [linkedContact, setLinkedContact] = useState<Contact | null>(null);

  // Reset exclusions and fetch contact when cluster changes
  useEffect(() => {
    setExcludedIds(new Set());
    setLinkedContact(null);

    if (cluster.contact_id) {
      contactsApi.getContact(cluster.contact_id).then(contact => {
        if (contact) setLinkedContact(contact);
      });
    }
  }, [cluster.id, cluster.contact_id]);

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

      {/* Status / Linked Contact */}
      <div className="cluster-detail__status">
        {cluster.contact_id ? (
          linkedContact ? (
            <div style={{
              padding: '0.75rem',
              backgroundColor: '#f0fdf4',
              borderRadius: '0.5rem',
              border: '1px solid #bbf7d0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                {linkedContact.avatar_url ? (
                  <img
                    src={linkedContact.avatar_url}
                    alt=""
                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    backgroundColor: '#d1fae5', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 600, color: '#065f46',
                  }}>
                    {(linkedContact.display_name || linkedContact.first_name || '?')[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#065f46' }}>
                    {linkedContact.display_name || [linkedContact.first_name, linkedContact.last_name].filter(Boolean).join(' ') || 'Unknown'}
                  </div>
                  {linkedContact.relationship_type && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {linkedContact.relationship_type}
                    </div>
                  )}
                </div>
              </div>
              {linkedContact.email_addresses?.[0] && (
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {linkedContact.email_addresses[0].email}
                </div>
              )}
              {linkedContact.phone_numbers?.[0] && (
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.125rem' }}>
                  {linkedContact.phone_numbers[0].number}
                </div>
              )}
            </div>
          ) : (
            <span className="cluster-card__badge cluster-card__badge--labeled">
              Linked to contact
            </span>
          )
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
          {cluster.contact_id ? 'Change Contact' : 'Assign to Contact'}
        </button>
      </div>
    </div>
  );
};
