import { getAccessToken } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface NotificationActor {
  id: string;
  full_name: string;
  avatar_url?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  notification_type: string;
  deep_link_type?: string;
  deep_link_id?: string;
  is_read: boolean;
  created_at: string;
  actor?: NotificationActor;
}

class NotificationsApiService {
  private getAuthHeaders(): { Authorization: string; apikey: string } | null {
    const accessToken = getAccessToken();
    if (!accessToken) return null;
    return {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': getSupabaseAnonKey(),
    };
  }

  async getNotifications(page = 1, limit = 20): Promise<ApiResponse<{
    notifications: Notification[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>> {
    try {
      const authHeaders = this.getAuthHeaders();
      if (!authHeaders) {
        return { success: false, error: 'Authentication required' };
      }

      const supabaseUrl = getSupabaseUrl();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/notifications-api?page=${page}&limit=${limit}`,
        {
          method: 'GET',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to fetch notifications' };
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async getUnreadCount(): Promise<number> {
    try {
      const authHeaders = this.getAuthHeaders();
      if (!authHeaders) return 0;

      const supabaseUrl = getSupabaseUrl();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/notifications-api?unread_count=true`,
        {
          method: 'GET',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      return data.unread_count || 0;
    } catch {
      return 0;
    }
  }

  async markAsRead(notificationId: string): Promise<ApiResponse> {
    try {
      const authHeaders = this.getAuthHeaders();
      if (!authHeaders) {
        return { success: false, error: 'Authentication required' };
      }

      const supabaseUrl = getSupabaseUrl();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/notifications-api/mark-read`,
        {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ notification_id: notificationId }),
        }
      );

      const data = await response.json();
      return { success: response.ok, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  async markAllAsRead(): Promise<ApiResponse> {
    try {
      const authHeaders = this.getAuthHeaders();
      if (!authHeaders) {
        return { success: false, error: 'Authentication required' };
      }

      const supabaseUrl = getSupabaseUrl();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/notifications-api/mark-all-read`,
        {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      return { success: response.ok, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  async deleteNotification(notificationId: string): Promise<ApiResponse> {
    try {
      const authHeaders = this.getAuthHeaders();
      if (!authHeaders) {
        return { success: false, error: 'Authentication required' };
      }

      const supabaseUrl = getSupabaseUrl();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/notifications-api?notification_id=${notificationId}`,
        {
          method: 'DELETE',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      return { success: response.ok, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

}

export const notificationsApi = new NotificationsApiService();
