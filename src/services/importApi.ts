import { supabase, getAccessToken } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';

// Types
export interface ImportService {
  id: string;
  service_key: string;
  display_name: string;
  icon_url?: string;
  description?: string;
  is_active: boolean;
  requires_app_review: boolean;
  is_local_only?: boolean;
  supports_albums?: boolean;
}

export interface ImportSource {
  id: string;
  user_id: string;
  service_id: string;
  display_name?: string;
  last_sync_at?: string;
  total_assets_synced: number;
  is_active: boolean;
  service?: ImportService;
}

export interface ImportJob {
  id: string;
  user_id: string;
  source_id?: string;
  service_id: string;
  status: 'pending' | 'estimating' | 'ready' | 'importing' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'blocked_limit' | 'rolled_back';
  total_assets: number;
  processed_assets: number;
  imported_assets: number;
  skipped_duplicates: number;
  skipped_similar: number;
  skipped_limit: number;
  failed_assets: number;
  current_batch: number;
  total_batches: number;
  estimated_duration_seconds?: number;
  started_at?: string;
  completed_at?: string;
  import_scope: string;
  skip_deduplication: boolean;
  error_message?: string;
  created_at: string;
  service?: {
    display_name: string;
    service_key: string;
  };
}

export interface ImportAlbum {
  id: string;
  name: string;
  asset_count?: number;
  cover_url?: string;
}

export interface ImportEstimate {
  total_assets: number;
  estimated_duration_seconds: number;
  plan_check: {
    can_import: boolean;
    remaining_photos: number;
    current_photos: number;
    max_photos: number;
    would_exceed_by: number;
  };
}

export interface PlanInfo {
  current_photos: number;
  max_photos: number;
  remaining_photos: number;
}

export interface DedupJob {
  id: string;
  user_id: string;
  status: 'pending' | 'scanning' | 'grouping' | 'completed' | 'failed' | 'cancelled';
  total_assets?: number;
  scanned_assets: number;
  assets_with_hash: number;
  duplicates_found: number;
  similar_found: number;
  similarity_threshold: number;
  scan_scope: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  created_at: string;
}

export interface DuplicateGroup {
  id: string;
  user_id: string;
  job_id?: string;
  group_type: 'exact' | 'similar';
  group_hash: string;
  asset_count: number;
  status: 'pending' | 'resolved' | 'kept_all';
  resolved_at?: string;
  kept_asset_id?: string;
  assets?: Array<{
    id: string;
    asset_id: string;
    similarity_score: number;
    is_primary: boolean;
    asset?: {
      id: string;
      path: string;
      thumbnail: string;
      created_at: string;
      width: number;
      height: number;
      media_type: string;
    };
  }>;
}

// Helper
async function getAuthHeaders(): Promise<Record<string, string> | null> {
  try {
    const accessToken = getAccessToken();
    if (!accessToken) {
      return null;
    }
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'apikey': getSupabaseAnonKey(),
    };
  } catch {
    return null;
  }
}

// Import Services API
export const importServicesApi = {
  async list(): Promise<{ success: boolean; services?: ImportService[]; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-services-api`, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to fetch services' };
      }

      return { success: true, services: data.services };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};

// Import Sources API
export const importSourcesApi = {
  async list(): Promise<{ success: boolean; sources?: ImportSource[]; planInfo?: PlanInfo; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-sources-api`, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to fetch sources' };
      }

      return { success: true, sources: data.sources, planInfo: data.plan_info };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async connect(serviceKey: string): Promise<{ success: boolean; authUrl?: string; source?: ImportSource; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const redirectUri = `${window.location.origin}/auth/callback`;

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-sources-api?action=connect`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ service_key: serviceKey, redirect_uri: redirectUri }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to connect' };
      }

      return { success: true, authUrl: data.auth_url, source: data.source };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async disconnect(sourceId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-sources-api?action=disconnect`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ source_id: sourceId }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to disconnect' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async checkNew(sourceId: string): Promise<{ success: boolean; newCount?: number; estimatedSeconds?: number; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-sources-api?action=check-new&source_id=${sourceId}`, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to check for new assets' };
      }

      return { success: true, newCount: data.new_count, estimatedSeconds: data.estimated_seconds };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async listAlbums(sourceId: string): Promise<{ success: boolean; albums?: ImportAlbum[]; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-sources-api?action=albums&source_id=${sourceId}`, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to list albums' };
      }

      return { success: true, albums: data.albums };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};

// Import Jobs API
export const importJobsApi = {
  async list(): Promise<{ success: boolean; jobs?: ImportJob[]; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-api?action=list`, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to fetch jobs' };
      }

      return { success: true, jobs: data.jobs };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async estimate(sourceId: string, options?: {
    importScope?: string;
    selectedAlbumIds?: string[];
  }): Promise<{ success: boolean; estimate?: ImportEstimate; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-api?action=estimate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source_id: sourceId,
          import_scope: options?.importScope || 'full',
          selected_album_ids: options?.selectedAlbumIds,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to estimate' };
      }

      return {
        success: true,
        estimate: {
          total_assets: data.total_assets,
          estimated_duration_seconds: data.estimated_duration_seconds,
          plan_check: data.plan_check,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async start(sourceId: string, options?: {
    importScope?: string;
    selectedAlbumIds?: string[];
    skipDeduplication?: boolean;
  }): Promise<{ success: boolean; job?: ImportJob; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-api?action=start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source_id: sourceId,
          import_scope: options?.importScope || 'full',
          selected_album_ids: options?.selectedAlbumIds,
          skip_deduplication: options?.skipDeduplication || false,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to start import' };
      }

      return { success: true, job: data.job };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async status(jobId: string): Promise<{ success: boolean; job?: ImportJob; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-api?action=status&job_id=${jobId}`, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to get status' };
      }

      return { success: true, job: data.job };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async pause(jobId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-api?action=pause`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ job_id: jobId }),
      });

      const data = await response.json();
      return { success: data.success, error: data.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async resume(jobId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-api?action=resume`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ job_id: jobId }),
      });

      const data = await response.json();
      return { success: data.success, error: data.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async cancel(jobId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-api?action=cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ job_id: jobId }),
      });

      const data = await response.json();
      return { success: data.success, error: data.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async rollback(jobId: string): Promise<{ success: boolean; deleted_assets?: number; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/import-api?action=rollback`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ job_id: jobId }),
      });

      const data = await response.json();
      return {
        success: data.success,
        deleted_assets: data.deleted_assets,
        error: data.error,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};

// Deduplication API
export const dedupApi = {
  async listJobs(): Promise<{ success: boolean; jobs?: DedupJob[]; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/dedup-api`, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to fetch jobs' };
      }

      return { success: true, jobs: data.jobs };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async startScan(options?: {
    similarity_threshold?: number;
    scan_scope?: string;
  }): Promise<{ success: boolean; job?: DedupJob; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/dedup-api?action=scan`, {
        method: 'POST',
        headers,
        body: JSON.stringify(options || {}),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to start scan' };
      }

      return { success: true, job: data.job };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async getStatus(jobId: string): Promise<{ success: boolean; job?: DedupJob; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/dedup-api?action=status&job_id=${jobId}`, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to get status' };
      }

      return { success: true, job: data.job };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async getGroups(options?: {
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ success: boolean; groups?: DuplicateGroup[]; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const params = new URLSearchParams({ action: 'groups' });
      if (options?.status) params.append('status', options.status);
      if (options?.type) params.append('type', options.type);
      if (options?.limit) params.append('limit', options.limit.toString());
      if (options?.offset) params.append('offset', options.offset.toString());

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/dedup-api?${params}`, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to get groups' };
      }

      return { success: true, groups: data.groups };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async resolveGroup(groupId: string, action: 'keep_one' | 'keep_all' | 'delete_all', keepAssetId?: string): Promise<{ success: boolean; deleted_count?: number; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/dedup-api?action=resolve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          group_id: groupId,
          action,
          keep_asset_id: keepAssetId,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to resolve' };
      }

      return { success: true, deleted_count: data.deleted_count };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  async cancelScan(jobId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${getSupabaseUrl()}/functions/v1/dedup-api?action=cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ job_id: jobId }),
      });

      const data = await response.json();
      return { success: data.success, error: data.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};

// Helper functions
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} sec`;
  } else if (seconds < 3600) {
    const mins = Math.ceil(seconds / 60);
    return `${mins} min`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.ceil((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}

export function getServiceIcon(serviceKey: string): string {
  switch (serviceKey) {
    case 'google_photos':
      return '🌐';
    case 'dropbox':
      return '📦';
    case 'facebook':
      return '👤';
    case 'camera_roll':
      return '📱';
    default:
      return '📷';
  }
}

export function getServiceColor(serviceKey: string): string {
  switch (serviceKey) {
    case 'google_photos':
      return '#4285f4';
    case 'dropbox':
      return '#0061fe';
    case 'facebook':
      return '#1877f2';
    case 'camera_roll':
      return '#34c759';
    default:
      return '#666';
  }
}
