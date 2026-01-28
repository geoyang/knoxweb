import { supabase, getAccessToken } from '../lib/supabase';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UserReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  report_type: 'spam' | 'harassment' | 'inappropriate' | 'other';
  report_context: 'dm' | 'invitation' | 'profile' | 'photo';
  context_id?: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'action_taken' | 'dismissed';
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  reporter?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  };
  reported_user?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  };
}

export interface BlockedUser {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
  blocked_user?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  };
}

export type ReportAction = 'dismiss' | 'warn' | 'suspend' | 'ban';

class ModerationApiService {
  private async getAuthHeaders(): Promise<{ Authorization: string } | null> {
    try {
      const accessToken = getAccessToken();
      if (!accessToken) return null;
      return { 'Authorization': `Bearer ${accessToken}` };
    } catch {
      return null;
    }
  }

  private async makeApiCall<T>(
    action: string,
    options: { body?: any; method?: string } = {}
  ): Promise<ApiResponse<T>> {
    try {
      const authHeaders = await this.getAuthHeaders();
      if (!authHeaders) {
        return { success: false, error: 'Authentication required' };
      }

      const method = options.method || 'POST';
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const fetchOptions: RequestInit = {
        method,
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      };

      if (method !== 'GET' && options.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/moderation-api?action=${action}`,
        fetchOptions
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'API call failed' };
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getReports(status?: string): Promise<ApiResponse<{ reports: UserReport[] }>> {
    const action = status ? `list&status=${status}` : 'list';
    return this.makeApiCall(action, { method: 'GET' });
  }

  async getReportDetails(reportId: string): Promise<ApiResponse<{ report: UserReport }>> {
    return this.makeApiCall(`get&report_id=${reportId}`, { method: 'GET' });
  }

  async reviewReport(
    reportId: string,
    action: ReportAction,
    notes?: string
  ): Promise<ApiResponse<{ report: UserReport }>> {
    return this.makeApiCall('review', {
      body: { report_id: reportId, action, notes },
    });
  }

  async getUserBlocks(userId: string): Promise<ApiResponse<{ blocks: BlockedUser[] }>> {
    return this.makeApiCall(`user-blocks&user_id=${userId}`, { method: 'GET' });
  }

  async getBlockedByUser(userId: string): Promise<ApiResponse<{ blocked_by: BlockedUser[] }>> {
    return this.makeApiCall(`blocked-by&user_id=${userId}`, { method: 'GET' });
  }
}

export const moderationApi = new ModerationApiService();
