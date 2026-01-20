/**
 * ActivityDashboardTab Component
 * Real-time monitoring of AI processing queue and worker activity
 */

import React from 'react';
import { useProcessingQueue } from './hooks';
import type { ActivityLogItem } from './hooks';

// Helper to format relative time
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

// Helper to format time as HH:MM:SS
const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

// Helper to summarize result
const summarizeResult = (result?: Record<string, unknown>): string => {
  if (!result) return '';

  const parts: string[] = [];

  if (typeof result.faces === 'number' && result.faces > 0) {
    parts.push(`faces: ${result.faces}`);
  }
  if (typeof result.objects === 'number' && result.objects > 0) {
    parts.push(`objects: ${result.objects}`);
  }
  if (result.text) {
    parts.push('text detected');
  }
  if (result.description) {
    parts.push('described');
  }
  if (result.error) {
    parts.push(`error: ${String(result.error).slice(0, 30)}`);
  }

  return parts.length > 0 ? parts.join(', ') : '';
};

// Queue Stats Section
const QueueStatsSection: React.FC<{
  stats: { pending: number; processing: number; completed: number; failed: number };
}> = ({ stats }) => (
  <div className="activity-dashboard__section">
    <div className="activity-dashboard__section-header">
      <h4 className="activity-dashboard__section-title">Queue Status</h4>
    </div>
    <div className="queue-stats">
      <div className="queue-stat queue-stat--pending">
        <div className="queue-stat__value">{stats.pending}</div>
        <div className="queue-stat__label">Pending</div>
      </div>
      <div className="queue-stat queue-stat--processing">
        <div className="queue-stat__value">{stats.processing}</div>
        <div className="queue-stat__label">Active</div>
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

// Workers Section
const WorkersSection: React.FC<{
  workers: Array<{
    worker_id: string;
    current_asset?: string;
    started_at?: string;
    status: string;
  }>;
}> = ({ workers }) => (
  <div className="activity-dashboard__section">
    <div className="activity-dashboard__section-header">
      <h4 className="activity-dashboard__section-title">Workers</h4>
    </div>
    <div className="workers-list">
      {workers.length === 0 ? (
        <div className="activity-log__empty">No active workers</div>
      ) : (
        workers.map(worker => (
          <div key={worker.worker_id} className="worker-item">
            <div className="worker-item__status-dot" />
            <div className="worker-item__info">
              <div className="worker-item__id">{worker.worker_id}</div>
              <div className="worker-item__task">
                {worker.current_asset
                  ? `Processing ${worker.current_asset.slice(0, 8)}...`
                  : 'Idle'}
              </div>
            </div>
            <div className="worker-item__time">
              {worker.started_at ? formatRelativeTime(worker.started_at) : ''}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

// Activity Log Section
const ActivityLogSection: React.FC<{
  activityLog: ActivityLogItem[];
  isPaused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
}> = ({ activityLog, isPaused, onTogglePause, onClear }) => (
  <div className="activity-dashboard__section">
    <div className="activity-dashboard__section-header">
      <h4 className="activity-dashboard__section-title">Live Activity</h4>
      <div className="activity-dashboard__section-actions">
        <button
          className="ai-button ai-button--secondary ai-button--small"
          onClick={onClear}
        >
          Clear
        </button>
        <button
          className={`ai-button ai-button--small ${isPaused ? 'ai-button--primary' : 'ai-button--secondary'}`}
          onClick={onTogglePause}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </div>
    <div className="activity-log">
      {activityLog.length === 0 ? (
        <div className="activity-log__empty">
          {isPaused ? 'Updates paused' : 'No recent activity'}
        </div>
      ) : (
        activityLog.map(item => (
          <div key={item.id} className="activity-log__item">
            <span className="activity-log__time">{formatTime(item.timestamp)}</span>
            <span className={`activity-log__status activity-log__status--${item.status}`}>
              {item.status}
            </span>
            <div className="activity-log__details">
              <span className="activity-log__asset-id">
                {item.asset_id.slice(0, 12)}...
              </span>
              {item.worker_id && (
                <span style={{ marginLeft: '0.5rem', color: '#9ca3af' }}>
                  ({item.worker_id})
                </span>
              )}
              {item.result && (
                <div className="activity-log__result">
                  {summarizeResult(item.result)}
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

export const ActivityDashboardTab: React.FC = () => {
  const {
    stats,
    workers,
    activityLog,
    loading,
    error,
    isPaused,
    togglePause,
    clearActivityLog,
    refresh,
  } = useProcessingQueue();

  if (loading && activityLog.length === 0) {
    return (
      <div className="ai-empty">
        <div className="ai-spinner ai-spinner--large" />
        <p className="ai-empty__text">Loading activity data...</p>
      </div>
    );
  }

  return (
    <div className="activity-dashboard">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
      }}>
        <div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.25rem' }}>
            AI Activity Dashboard
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Monitor AI processing in real-time
          </p>
        </div>
        <button
          className="ai-button ai-button--secondary"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="ai-error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <QueueStatsSection stats={stats} />
      <WorkersSection workers={workers} />
      <ActivityLogSection
        activityLog={activityLog}
        isPaused={isPaused}
        onTogglePause={togglePause}
        onClear={clearActivityLog}
      />
    </div>
  );
};
