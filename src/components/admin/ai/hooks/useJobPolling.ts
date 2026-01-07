/**
 * useJobPolling Hook
 * Polls for job status updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { aiApi } from '../../../../services/aiApi';
import { AI_CONFIG } from '../config';
import type { ProcessingJob } from '../../../../types/ai';

interface UseJobPollingReturn {
  jobs: ProcessingJob[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

export function useJobPolling(autoStart = true): UseJobPollingReturn {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await aiApi.listJobs();

      if (result.success && result.data) {
        setJobs(result.data);
      } else {
        setError(result.error || 'Failed to fetch jobs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return;
    refresh();
    intervalRef.current = setInterval(refresh, AI_CONFIG.jobPollInterval);
  }, [refresh]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (autoStart) {
      startPolling();
    }
    return () => stopPolling();
  }, [autoStart, startPolling, stopPolling]);

  return { jobs, loading, error, refresh, startPolling, stopPolling };
}

// Single job polling
export function useSingleJobPolling(jobId: string | null) {
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!jobId) return;

    try {
      setLoading(true);
      const result = await aiApi.getJob(jobId);

      if (result.success && result.data) {
        setJob(result.data);
        setNotFound(false);

        // Stop polling if job is complete
        if (['completed', 'failed'].includes(result.data.status)) {
          stopPolling();
        }
      } else {
        // Check if job not found (404)
        const isNotFound = result.error?.toLowerCase().includes('not found') ||
                          result.error?.toLowerCase().includes('404');
        if (isNotFound) {
          setNotFound(true);
          setJob(null);
          stopPolling();
        } else {
          setError(result.error || 'Failed to fetch job');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch job');
      stopPolling();
    } finally {
      setLoading(false);
    }
  }, [jobId, stopPolling]);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setNotFound(false);
      setError(null);
      return;
    }

    refresh();
    intervalRef.current = setInterval(refresh, AI_CONFIG.jobPollInterval);

    return () => stopPolling();
  }, [jobId, refresh, stopPolling]);

  return { job, loading, error, notFound, refresh };
}
