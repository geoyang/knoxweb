import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';
import { getAccessToken } from '../lib/supabase';

interface Job {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  processed: number;
  total: number;
  error_message: string | null;
  input_params: any;
  result: any;
  created_at: string;
  completed_at: string | null;
  picked_up_at: string | null;
  worker_id: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface MomentsJobMonitorProps {
  userId?: string;
}

export const MomentsJobMonitor: React.FC<MomentsJobMonitorProps> = ({ userId }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobs = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;

    try {
      const userParam = userId && userId !== 'current' ? `&user_id=${userId}` : '';
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/moments-api?action=jobs${userParam}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            apikey: getSupabaseAnonKey(),
          },
        }
      );
      const data = await response.json();
      if (data.success) {
        setJobs(data.jobs);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Auto-refresh while there are active jobs
  useEffect(() => {
    const hasActive = jobs.some(
      (j) => j.status === 'pending' || j.status === 'processing'
    );

    if (hasActive && !intervalRef.current) {
      intervalRef.current = setInterval(fetchJobs, 5000);
    } else if (!hasActive && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobs, fetchJobs]);

  if (loading) return null;
  if (jobs.length === 0) return null;

  return (
    <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">
          Job Queue
        </h4>
        <button
          onClick={fetchJobs}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>
      <div className="divide-y divide-gray-100">
        {jobs.map((job) => (
          <div key={job.id} className="px-4 py-3">
            <div className="flex items-center gap-3 mb-1">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded ${
                  STATUS_STYLES[job.status] || 'bg-gray-100'
                }`}
              >
                {job.status}
              </span>
              <span className="text-xs text-gray-400 font-mono">
                {job.id.slice(0, 8)}
              </span>
              <span className="text-xs text-gray-400">
                {timeAgo(job.created_at)}
              </span>
              {job.worker_id && (
                <span className="text-xs text-gray-400">
                  worker: {job.worker_id.slice(0, 8)}
                </span>
              )}
            </div>

            {/* Progress bar for processing jobs */}
            {job.status === 'processing' && (
              <div className="mt-2">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <span>
                    {job.processed}/{job.total || '?'}
                  </span>
                  {job.progress > 0 && <span>{job.progress}%</span>}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${job.progress || 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error message */}
            {job.error_message && (
              <p className="mt-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                {job.error_message}
              </p>
            )}

            {/* Result summary for completed jobs */}
            {job.status === 'completed' && job.result && (
              <p className="mt-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                {job.result.moments_created != null
                  ? `${job.result.moments_created} moments created`
                  : JSON.stringify(job.result).slice(0, 120)}
              </p>
            )}

            {/* Timestamps */}
            {(job.picked_up_at || job.completed_at) && (
              <div className="mt-1 flex gap-3 text-xs text-gray-400">
                {job.picked_up_at && (
                  <span>Picked up: {timeAgo(job.picked_up_at)}</span>
                )}
                {job.completed_at && (
                  <span>Completed: {timeAgo(job.completed_at)}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
