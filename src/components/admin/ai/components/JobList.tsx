/**
 * JobList Component
 * Displays list of processing jobs with status
 */

import React from 'react';
import { AI_CONFIG, StatusType } from '../config';
import type { ProcessingJob } from '../../../../types/ai';

interface JobListProps {
  jobs: ProcessingJob[];
  onCancel?: (jobId: string) => void;
  onView?: (job: ProcessingJob) => void;
  loading?: boolean;
}

export const JobList: React.FC<JobListProps> = ({
  jobs,
  onCancel,
  onView,
  loading = false,
}) => {
  if (loading && jobs.length === 0) {
    return (
      <div className="ai-empty">
        <div className="ai-spinner" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="ai-empty">
        <div className="ai-empty__icon">📋</div>
        <p className="ai-empty__text">No processing jobs</p>
      </div>
    );
  }

  const getStatusClass = (status: string): string => {
    const statusKey = status as StatusType;
    return AI_CONFIG.statusColors[statusKey]
      ? `job-item__status--${status}`
      : 'job-item__status--pending';
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="job-list">
      {jobs.map(job => (
        <div key={job.id} className="job-item">
          <div className="job-item__info">
            <div className="job-item__title">
              {job.job_type || 'Processing Job'}
            </div>
            <div className="job-item__progress">
              {job.processed} / {job.total} • {formatDate(job.created_at)}
            </div>
            {job.error_message && (
              <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {job.error_message}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className={`job-item__status ${getStatusClass(job.status)}`}>
              {job.status}
            </span>

            {job.status === 'processing' && (
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {job.progress}%
              </span>
            )}

            {['pending', 'processing'].includes(job.status) && onCancel && (
              <button
                className="ai-button ai-button--secondary"
                onClick={() => onCancel(job.id)}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
              >
                Cancel
              </button>
            )}

            {job.status === 'completed' && onView && (
              <button
                className="ai-button ai-button--secondary"
                onClick={() => onView(job)}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
              >
                View
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
