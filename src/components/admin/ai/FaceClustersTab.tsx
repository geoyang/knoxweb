/**
 * FaceClustersTab Component
 * Manage face clusters and assign to contacts
 */

import React, { useState, useEffect, useCallback } from 'react';
import { aiApi } from '../../../services/aiApi';
import { contactsApi } from '../../../services/contactsApi';
import { ClusterGrid, ClusterDetail, ContactAssignModal, ProgressBar } from './components';
import { useSingleJobPolling } from './hooks/useJobPolling';
import type { FaceCluster, SampleFace } from '../../../types/ai';

interface Contact {
  id: string;
  name: string;
}

export const FaceClustersTab: React.FC = () => {
  const [clusters, setClusters] = useState<FaceCluster[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<FaceCluster | null>(null);
  const [sampleFaces, setSampleFaces] = useState<SampleFace[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [excludedFaceIds, setExcludedFaceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clusteringJobId, setClusteringJobId] = useState<string | null>(null);
  const [backfillRunning, setBackfillRunning] = useState(false);

  // Poll for clustering job status
  const { job: clusteringJob, notFound: jobNotFound } = useSingleJobPolling(clusteringJobId);

  // Clear job ID if job not found (e.g., after server restart)
  useEffect(() => {
    if (jobNotFound && clusteringJobId) {
      setClusteringJobId(null);
    }
  }, [jobNotFound, clusteringJobId]);

  // Load clusters
  const loadClusters = useCallback(async () => {
    try {
      setLoading(true);
      const result = await aiApi.getClusters();
      if (result.success && result.data) {
        // Map cluster_id to id for frontend compatibility
        const mappedClusters = (result.data.clusters || []).map((c: {
          cluster_id: string;
          name?: string;
          contact_id?: string;
          face_count: number;
          sample_faces?: { asset_id: string; face_index: number; thumbnail_url?: string; is_from_video?: boolean }[];
        }) => ({
          id: c.cluster_id,
          name: c.name,
          contact_id: c.contact_id,
          face_count: c.face_count,
          sample_faces: c.sample_faces
        }));
        setClusters(mappedClusters);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clusters');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load contacts
  const loadContacts = useCallback(async () => {
    try {
      const result = await contactsApi.getContacts();
      if (result.contacts && result.contacts.length > 0) {
        setContacts(result.contacts.map((c) => ({
          id: c.id,
          name: c.display_name || c.first_name || 'Unknown',
        })));
      }
    } catch (err) {
      console.error('Failed to load contacts:', err);
    }
  }, []);

  useEffect(() => {
    loadClusters();
    loadContacts();
  }, [loadClusters, loadContacts]);

  // Check if clustering/backfill is complete and refresh
  useEffect(() => {
    if (clusteringJob?.status === 'completed') {
      loadClusters();
      setBackfillRunning(false);
      // Clear job ID after a short delay to show completion
      setTimeout(() => setClusteringJobId(null), 1500);
    } else if (clusteringJob?.status === 'failed') {
      setError(clusteringJob.error_message || 'Job failed');
      setBackfillRunning(false);
      setTimeout(() => setClusteringJobId(null), 3000);
    }
  }, [clusteringJob?.status, loadClusters]);

  // Load cluster detail with ALL faces
  const handleSelectCluster = async (clusterId: string) => {
    setSelectedClusterId(clusterId);
    setDetailLoading(true);

    try {
      // Get cluster info and ALL faces in parallel
      const [clusterResult, facesResult] = await Promise.all([
        aiApi.getCluster(clusterId),
        aiApi.getClusterFaces(clusterId),
      ]);

      if (clusterResult.success && clusterResult.data) {
        const clusterData = clusterResult.data.cluster || clusterResult.data;
        const mappedCluster = {
          id: clusterData.cluster_id || clusterData.id,
          name: clusterData.name,
          contact_id: clusterData.contact_id,
          face_count: clusterData.face_count,
        };
        setSelectedCluster(mappedCluster);
      }

      if (facesResult.success && facesResult.data) {
        setSampleFaces(facesResult.data.faces || []);
      }
    } catch (err) {
      console.error('Failed to load cluster detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedClusterId(null);
    setSelectedCluster(null);
    setSampleFaces([]);
    setExcludedFaceIds([]);
  };

  const handleToggleSelect = (clusterId: string) => {
    setSelectedIds(prev =>
      prev.includes(clusterId)
        ? prev.filter(id => id !== clusterId)
        : [...prev, clusterId]
    );
  };

  const handleAssign = async (contactId: string, name?: string) => {
    if (!selectedClusterId) return;

    try {
      const result = await aiApi.assignCluster(
        selectedClusterId,
        contactId,
        name,
        excludedFaceIds.length > 0 ? excludedFaceIds : undefined
      );
      if (result.success) {
        setShowAssignModal(false);
        setExcludedFaceIds([]);
        loadClusters();
        handleCloseDetail();
      }
    } catch (err) {
      console.error('Failed to assign cluster:', err);
    }
  };

  const handleMerge = async () => {
    if (selectedIds.length < 2) return;

    try {
      const result = await aiApi.mergeClusters(selectedIds);
      if (result.success) {
        setSelectedIds([]);
        setSelectionMode(false);
        loadClusters();
      }
    } catch (err) {
      console.error('Failed to merge clusters:', err);
    }
  };

  const handleRunClustering = async () => {
    try {
      setError(null);
      const result = await aiApi.runClustering();
      if (result.success && result.data?.job_id) {
        // Set the job ID to start polling for status
        setClusteringJobId(result.data.job_id);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      console.error('Failed to run clustering:', err);
      setError(err instanceof Error ? err.message : 'Failed to start clustering');
    }
  };

  const handleBackfillThumbnails = async () => {
    try {
      setError(null);
      setBackfillRunning(true);
      const result = await aiApi.backfillFaceThumbnails();
      if (result.success && result.data?.job_id) {
        // Set job ID to poll for status
        setClusteringJobId(result.data.job_id);
      } else if (result.error) {
        setError(result.error);
        setBackfillRunning(false);
      }
    } catch (err) {
      console.error('Failed to backfill thumbnails:', err);
      setError(err instanceof Error ? err.message : 'Failed to start backfill');
      setBackfillRunning(false);
    }
  };

  const handleClearClustering = async (clearThumbnails: boolean = false) => {
    const confirmMsg = clearThumbnails
      ? 'This will delete all face clusters AND thumbnails. You will need to re-run clustering and regenerate thumbnails. Continue?'
      : 'This will delete all face clusters and contact assignments. Continue?';

    if (!window.confirm(confirmMsg)) return;

    try {
      setError(null);
      setLoading(true);
      const result = await aiApi.clearClustering(clearThumbnails);
      if (result.success) {
        loadClusters();
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      console.error('Failed to clear clustering:', err);
      setError(err instanceof Error ? err.message : 'Failed to clear clustering');
    } finally {
      setLoading(false);
    }
  };

  const isClusteringRunning = clusteringJobId !== null &&
    clusteringJob?.status !== 'completed' &&
    clusteringJob?.status !== 'failed';

  const getClusteringStatusMessage = () => {
    if (!clusteringJob) return 'Starting clustering...';
    switch (clusteringJob.status) {
      case 'pending': return 'Preparing to cluster faces...';
      case 'processing': return 'Clustering faces...';
      case 'completed': return 'Clustering complete!';
      case 'failed': return 'Clustering failed';
      default: return 'Processing...';
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600' }}>Face Clusters</h3>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {clusters.length} clusters found
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`ai-button ${selectionMode ? 'ai-button--primary' : 'ai-button--secondary'}`}
            onClick={() => {
              setSelectionMode(!selectionMode);
              setSelectedIds([]);
            }}
            disabled={isClusteringRunning}
          >
            {selectionMode ? 'Cancel Selection' : 'Select for Merge'}
          </button>
          <button
            className="ai-button ai-button--primary"
            onClick={handleRunClustering}
            disabled={isClusteringRunning}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: isClusteringRunning ? 0.7 : 1
            }}
          >
            {isClusteringRunning && (
              <span className="spinner" style={{
                width: '14px',
                height: '14px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
            )}
            {isClusteringRunning ? 'Clustering...' : 'Run Clustering'}
          </button>
          <button
            className="ai-button ai-button--secondary"
            onClick={handleBackfillThumbnails}
            disabled={isClusteringRunning || backfillRunning}
            title="Generate cropped face thumbnails for existing faces"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: (isClusteringRunning || backfillRunning) ? 0.7 : 1
            }}
          >
            {backfillRunning && (
              <span className="spinner" style={{
                width: '14px',
                height: '14px',
                border: '2px solid rgba(0,0,0,0.3)',
                borderTopColor: '#333',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
            )}
            Crop Faces
          </button>
          <button
            className="ai-button ai-button--danger"
            onClick={() => handleClearClustering(true)}
            disabled={isClusteringRunning || backfillRunning}
            title="Clear all clustering data and thumbnails"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Clustering Progress Indicator */}
      {clusteringJobId && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: clusteringJob?.status === 'failed' ? '#fef2f2' :
                          clusteringJob?.status === 'completed' ? '#f0fdf4' : '#eff6ff',
          borderRadius: '0.5rem',
          border: `1px solid ${
            clusteringJob?.status === 'failed' ? '#fecaca' :
            clusteringJob?.status === 'completed' ? '#bbf7d0' : '#bfdbfe'
          }`
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: clusteringJob?.status === 'processing' ? '0.75rem' : 0
          }}>
            {clusteringJob?.status === 'completed' ? (
              <span style={{ color: '#16a34a', fontSize: '1.25rem' }}>✓</span>
            ) : clusteringJob?.status === 'failed' ? (
              <span style={{ color: '#dc2626', fontSize: '1.25rem' }}>✕</span>
            ) : (
              <span className="spinner" style={{
                width: '18px',
                height: '18px',
                border: '2px solid #bfdbfe',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
            )}
            <div>
              <div style={{
                fontWeight: 500,
                color: clusteringJob?.status === 'failed' ? '#dc2626' :
                       clusteringJob?.status === 'completed' ? '#16a34a' : '#1e40af'
              }}>
                {getClusteringStatusMessage()}
              </div>
              {clusteringJob?.processed !== undefined && clusteringJob?.total !== undefined && clusteringJob.total > 0 && (
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {clusteringJob.processed} of {clusteringJob.total} faces processed
                </div>
              )}
            </div>
          </div>
          {clusteringJob?.status === 'processing' && clusteringJob?.progress !== undefined && (
            <ProgressBar
              progress={clusteringJob.progress}
              processed={clusteringJob.processed}
              total={clusteringJob.total}
            />
          )}
        </div>
      )}

      {error && !clusteringJobId && <div className="ai-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Merge button */}
      {selectionMode && selectedIds.length >= 2 && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#eff6ff', borderRadius: '0.375rem' }}>
          <span style={{ marginRight: '1rem' }}>{selectedIds.length} clusters selected</span>
          <button className="ai-button ai-button--primary" onClick={handleMerge}>
            Merge Selected
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selectedCluster ? '1fr 300px' : '1fr', gap: '1.5rem' }}>
        {/* Cluster Grid */}
        <ClusterGrid
          clusters={clusters}
          selectedIds={selectedIds}
          onSelect={handleSelectCluster}
          onToggleSelect={handleToggleSelect}
          selectionMode={selectionMode}
          loading={loading}
        />

        {/* Detail Panel */}
        {selectedCluster && (
          <ClusterDetail
            cluster={selectedCluster}
            sampleFaces={sampleFaces}
            onClose={handleCloseDetail}
            onAssign={(excluded) => {
              setExcludedFaceIds(excluded);
              setShowAssignModal(true);
            }}
            loading={detailLoading}
          />
        )}
      </div>

      {/* Assign Modal */}
      <ContactAssignModal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        onAssign={handleAssign}
        contacts={contacts}
        clusterId={selectedClusterId || undefined}
      />
    </div>
  );
};
