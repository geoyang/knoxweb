import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/adminApi';

interface ExportJob {
  id: string;
  status: string;
  progress: {
    percent: number;
    processed: number;
    total: number;
    current_step: string;
  };
  options?: {
    include_originals: boolean;
    include_albums: boolean;
    include_folders: boolean;
  };
  result: {
    download_url: string;
    file_size_bytes: number;
    asset_count: number;
    album_count: number;
    folder_count: number;
    expires_at: string;
  } | null;
  error: {
    message: string;
    details: any;
  } | null;
  timestamps: {
    created: string;
    started: string;
    completed: string;
  };
}

export const ExportManager: React.FC = () => {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.id) {
      loadExportJobs();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  // Auto-refresh for in-progress jobs
  useEffect(() => {
    const hasInProgress = jobs.some(j =>
      ['pending', 'processing', 'downloading', 'generating', 'uploading'].includes(j.status)
    );

    if (hasInProgress) {
      const interval = setInterval(loadExportJobs, 5000);
      return () => clearInterval(interval);
    }
  }, [jobs]);

  const loadExportJobs = async () => {
    try {
      if (!loading) setRefreshing(true);
      setError(null);

      const result = await adminApi.getExportJobs();

      if (!result.success) {
        if (result.isAuthError) {
          await signOut();
          navigate('/login');
          return;
        }
        throw new Error(adminApi.handleApiError(result));
      }

      setJobs(result.data?.jobs || []);
    } catch (err) {
      console.error('Error loading export jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load export jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' },
      processing: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing' },
      downloading: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Downloading' },
      generating: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Generating' },
      uploading: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Uploading' },
      completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
      failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
      cancelled: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Cancelled' },
    };

    const config = statusConfig[status] || statusConfig.pending;

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Export Jobs</h2>
        <button
          onClick={loadExportJobs}
          disabled={refreshing}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center gap-2 disabled:opacity-50"
        >
          <span className={refreshing ? 'animate-spin' : ''}>↻</span>
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-4 bg-gray-50 border-b">
          <h3 className="font-semibold text-gray-700">
            Recent Exports ({jobs.length})
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Export jobs are triggered from the mobile app. Downloads expire after 7 days.
          </p>
        </div>

        {jobs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No export jobs found. Exports can be requested from the Kizu mobile app.
          </div>
        ) : (
          <div className="divide-y">
            {jobs.map((job) => (
              <div key={job.id} className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      {getStatusBadge(job.status)}
                      <span className="text-sm text-gray-500">
                        {formatDate(job.timestamps.created)}
                      </span>
                    </div>

                    {/* Progress bar for in-progress jobs */}
                    {['processing', 'downloading', 'generating', 'uploading'].includes(job.status) && (
                      <div className="mt-3">
                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                          <span>{job.progress.current_step || 'Processing...'}</span>
                          <span>{job.progress.percent}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${job.progress.percent}%` }}
                          ></div>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {job.progress.processed} / {job.progress.total} assets
                        </div>
                      </div>
                    )}

                    {/* Completed job details */}
                    {job.status === 'completed' && job.result && (
                      <div className="mt-3 space-y-2">
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">{job.result.asset_count}</span> photos,{' '}
                          <span className="font-medium">{job.result.album_count}</span> albums,{' '}
                          <span className="font-medium">{job.result.folder_count}</span> folders
                        </div>
                        <div className="text-sm text-gray-600">
                          Size: {formatFileSize(job.result.file_size_bytes)}
                        </div>
                        {isExpired(job.result.expires_at) ? (
                          <div className="text-sm text-red-600">
                            Download expired on {formatDate(job.result.expires_at)}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <a
                              href={job.result.download_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                            >
                              Download ZIP
                            </a>
                            <span className="text-xs text-gray-500">
                              Expires {formatDate(job.result.expires_at)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Failed job error */}
                    {job.status === 'failed' && job.error && (
                      <div className="mt-3 p-3 bg-red-50 rounded-md">
                        <div className="text-sm text-red-700 font-medium">
                          {job.error.message}
                        </div>
                        {job.error.details && (
                          <pre className="mt-2 text-xs text-red-600 overflow-x-auto">
                            {JSON.stringify(job.error.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportManager;
