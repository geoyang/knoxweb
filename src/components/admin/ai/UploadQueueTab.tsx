/**
 * UploadQueueTab Component
 * Displays the Supabase ai_processing_jobs table (mobile upload queue)
 */

import React, { useState } from 'react';
import { useUploadQueue } from './hooks';
import type { UploadQueueJob, UploadQueueStats } from './hooks/useUploadQueue';

interface AIResult {
  embedding?: { success: boolean; dimension?: number; stored?: boolean };
  objects?: { success: boolean; count: number; objects: Array<{ class: string; confidence: number }> };
  faces?: { success: boolean; count: number; stored?: boolean; faces: Array<{ index: number; confidence: number }> };
  ocr?: { success: boolean; has_text?: boolean; text?: string };
  describe?: { success: boolean; description?: string };
  _meta?: {
    worker_id: string;
    ai_version: string;
    models: {
      clip: string;
      yolo: string;
      face: string;
      vlm: string;
    };
  };
}

const formatRelativeTime = (timestamp: string): string => {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
};

const getStatusClass = (status: string): string => {
  switch (status) {
    case 'pending': return 'upload-queue__status--pending';
    case 'processing': return 'upload-queue__status--processing';
    case 'completed': return 'upload-queue__status--completed';
    case 'failed': return 'upload-queue__status--failed';
    default: return '';
  }
};

const StatsSection: React.FC<{ stats: UploadQueueStats }> = ({ stats }) => (
  <div className="upload-queue__stats">
    <div className="queue-stat queue-stat--pending">
      <div className="queue-stat__value">{stats.pending}</div>
      <div className="queue-stat__label">Pending</div>
    </div>
    <div className="queue-stat queue-stat--processing">
      <div className="queue-stat__value">{stats.processing}</div>
      <div className="queue-stat__label">Processing</div>
    </div>
    <div className="queue-stat queue-stat--completed">
      <div className="queue-stat__value">{stats.completed}</div>
      <div className="queue-stat__label">Completed</div>
    </div>
    <div className="queue-stat queue-stat--failed">
      <div className="queue-stat__value">{stats.failed}</div>
      <div className="queue-stat__label">Failed</div>
    </div>
  </div>
);

const formatErrorMessage = (error: string | null): string => {
  if (!error) return '-';
  // Clean up common error prefixes and HTML
  const cleaned = error
    .replace(/^AI service error: \d+\s*/, '')
    .replace(/<!DOCTYPE.*$/i, '')
    .trim();
  return cleaned.length > 50 ? cleaned.slice(0, 50) + '...' : cleaned || 'Unknown error';
};

const OPERATION_LABELS: Record<string, { short: string; icon: string }> = {
  embedding: { short: 'Search', icon: '🔍' },
  faces: { short: 'Faces', icon: '👤' },
  objects: { short: 'Objects', icon: '📦' },
  ocr: { short: 'OCR', icon: '📝' },
  describe: { short: 'Captions', icon: '💬' },
};

const OperationsBadges: React.FC<{ operations?: string[] }> = ({ operations }) => {
  if (!operations || operations.length === 0) {
    return <span className="upload-queue__ops">-</span>;
  }
  return (
    <span className="upload-queue__ops">
      {operations.map(op => {
        const info = OPERATION_LABELS[op] || { short: op, icon: '⚙️' };
        return (
          <span key={op} className="upload-queue__op-badge" title={info.short}>
            {info.icon}
          </span>
        );
      })}
    </span>
  );
};

const formatResultsSummary = (result: AIResult | null): string => {
  if (!result) return '-';

  const parts: string[] = [];

  if (result.faces?.success && result.faces.count > 0) {
    parts.push(`${result.faces.count} face${result.faces.count !== 1 ? 's' : ''}`);
  }

  if (result.objects?.success && result.objects.count > 0) {
    const uniqueObjects = [...new Set(result.objects.objects.map(o => o.class))];
    const topObjects = uniqueObjects.slice(0, 3);
    parts.push(topObjects.join(', '));
  }

  if (result.embedding?.success) {
    parts.push('indexed');
  }

  if (result.ocr?.has_text) {
    parts.push('text found');
  }

  if (result.describe?.description) {
    parts.push('captioned');
  }

  return parts.length > 0 ? parts.join(' · ') : 'processed';
};

const ResultsDetail: React.FC<{ result: AIResult; job: UploadQueueJob }> = ({ result, job }) => {
  const meta = result._meta;

  return (
    <div className="upload-queue__results-detail">
      {/* Worker Info */}
      <div className="upload-queue__worker-info">
        <span className="upload-queue__worker-badge">
          🤖 {job.worker_id || meta?.worker_id || 'unknown'}
        </span>
        {job.picked_up_at && (
          <span className="upload-queue__worker-time">
            picked up {formatRelativeTime(job.picked_up_at)}
          </span>
        )}
        <span className="upload-queue__version-badge">
          v{job.ai_version || meta?.ai_version || '?'}
        </span>
        {meta?.models && (
          <span className="upload-queue__models-info">
            CLIP: {meta.models.clip} | YOLO: {meta.models.yolo} | Face: {meta.models.face}
          </span>
        )}
      </div>

      {result.faces?.success && result.faces.count > 0 && (
        <div className="upload-queue__result-section">
          <span className="upload-queue__result-icon">👤</span>
          <span>{result.faces.count} face{result.faces.count !== 1 ? 's' : ''} detected</span>
        </div>
      )}

      {result.objects?.success && result.objects.count > 0 && (
        <div className="upload-queue__result-section">
          <span className="upload-queue__result-icon">📦</span>
          <span>
            {result.objects.objects.map((o, i) => (
              <span key={i} className="upload-queue__object-tag">
                {o.class}
              </span>
            ))}
          </span>
        </div>
      )}

      {result.embedding?.success && (
        <div className="upload-queue__result-section">
          <span className="upload-queue__result-icon">🔍</span>
          <span>Searchable (dim: {result.embedding.dimension})</span>
        </div>
      )}

      {result.ocr?.has_text && result.ocr.text && (
        <div className="upload-queue__result-section">
          <span className="upload-queue__result-icon">📝</span>
          <span>Text: "{result.ocr.text.slice(0, 50)}{result.ocr.text.length > 50 ? '...' : ''}"</span>
        </div>
      )}

      {result.describe?.description && (
        <div className="upload-queue__result-section">
          <span className="upload-queue__result-icon">💬</span>
          <span>{result.describe.description.slice(0, 100)}{result.describe.description.length > 100 ? '...' : ''}</span>
        </div>
      )}
    </div>
  );
};

const ImageModal: React.FC<{ imageUrl: string; onClose: () => void }> = ({ imageUrl, onClose }) => {
  return (
    <div className="upload-queue__modal-overlay" onClick={onClose}>
      <div className="upload-queue__modal" onClick={e => e.stopPropagation()}>
        <button className="upload-queue__modal-close" onClick={onClose}>×</button>
        <img src={imageUrl} alt="" className="upload-queue__modal-image" />
      </div>
    </div>
  );
};

const JobRow: React.FC<{
  job: UploadQueueJob;
  expanded: boolean;
  onToggle: () => void;
  onImageClick: (url: string) => void;
}> = ({ job, expanded, onToggle, onImageClick }) => {
  const operations = job.input_params?.operations as string[] | undefined;
  const result = job.result as AIResult | null;
  const hasResults = job.status === 'completed' && result;

  const handleThumbnailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const imageUrl = job.full_image_url || job.thumbnail_url;
    if (imageUrl) {
      onImageClick(imageUrl);
    }
  };

  return (
    <>
      <div
        className={`upload-queue__job ${hasResults ? 'upload-queue__job--clickable' : ''}`}
        onClick={hasResults ? onToggle : undefined}
      >
        <span
          className={`upload-queue__thumbnail ${job.thumbnail_url ? 'upload-queue__thumbnail--clickable' : ''}`}
          onClick={job.thumbnail_url ? handleThumbnailClick : undefined}
        >
          {job.thumbnail_url ? (
            <img src={job.thumbnail_url} alt="" className="upload-queue__thumb-img" />
          ) : (
            <span className="upload-queue__thumb-placeholder">📷</span>
          )}
        </span>
        <span className={`upload-queue__status ${getStatusClass(job.status)}`}>
          {job.status}
        </span>
        <OperationsBadges operations={operations} />
        <span className="upload-queue__results" title={hasResults ? 'Click to expand' : ''}>
          {job.status === 'completed' ? formatResultsSummary(result) : '-'}
          {hasResults && <span className="upload-queue__expand-icon">{expanded ? '▼' : '▶'}</span>}
        </span>
        <span className="upload-queue__error" title={job.error_message || ''}>
          {formatErrorMessage(job.error_message)}
        </span>
        <span className="upload-queue__time">{formatRelativeTime(job.created_at)}</span>
      </div>
      {expanded && hasResults && result && (
        <ResultsDetail result={result} job={job} />
      )}
    </>
  );
};

const JobsList: React.FC<{ jobs: UploadQueueJob[] }> = ({ jobs }) => {
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);

  const toggleExpand = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  return (
    <>
      <div className="upload-queue__list">
        <div className="upload-queue__header">
          <span></span>
          <span>Status</span>
          <span>Features</span>
          <span>Results</span>
          <span>Error</span>
          <span>Created</span>
        </div>
        {jobs.length === 0 ? (
          <div className="upload-queue__empty">No jobs in queue</div>
        ) : (
          jobs.map(job => (
            <JobRow
              key={job.id}
              job={job}
              expanded={expandedJobs.has(job.id)}
              onToggle={() => toggleExpand(job.id)}
              onImageClick={setModalImageUrl}
            />
          ))
        )}
      </div>
      {modalImageUrl && (
        <ImageModal imageUrl={modalImageUrl} onClose={() => setModalImageUrl(null)} />
      )}
    </>
  );
};

export const UploadQueueTab: React.FC = () => {
  const { stats, jobs, loading, error, refresh, clearQueue } = useUploadQueue();

  const handleClearQueue = async () => {
    if (window.confirm('Clear all jobs from the queue? This cannot be undone.')) {
      await clearQueue();
    }
  };

  if (loading && jobs.length === 0) {
    return (
      <div className="ai-empty">
        <div className="ai-spinner ai-spinner--large" />
        <p className="ai-empty__text">Loading upload queue...</p>
      </div>
    );
  }

  return (
    <div className="upload-queue">
      <div className="upload-queue__top">
        <div>
          <h3 className="upload-queue__title">Upload Queue</h3>
          <p className="upload-queue__subtitle">
            Jobs queued from mobile app uploads
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="ai-button ai-button--danger"
            onClick={handleClearQueue}
            disabled={loading || stats.total === 0}
          >
            Clear Queue
          </button>
          <button
            className="ai-button ai-button--secondary"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="ai-error">{error}</div>}

      <StatsSection stats={stats} />
      <JobsList jobs={jobs} />
    </div>
  );
};
