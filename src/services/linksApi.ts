import { getAccessToken } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export type LinkStatus = 'active' | 'pending' | 'removed' | 'blocked';

export interface LinkProfile {
  id: string;
  full_name?: string;
  display_name?: string;
  email: string;
  avatar_url?: string;
}

export interface LinkMessage {
  conversation_id: string;
  content: string;
  content_type: string;
  sender_id: string;
  created_at: string;
}

export interface Link {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: LinkStatus;
  source: string;
  requested_by: string;
  conversation_id: string | null;
  shared_album_id: string | null;
  created_at: string;
  updated_at: string;
  other_user: LinkProfile | null;
  last_message: LinkMessage | null;
  unread_count: number;
  is_muted: boolean;
  is_requester: boolean;
}

class LinksApiService {
  private getAuthHeaders(): Record<string, string> | null {
    const accessToken = getAccessToken();
    if (!accessToken) return null;
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'apikey': getSupabaseAnonKey(),
    };
  }

  private getBaseUrl(): string {
    return `${getSupabaseUrl()}/functions/v1/links-api`;
  }

  /** Get all links for current user. */
  async getLinks(filter?: string, search?: string): Promise<ApiResponse<{ links: Link[] }>> {
    try {
      const headers = this.getAuthHeaders();
      if (!headers) return { success: false, error: 'Authentication required' };

      const params = new URLSearchParams({ action: 'list' });
      if (filter) params.set('filter', filter);
      if (search) params.set('search', search);

      const response = await fetch(`${this.getBaseUrl()}?${params}`, {
        method: 'GET',
        headers,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to fetch links' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Check if a link exists between current user and target user. */
  async checkLink(targetUserId: string): Promise<ApiResponse<{
    link: Link | null;
    status: LinkStatus | null;
    is_requester: boolean;
  }>> {
    try {
      const headers = this.getAuthHeaders();
      if (!headers) return { success: false, error: 'Authentication required' };

      const response = await fetch(
        `${this.getBaseUrl()}?action=check&user_id=${targetUserId}`,
        { method: 'GET', headers },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to check link' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Get full link detail. */
  async getLinkDetail(linkId: string): Promise<ApiResponse<{
    link: Link;
    other_user: LinkProfile;
    is_muted: boolean;
    is_requester: boolean;
  }>> {
    try {
      const headers = this.getAuthHeaders();
      if (!headers) return { success: false, error: 'Authentication required' };

      const response = await fetch(
        `${this.getBaseUrl()}?action=detail&link_id=${linkId}`,
        { method: 'GET', headers },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to get link detail' };
      }
      return { success: true, data };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Connect with a user (smart: auto-activates if shared circle). */
  async connect(params: { user_id?: string; email?: string; phone?: string }): Promise<ApiResponse> {
    try {
      const headers = this.getAuthHeaders();
      if (!headers) return { success: false, error: 'Authentication required' };

      const response = await fetch(`${this.getBaseUrl()}?action=connect`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });
      const data = await response.json();
      return { success: data.success, data, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Accept a pending link request. */
  async accept(linkId: string): Promise<ApiResponse> {
    try {
      const headers = this.getAuthHeaders();
      if (!headers) return { success: false, error: 'Authentication required' };

      const response = await fetch(`${this.getBaseUrl()}?action=accept`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ link_id: linkId }),
      });
      const data = await response.json();
      return { success: data.success, data, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Decline a pending link request. */
  async decline(linkId: string): Promise<ApiResponse> {
    try {
      const headers = this.getAuthHeaders();
      if (!headers) return { success: false, error: 'Authentication required' };

      const response = await fetch(`${this.getBaseUrl()}?action=decline`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ link_id: linkId }),
      });
      const data = await response.json();
      return { success: data.success, data, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Cancel a sent link request. */
  async cancel(linkId: string): Promise<ApiResponse> {
    try {
      const headers = this.getAuthHeaders();
      if (!headers) return { success: false, error: 'Authentication required' };

      const response = await fetch(`${this.getBaseUrl()}?action=cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ link_id: linkId }),
      });
      const data = await response.json();
      return { success: data.success, data, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Remove a link (soft delete). */
  async remove(linkId: string): Promise<ApiResponse> {
    try {
      const headers = this.getAuthHeaders();
      if (!headers) return { success: false, error: 'Authentication required' };

      const response = await fetch(`${this.getBaseUrl()}?action=remove`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ link_id: linkId }),
      });
      const data = await response.json();
      return { success: data.success, data, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Block the other user in a link. */
  async block(linkId: string): Promise<ApiResponse> {
    try {
      const headers = this.getAuthHeaders();
      if (!headers) return { success: false, error: 'Authentication required' };

      const response = await fetch(`${this.getBaseUrl()}?action=block`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ link_id: linkId }),
      });
      const data = await response.json();
      return { success: data.success, data, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Unblock the other user in a link. */
  async unblock(linkId: string): Promise<ApiResponse> {
    try {
      const headers = this.getAuthHeaders();
      if (!headers) return { success: false, error: 'Authentication required' };

      const response = await fetch(`${this.getBaseUrl()}?action=unblock`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ link_id: linkId }),
      });
      const data = await response.json();
      return { success: data.success, data, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  /** Toggle mute on a link. */
  async mute(linkId: string, muted: boolean): Promise<ApiResponse> {
    try {
      const headers = this.getAuthHeaders();
      if (!headers) return { success: false, error: 'Authentication required' };

      const response = await fetch(`${this.getBaseUrl()}?action=mute`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ link_id: linkId, muted }),
      });
      const data = await response.json();
      return { success: data.success, data, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }
}

export const linksApi = new LinksApiService();
