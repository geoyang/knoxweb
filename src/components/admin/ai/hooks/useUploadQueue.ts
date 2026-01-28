/**
 * useUploadQueue Hook
 * Monitors the Supabase ai_processing_jobs table (mobile upload queue)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../../lib/supabase';

export interface UploadQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

export interface UploadQueueJob {
  id: string;
  user_id: string;
  job_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  input_params: { asset_id?: string; [key: string]: unknown } | null;
  result: Record<string, unknown> | null;
  progress: number;
  processed: number;
  total: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  // Worker tracking
  worker_id: string | null;
  picked_up_at: string | null;
  ai_version: string | null;
  // Added by hook after fetching
  thumbnail_url?: string | null;
  full_image_url?: string | null;
}

interface UseUploadQueueReturn {
  stats: UploadQueueStats;
  jobs: UploadQueueJob[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearQueue: () => Promise<void>;
}

export function useUploadQueue(): UseUploadQueueReturn {
  const [stats, setStats] = useState<UploadQueueStats>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0,
  });
  const [jobs, setJobs] = useState<UploadQueueJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsResult, jobsResult] = await Promise.all([
        fetchStats(),
        fetchJobs(),
      ]);

      if (statsResult) setStats(statsResult);
      if (jobsResult) setJobs(jobsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch upload queue');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = async (): Promise<UploadQueueStats | null> => {
    const { data, error } = await supabase
      .from('ai_processing_jobs')
      .select('status');

    if (error) {
      console.error('[UploadQueue] Stats fetch error:', error);
      return null;
    }

    const counts = { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    for (const row of data || []) {
      counts.total++;
      if (row.status in counts) {
        counts[row.status as keyof Omit<UploadQueueStats, 'total'>]++;
      }
    }
    return counts;
  };

  const fetchJobs = async (): Promise<UploadQueueJob[] | null> => {
    const { data, error } = await supabase
      .from('ai_processing_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[UploadQueue] Jobs fetch error:', error);
      return null;
    }

    const jobs = data as UploadQueueJob[];

    // Fetch thumbnails for all jobs with asset_ids
    const assetIds = jobs
      .map(job => job.input_params?.asset_id)
      .filter((id): id is string => !!id);

    if (assetIds.length > 0) {
      const { data: assets } = await supabase
        .from('assets')
        .select('id, thumbnail, web_uri')
        .in('id', assetIds);

      if (assets) {
        const assetMap = new Map(
          assets.map(a => [a.id, { thumbnail: a.thumbnail, web_uri: a.web_uri }])
        );

        for (const job of jobs) {
          const assetId = job.input_params?.asset_id;
          if (assetId) {
            const asset = assetMap.get(assetId);
            job.thumbnail_url = asset?.thumbnail || asset?.web_uri || null;
            job.full_image_url = asset?.web_uri || asset?.thumbnail || null;
          }
        }
      }
    }

    return jobs;
  };

  // Handle real-time updates
  const handleChange = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // Set up Supabase Realtime subscription
  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('upload_queue_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_processing_jobs',
        },
        handleChange
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[UploadQueue] Realtime subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[UploadQueue] Realtime subscription error');
          setError('Real-time updates unavailable');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchData, handleChange]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const clearQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase
        .from('ai_processing_jobs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

      if (error) {
        console.error('[UploadQueue] Clear queue error:', error);
        setError('Failed to clear queue');
        return;
      }

      // Refresh data after clearing
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear queue');
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  return {
    stats,
    jobs,
    loading,
    error,
    refresh: fetchData,
    clearQueue,
  };
}
