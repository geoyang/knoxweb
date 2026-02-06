/**
 * useVideoQueue Hook
 * Monitors the Supabase video_transcoding_jobs table
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../../lib/supabase';

export interface VideoQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

export interface VideoQueueJob {
  id: string;
  user_id: string;
  asset_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  // Input details
  input_url: string;
  input_format: string | null;
  input_duration_ms: number | null;
  input_width: number | null;
  input_height: number | null;
  input_size_bytes: number | null;
  // Output details
  output_url: string | null;
  output_format: string | null;
  output_codec: string | null;
  output_width: number | null;
  output_height: number | null;
  output_size_bytes: number | null;
  output_duration_ms: number | null;
  output_bitrate_kbps: number | null;
  // Thumbnail
  thumbnail_url: string | null;
  thumbnail_generated_at: string | null;
  // Quality settings
  quality_preset: 'low' | 'medium' | 'high' | 'lossless';
  target_resolution: '480p' | '720p' | '1080p' | 'original';
  // Progress
  progress: number;
  current_step: string | null;
  // Timing
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  // Error handling
  error_message: string | null;
  retry_count: number;
  // Metadata
  metadata: Record<string, unknown>;
}

interface UseVideoQueueReturn {
  stats: VideoQueueStats;
  jobs: VideoQueueJob[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearQueue: () => Promise<void>;
}

export function useVideoQueue(): UseVideoQueueReturn {
  const [stats, setStats] = useState<VideoQueueStats>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0,
  });
  const [jobs, setJobs] = useState<VideoQueueJob[]>([]);
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
      setError(err instanceof Error ? err.message : 'Failed to fetch video queue');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = async (): Promise<VideoQueueStats | null> => {
    const { data, error } = await supabase
      .from('video_transcoding_jobs')
      .select('status');

    if (error) {
      console.error('[VideoQueue] Stats fetch error:', error);
      return null;
    }

    const counts = { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    for (const row of data || []) {
      counts.total++;
      if (row.status in counts) {
        counts[row.status as keyof Omit<VideoQueueStats, 'total'>]++;
      }
    }
    return counts;
  };

  const fetchJobs = async (): Promise<VideoQueueJob[] | null> => {
    const { data, error } = await supabase
      .from('video_transcoding_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[VideoQueue] Jobs fetch error:', error);
      return null;
    }

    return data as VideoQueueJob[];
  };

  // Handle real-time updates
  const handleChange = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // Set up Supabase Realtime subscription
  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('video_queue_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'video_transcoding_jobs',
        },
        handleChange
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[VideoQueue] Realtime subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[VideoQueue] Realtime subscription error');
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
        .from('video_transcoding_jobs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

      if (error) {
        console.error('[VideoQueue] Clear queue error:', error);
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
