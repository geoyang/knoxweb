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

  // Check friendship status with a specific user
  async checkFriendship(profileId: string): Promise<ApiResponse<{
    isFriend: boolean;
    pendingRequest: { id: string; isIncoming: boolean } | null;
  }>> {
    try {
      const authHeaders = await this.getAuthHeaders();
      if (!authHeaders) {
        return { success: false, error: 'Authentication required' };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/friends-api?action=check&user_id=${profileId}`,
        {
          method: 'GET',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to check friendship' };
      }

      return {
        success: true,
        data: {
          isFriend: data.is_friend || false,
          pendingRequest: data.pending_request ? {
            id: data.pending_request.id,
            isIncoming: data.pending_request.is_incoming,
          } : null,
        },
      };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  // Send a friend request
  async sendFriendRequest(recipientId: string, message?: string): Promise<ApiResponse<{ request: FriendRequest }>> {
    try {
      const authHeaders = await this.getAuthHeaders();
      if (!authHeaders) {
        return { success: false, error: 'Authentication required' };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/friends-api?action=send`,
        {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ recipient_id: recipientId, message }),
        }
      );

      const data = await response.json();
      return { success: data.success, data, error: data.error };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  // Accept a friend request
  async acceptFriendRequest(requestId: string): Promise<ApiResponse> {
    try {
      const authHeaders = await this.getAuthHeaders();
      if (!authHeaders) {
        return { success: false, error: 'Authentication required' };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/friends-api?action=accept`,
        {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ request_id: requestId }),
        }
      );

      const data = await response.json();
      return { success: data.success, error: data.error };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  // Decline a friend request
  async declineFriendRequest(requestId: string): Promise<ApiResponse> {
    try {
      const authHeaders = await this.getAuthHeaders();
      if (!authHeaders) {
        return { success: false, error: 'Authentication required' };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/friends-api?action=decline`,
        {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ request_id: requestId }),
        }
      );

      const data = await response.json();
      return { success: data.success, error: data.error };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  // Cancel a sent friend request
  async cancelFriendRequest(requestId: string): Promise<ApiResponse> {
    try {
      const authHeaders = await this.getAuthHeaders();
      if (!authHeaders) {
        return { success: false, error: 'Authentication required' };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/friends-api?action=cancel`,
        {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ request_id: requestId }),
        }
      );

      const data = await response.json();
      return { success: data.success, error: data.error };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  // Remove a friend
  async unfriend(friendId: string): Promise<ApiResponse> {
    try {
      const authHeaders = await this.getAuthHeaders();
      if (!authHeaders) {
        return { success: false, error: 'Authentication required' };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/friends-api?action=unfriend`,
        {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ friend_id: friendId }),
        }
      );

      const data = await response.json();
      return { success: data.success, error: data.error };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }
}

export const friendsApi = new FriendsApiService();
