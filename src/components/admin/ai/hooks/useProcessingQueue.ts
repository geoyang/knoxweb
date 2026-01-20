/**
 * useProcessingQueue Hook
 * Real-time processing queue monitoring via Supabase Realtime
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../../lib/supabase';
import { aiApi } from '../../../../services/aiApi';

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

export interface QueueJob {
  id: string;
  asset_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  worker_id?: string;
  priority?: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  result?: Record<string, unknown>;
}

export interface Worker {
  worker_id: string;
  current_asset?: string;
  started_at?: string;
  status: string;
}

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  status: string;
  asset_id: string;
  worker_id?: string;
  result?: Record<string, unknown>;
}

interface UseProcessingQueueReturn {
  stats: QueueStats;
  activeJobs: QueueJob[];
  recentJobs: QueueJob[];
  workers: Worker[];
  activityLog: ActivityLogItem[];
  loading: boolean;
  error: string | null;
  isPaused: boolean;
  togglePause: () => void;
  clearActivityLog: () => void;
  refresh: () => Promise<void>;
}

export function useProcessingQueue(): UseProcessingQueueReturn {
  const [stats, setStats] = useState<QueueStats>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0,
  });
  const [activeJobs, setActiveJobs] = useState<QueueJob[]>([]);
  const [recentJobs, setRecentJobs] = useState<QueueJob[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsResult, activeResult, recentResult, workersResult] = await Promise.all([
        aiApi.getQueueStats(),
        aiApi.getActiveJobs(10),
        aiApi.getRecentJobs(50),
        aiApi.getWorkerStatus(),
      ]);

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data);
      }

      if (activeResult.success && activeResult.data) {
        setActiveJobs(activeResult.data.jobs as QueueJob[]);
      }

      if (recentResult.success && recentResult.data) {
        setRecentJobs(recentResult.data.jobs as QueueJob[]);
        // Initialize activity log from recent jobs
        const logItems: ActivityLogItem[] = recentResult.data.jobs.map(job => ({
          id: job.id,
          timestamp: job.completed_at || job.started_at || job.created_at,
          status: job.status,
          asset_id: job.asset_id,
          worker_id: job.worker_id,
          result: job.result,
        }));
        setActivityLog(logItems);
      }

      if (workersResult.success && workersResult.data) {
        setWorkers(workersResult.data.workers);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch queue data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle real-time updates from Supabase
  const handleQueueChange = useCallback((payload: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  }) => {
    if (isPaused) return;

    const { eventType, new: newRecord } = payload;

    // Add to activity log
    if (newRecord) {
      const logItem: ActivityLogItem = {
        id: `${newRecord.id}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        status: eventType === 'INSERT' ? 'queued' :
                newRecord.status === 'processing' ? 'started' :
                String(newRecord.status || 'unknown'),
        asset_id: String(newRecord.asset_id || ''),
        worker_id: newRecord.worker_id as string | undefined,
        result: newRecord.result as Record<string, unknown> | undefined,
      };

      setActivityLog(prev => [logItem, ...prev].slice(0, 100));
    }

    // Update stats based on changes
    if (eventType === 'INSERT') {
      setStats(prev => ({
        ...prev,
        pending: prev.pending + 1,
        total: prev.total + 1,
      }));
    } else if (eventType === 'UPDATE' && newRecord) {
      const newStatus = newRecord.status as string;
      const oldStatus = payload.old?.status as string | undefined;

      setStats(prev => {
        const updated = { ...prev };
        // Decrement old status
        if (oldStatus && oldStatus in updated) {
          updated[oldStatus as keyof QueueStats] = Math.max(0, updated[oldStatus as keyof QueueStats] - 1);
        }
        // Increment new status
        if (newStatus && newStatus in updated) {
          updated[newStatus as keyof QueueStats]++;
        }
        return updated;
      });
    }

    // Refresh active jobs list on any change
    aiApi.getActiveJobs(10).then(result => {
      if (result.success && result.data) {
        setActiveJobs(result.data.jobs as QueueJob[]);
      }
    });

    // Refresh workers on status change
    aiApi.getWorkerStatus().then(result => {
      if (result.success && result.data) {
        setWorkers(result.data.workers);
      }
    });
  }, [isPaused]);

  // Set up Supabase Realtime subscription
  useEffect(() => {
    // Initial data fetch
    fetchData();

    // Subscribe to processing_queue changes
    const channel = supabase
      .channel('processing_queue_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'processing_queue',
        },
        handleQueueChange
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ProcessingQueue] Realtime subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[ProcessingQueue] Realtime subscription error');
          setError('Real-time updates unavailable');
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchData, handleQueueChange]);

  // Periodic refresh as fallback
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPaused) {
        fetchData();
      }
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [fetchData, isPaused]);

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  const clearActivityLog = useCallback(() => {
    setActivityLog([]);
  }, []);

  return {
    stats,
    activeJobs,
    recentJobs,
    workers,
    activityLog,
    loading,
    error,
    isPaused,
    togglePause,
    clearActivityLog,
    refresh: fetchData,
  };
}
