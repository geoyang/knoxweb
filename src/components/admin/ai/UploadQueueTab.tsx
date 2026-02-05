/**
 * UploadQueueTab Component
 * Displays both AI processing queue and Video transcoding queue
 */

import React, { useState } from 'react';
import { useUploadQueue, useVideoQueue } from './hooks';
import type { UploadQueueJob, UploadQueueStats } from './hooks/useUploadQueue';
import type { VideoQueueJob, VideoQueueStats } from './hooks/useVideoQueue';

type QueueFilter = 'ai' | 'video' | 'both';

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

const formatDuration = (ms: number | null): string => {
  if (!ms) return '-';
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

interface CombinedStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

const StatsSection: React.FC<{ stats: CombinedStats; label?: string }> = ({ stats, label }) => (
  <div className="upload-queue__stats-section">
    {label && <div className="upload-queue__stats-label">{label}</div>}
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
  </div>
);

const formatErrorMessage = (error: string | null): string => {
  if (!error) return '-';
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

const AIResultsDetail: React.FC<{ result: AIResult; job: UploadQueueJob }> = ({ result, job }) => {
  const meta = result._meta;

  return (
    <div className="upload-queue__results-detail">
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

const VideoResultsDetail: React.FC<{ job: VideoQueueJob }> = ({ job }) => {
  return (
    <div className="upload-queue__results-detail">
      <div className="upload-queue__worker-info">
        <span className="upload-queue__worker-badge">🎬 Video Transcoder</span>
        {job.started_at && (
          <span className="upload-queue__worker-time">
            started {formatRelativeTime(job.started_at)}
          </span>
        )}
        <span className="upload-queue__version-badge">
          {job.quality_preset} · {job.target_resolution}
        </span>
      </div>

      <div className="upload-queue__result-section">
        <span className="upload-queue__result-icon">📥</span>
        <span>
          Input: {job.input_format || 'unknown'} · {job.input_width}×{job.input_height} · {formatFileSize(job.input_size_bytes)} · {formatDuration(job.input_duration_ms)}
        </span>
      </div>

      {job.output_url && (
        <div className="upload-queue__result-section">
          <span className="upload-queue__result-icon">📤</span>
          <span>
            Output: {job.output_format}/{job.output_codec} · {job.output_width}×{job.output_height} · {formatFileSize(job.output_size_bytes)} · {job.output_bitrate_kbps ? `${job.output_bitrate_kbps} kbps` : ''}
          </span>
        </div>
      )}

      {job.thumbnail_url && (
        <div className="upload-queue__result-section">
          <span className="upload-queue__result-icon">🖼️</span>
          <span>Thumbnail generated</span>
        </div>
      )}

      {job.current_step && job.status === 'processing' && (
        <div className="upload-queue__result-section">
          <span className="upload-queue__result-icon">⏳</span>
          <span>Current step: {job.current_step}</span>
        </div>
      )}

      {job.retry_count > 0 && (
        <div className="upload-queue__result-section">
          <span className="upload-queue__result-icon">🔄</span>
          <span>Retries: {job.retry_count}</span>
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

const AIJobRow: React.FC<{
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
        <span className="upload-queue__queue-badge upload-queue__queue-badge--ai">AI</span>
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
        <AIResultsDetail result={result} job={job} />
      )}
    </>
  );
};

const VideoJobRow: React.FC<{
  job: VideoQueueJob;
  expanded: boolean;
  onToggle: () => void;
  onImageClick: (url: string) => void;
}> = ({ job, expanded, onToggle, onImageClick }) => {
  const hasResults = job.status === 'completed' || job.status === 'processing';

  const handleThumbnailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (job.thumbnail_url) {
      onImageClick(job.thumbnail_url);
    }
  };

  const formatVideoSummary = (): string => {
    if (job.status === 'processing') {
      return `${job.progress}% - ${job.current_step || 'processing'}`;
    }
    if (job.status === 'completed') {
      const parts: string[] = [];
      if (job.output_width && job.output_height) {
        parts.push(`${job.output_width}×${job.output_height}`);
      }
      if (job.output_size_bytes) {
        parts.push(formatFileSize(job.output_size_bytes));
      }
      if (job.thumbnail_url) {
        parts.push('thumbnail');
      }
      return parts.join(' · ') || 'transcoded';
    }
    return '-';
  };

  return (
    <>
      <div
        className={`upload-queue__job ${hasResults ? 'upload-queue__job--clickable' : ''}`}
        onClick={hasResults ? onToggle : undefined}
      >
        <span className="upload-queue__queue-badge upload-queue__queue-badge--video">Video</span>
        <span
          className={`upload-queue__thumbnail ${job.thumbnail_url ? 'upload-queue__thumbnail--clickable' : ''}`}
          onClick={job.thumbnail_url ? handleThumbnailClick : undefined}
        >
          {job.thumbnail_url ? (
            <img src={job.thumbnail_url} alt="" className="upload-queue__thumb-img" />
          ) : (
            <span className="upload-queue__thumb-placeholder">🎬</span>
          )}
        </span>
        <span className={`upload-queue__status ${getStatusClass(job.status)}`}>
          {job.status}
        </span>
        <span className="upload-queue__ops">
          <span className="upload-queue__op-badge" title={job.quality_preset}>
            {job.quality_preset === 'high' ? '🔷' : job.quality_preset === 'lossless' ? '💎' : '⚡'}
          </span>
          <span className="upload-queue__op-badge" title={job.target_resolution}>
            {job.target_resolution}
          </span>
        </span>
        <span className="upload-queue__results" title={hasResults ? 'Click to expand' : ''}>
          {formatVideoSummary()}
          {hasResults && <span className="upload-queue__expand-icon">{expanded ? '▼' : '▶'}</span>}
        </span>
        <span className="upload-queue__error" title={job.error_message || ''}>
          {formatErrorMessage(job.error_message)}
        </span>
        <span className="upload-queue__time">{formatRelativeTime(job.created_at)}</span>
      </div>
      {expanded && hasResults && (
        <VideoResultsDetail job={job} />
      )}
    </>
  );
};

type CombinedJob =
  | { type: 'ai'; job: UploadQueueJob }
  | { type: 'video'; job: VideoQueueJob };

const JobsList: React.FC<{
  aiJobs: UploadQueueJob[];
  videoJobs: VideoQueueJob[];
  filter: QueueFilter;
}> = ({ aiJobs, videoJobs, filter }) => {
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

  // Combine and sort jobs by created_at
  const combinedJobs: CombinedJob[] = [];

  if (filter === 'ai' || filter === 'both') {
    aiJobs.forEach(job => combinedJobs.push({ type: 'ai', job }));
  }

  if (filter === 'video' || filter === 'both') {
    videoJobs.forEach(job => combinedJobs.push({ type: 'video', job }));
  }

  // Sort by created_at descending
  combinedJobs.sort((a, b) => {
    const dateA = new Date(a.job.created_at).getTime();
    const dateB = new Date(b.job.created_at).getTime();
    return dateB - dateA;
  });

  return (
    <>
      <div className="upload-queue__list">
        <div className="upload-queue__header">
          <span>Type</span>
          <span></span>
          <span>Status</span>
          <span>Features</span>
          <span>Results</span>
          <span>Error</span>
          <span>Created</span>
        </div>
        {combinedJobs.length === 0 ? (
          <div className="upload-queue__empty">No jobs in queue</div>
        ) : (
          combinedJobs.map(item => (
            item.type === 'ai' ? (
              <AIJobRow
                key={`ai-${item.job.id}`}
                job={item.job}
                expanded={expandedJobs.has(item.job.id)}
                onToggle={() => toggleExpand(item.job.id)}
                onImageClick={setModalImageUrl}
              />
            ) : (
              <VideoJobRow
                key={`video-${item.job.id}`}
                job={item.job}
                expanded={expandedJobs.has(item.job.id)}
                onToggle={() => toggleExpand(item.job.id)}
                onImageClick={setModalImageUrl}
              />
            )
          ))
        )}
      </div>
      {modalImageUrl && (
        <ImageModal imageUrl={modalImageUrl} onClose={() => setModalImageUrl(null)} />
      )}
    </>
  );
};

const QueueFilterTabs: React.FC<{
  filter: QueueFilter;
  onFilterChange: (filter: QueueFilter) => void;
  aiCount: number;
  videoCount: number;
}> = ({ filter, onFilterChange, aiCount, videoCount }) => (
  <div className="upload-queue__filter-tabs">
    <button
      className={`upload-queue__filter-tab ${filter === 'both' ? 'upload-queue__filter-tab--active' : ''}`}
      onClick={() => onFilterChange('both')}
    >
      Both ({aiCount + videoCount})
    </button>
    <button
      className={`upload-queue__filter-tab ${filter === 'ai' ? 'upload-queue__filter-tab--active' : ''}`}
      onClick={() => onFilterChange('ai')}
    >
      AI Queue ({aiCount})
    </button>
    <button
      className={`upload-queue__filter-tab ${filter === 'video' ? 'upload-queue__filter-tab--active' : ''}`}
      onClick={() => onFilterChange('video')}
    >
      Video Queue ({videoCount})
    </button>
  </div>
);

export const UploadQueueTab: React.FC = () => {
  const [filter, setFilter] = useState<QueueFilter>('both');
  const aiQueue = useUploadQueue();
  const videoQueue = useVideoQueue();

  const loading = aiQueue.loading || videoQueue.loading;
  const error = aiQueue.error || videoQueue.error;

  const handleRefresh = async () => {
    await Promise.all([aiQueue.refresh(), videoQueue.refresh()]);
  };

  const handleClearQueue = async () => {
    const queueName = filter === 'both' ? 'both queues' : filter === 'ai' ? 'AI queue' : 'Video queue';
    if (window.confirm(`Clear all jobs from ${queueName}? This cannot be undone.`)) {
      if (filter === 'ai' || filter === 'both') {
        await aiQueue.clearQueue();
      }
      if (filter === 'video' || filter === 'both') {
        await videoQueue.clearQueue();
      }
    }
  };

  const totalJobs = (filter === 'ai' ? aiQueue.stats.total : 0) +
                   (filter === 'video' ? videoQueue.stats.total : 0) +
                   (filter === 'both' ? aiQueue.stats.total + videoQueue.stats.total : 0);

  // Calculate combined stats for "both" view
  const combinedStats: CombinedStats = {
    pending: (filter === 'ai' || filter === 'both' ? aiQueue.stats.pending : 0) +
             (filter === 'video' || filter === 'both' ? videoQueue.stats.pending : 0),
    processing: (filter === 'ai' || filter === 'both' ? aiQueue.stats.processing : 0) +
                (filter === 'video' || filter === 'both' ? videoQueue.stats.processing : 0),
    completed: (filter === 'ai' || filter === 'both' ? aiQueue.stats.completed : 0) +
               (filter === 'video' || filter === 'both' ? videoQueue.stats.completed : 0),
    failed: (filter === 'ai' || filter === 'both' ? aiQueue.stats.failed : 0) +
            (filter === 'video' || filter === 'both' ? videoQueue.stats.failed : 0),
    total: totalJobs,
  };

  if (loading && aiQueue.jobs.length === 0 && videoQueue.jobs.length === 0) {
    return (
      <div className="ai-empty">
        <div className="ai-spinner ai-spinner--large" />
        <p className="ai-empty__text">Loading processing queues...</p>
      </div>
    );
  }

  return (
    <div className="upload-queue">
      <div className="upload-queue__top">
        <div>
          <h3 className="upload-queue__title">Processing Queues</h3>
          <p className="upload-queue__subtitle">
            Monitor AI image processing and video transcoding jobs
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="ai-button ai-button--danger"
            onClick={handleClearQueue}
            disabled={loading || totalJobs === 0}
          >
            Clear {filter === 'both' ? 'All' : filter === 'ai' ? 'AI' : 'Video'}
          </button>
          <button
            className="ai-button ai-button--secondary"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="ai-error">{error}</div>}

      <QueueFilterTabs
        filter={filter}
        onFilterChange={setFilter}
        aiCount={aiQueue.stats.total}
        videoCount={videoQueue.stats.total}
      />

      {filter === 'both' ? (
        <div className="upload-queue__stats-container">
          <StatsSection stats={aiQueue.stats} label="AI Processing" />
          <StatsSection stats={videoQueue.stats} label="Video Transcoding" />
        </div>
      ) : (
        <StatsSection stats={combinedStats} />
      )}

      <JobsList
        aiJobs={aiQueue.jobs}
        videoJobs={videoQueue.jobs}
        filter={filter}
      />
    </div>
  );
};
