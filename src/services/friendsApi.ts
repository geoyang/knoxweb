import { supabase } from '../lib/supabase';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface Friend {
  id: string;
  friendId: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  locationCity?: string;
  locationRegion?: string;
  lastAppOpen?: string;
  createdAt: string;
}

export interface FriendRequest {
  id: string;
  requesterId: string;
  recipientId: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message?: string;
  createdAt: string;
  respondedAt?: string;
  requester?: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl?: string;
  };
  recipient?: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl?: string;
  };
}

class FriendsApiService {
  private async getAuthHeaders(): Promise<{ Authorization: string } | null> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session?.access_token) return null;
      return { 'Authorization': `Bearer ${session.access_token}` };
    } catch {
      return null;
    }
  }

  private async makeApiCall<T>(
    action: string,
    options: { body?: any; method?: string; userId?: string } = {}
  ): Promise<ApiResponse<T>> {
    try {
      const authHeaders = await this.getAuthHeaders();
      if (!authHeaders) {
        return { success: false, error: 'Authentication required' };
      }

      const method = options.method || 'POST';
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      let url = `${supabaseUrl}/functions/v1/friends-api?action=${action}`;
      if (options.userId) {
        url += `&user_id=${options.userId}`;
      }

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

      const response = await fetch(url, fetchOptions);
      const data = await response.json();

      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'API call failed' };
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  // Admin: Get friends for any user
  async getUserFriends(userId: string): Promise<ApiResponse<{ friends: Friend[] }>> {
    return this.makeApiCall('list', { method: 'GET', userId });
  }

  // Admin: Get friend requests for any user
  async getUserRequests(userId: string): Promise<ApiResponse<{ requests: FriendRequest[] }>> {
    return this.makeApiCall('requests', { method: 'GET', userId });
  }

  // Admin: Get friendship stats for a user
  async getUserFriendshipStats(userId: string): Promise<ApiResponse<{
    friendsCount: number;
    pendingSentCount: number;
    pendingReceivedCount: number;
  }>> {
    return this.makeApiCall('stats', { method: 'GET', userId });
  }
}

export const friendsApi = new FriendsApiService();
