import { supabase, getAccessToken } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  isAuthError?: boolean;
}

class AdminApiService {
  private getAuthHeaders(): { Authorization: string } | null {
    const accessToken = getAccessToken();
    if (!accessToken) {
      console.error('No valid session for API call');
      return null;
    }
    return {
      'Authorization': `Bearer ${accessToken}`,
    };
  }

  private async makeApiCall<T>(
    functionName: string,
    options: { body?: any; headers?: Record<string, string>; method?: string } = {}
  ): Promise<ApiResponse<T>> {
    try {
      const authHeaders = this.getAuthHeaders();

      if (!authHeaders) {
        return {
          success: false,
          error: 'Authentication required',
          isAuthError: true
        };
      }

      const method = options.method || 'POST';
      const supabaseUrl = getSupabaseUrl();

      // Use fetch directly to support different HTTP methods
      const fetchOptions: RequestInit = {
        method,
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey(),
          ...(options.headers || {}),
        },
      };

      // Only include body for non-GET requests
      if (method !== 'GET' && options.body) {
        fetchOptions.body = options.body;
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/${functionName}`,
        fetchOptions
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(`API call to ${functionName} failed:`, data);
        // Check for auth errors (401, 403, or auth-related error messages)
        const isAuthError = response.status === 401 ||
                           response.status === 403 ||
                           data.error?.toLowerCase().includes('auth') ||
                           data.error?.toLowerCase().includes('token') ||
                           data.error?.toLowerCase().includes('jwt');
        return {
          success: false,
          error: data.error || 'API call failed',
          details: data.details || JSON.stringify(data),
          isAuthError
        };
      }

      // Check if the response indicates an error
      if (data && !data.success) {
        return {
          success: false,
          error: data.error || 'Unknown error',
          details: data.details
        };
      }

      return {
        success: true,
        data: data
      };

    } catch (error) {
      console.error(`Exception in API call to ${functionName}:`, error);
      return {
        success: false,
        error: 'Network or system error',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Albums API
  async getAlbums(options?: { lite?: boolean }): Promise<ApiResponse<{ albums: any[], count: number, stats?: { owned: number, shared: number } }>> {
    const params = options?.lite ? '?lite=true' : '';
    return this.makeApiCall(`admin-albums-api${params}`, {
      method: 'GET'
    });
  }

  async createAlbum(albumData: {
    title: string;
    description?: string;
    keyphoto?: string;
  }): Promise<ApiResponse<{ album: any }>> {
    return this.makeApiCall('admin-albums-api', {
      method: 'POST',
      body: JSON.stringify(albumData)
    });
  }

  async updateAlbum(albumData: {
    album_id: string;
    title?: string;
    description?: string;
    keyphoto?: string;
  }): Promise<ApiResponse<{ album: any }>> {
    return this.makeApiCall('admin-albums-api', {
      method: 'PUT',
      body: JSON.stringify(albumData)
    });
  }

  async deleteAlbum(albumId: string): Promise<ApiResponse<{ message: string }>> {
    return this.makeApiCall('admin-albums-api', {
      method: 'DELETE',
      body: JSON.stringify({ album_id: albumId })
    });
  }

  // Images API
  async getImages(
    filterType: string = 'all',
    sortBy: string = 'date_added',
    page: number = 1,
    limit: number = 50
  ): Promise<ApiResponse<{
    assets: any[];
    stats: any;
    count: number;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }>> {
    return this.makeApiCall(`admin-images-api?filter_type=${filterType}&sort_by=${sortBy}&page=${page}&limit=${limit}`, {
      method: 'GET'
    });
  }

  async deleteAsset(assetId: string): Promise<ApiResponse<{ message: string }>> {
    return this.makeApiCall('admin-images-api', {
      method: 'DELETE',
      body: JSON.stringify({ asset_id: assetId })
    });
  }

  // Circles API
  async getCircles(): Promise<ApiResponse<{ circles: any[], count: number }>> {
    return this.makeApiCall('admin-circles-api', {
      method: 'GET'
    });
  }

  async getCircleUsers(circleId: string): Promise<ApiResponse<{ users: any[], count: number }>> {
    return this.makeApiCall(`admin-circles-api?circle_id=${circleId}`, {
      method: 'GET'
    });
  }

  async createCircle(circleData: {
    name: string;
    description?: string;
  }): Promise<ApiResponse<{ circle: any }>> {
    return this.makeApiCall('admin-circles-api', {
      method: 'POST',
      body: JSON.stringify(circleData)
    });
  }

  async inviteUserToCircle(circleId: string, inviteData: {
    email: string;
    role: string;
    full_name?: string;
  }): Promise<ApiResponse<{ invitation: any; emailSent?: boolean }>> {
    return this.makeApiCall(`admin-circles-api?circle_id=${circleId}`, {
      method: 'POST',
      body: JSON.stringify(inviteData)
    });
  }

  async addUserToCircle(circleId: string, data: {
    email: string;
    role: string;
    full_name?: string;
  }): Promise<ApiResponse<{ invitation: any; emailSent?: boolean }>> {
    return this.makeApiCall(`admin-circles-api?circle_id=${circleId}`, {
      method: 'POST',
      body: JSON.stringify({ ...data, direct_add: true })
    });
  }

  async updateCircle(circleData: {
    circle_id: string;
    name?: string;
    description?: string;
  }): Promise<ApiResponse<{ circle: any }>> {
    return this.makeApiCall('admin-circles-api', {
      method: 'PUT',
      body: JSON.stringify(circleData)
    });
  }

  async deleteCircle(circleId: string): Promise<ApiResponse<{ message: string }>> {
    return this.makeApiCall('admin-circles-api', {
      method: 'DELETE',
      body: JSON.stringify({ circle_id: circleId })
    });
  }

  async updateUserProfile(userId: string, data: { full_name?: string }): Promise<ApiResponse<{ user: any }>> {
    return this.makeApiCall('admin-users-api', {
      method: 'PUT',
      body: JSON.stringify({ user_id: userId, ...data })
    });
  }

  async updateMemberRole(memberId: string, role: string): Promise<ApiResponse<{ member: any }>> {
    return this.makeApiCall('admin-circles-api', {
      method: 'PATCH',
      body: JSON.stringify({ member_id: memberId, role })
    });
  }

  async removeMember(memberId: string): Promise<ApiResponse<{ message: string }>> {
    return this.makeApiCall('admin-circles-api', {
      method: 'DELETE',
      body: JSON.stringify({ member_id: memberId })
    });
  }

  // Invitations API
  async getInvitations(): Promise<ApiResponse<{
    invitations: any[];
    stats: any;
    circles: any[];
    count: number;
  }>> {
    return this.makeApiCall('admin-invitations-api', {
      method: 'GET'
    });
  }

  async sendInvitation(inviteData: {
    circle_id: string;
    email: string;
    role: string;
  }): Promise<ApiResponse<{ invitation: any, message: string }>> {
    return this.makeApiCall('admin-invitations-api', {
      method: 'POST',
      body: JSON.stringify(inviteData)
    });
  }

  async resendInvitation(inviteId: string): Promise<ApiResponse<{ message: string }>> {
    return this.makeApiCall('admin-invitations-api', {
      method: 'PUT',
      body: JSON.stringify({ invite_id: inviteId })
    });
  }

  async cancelInvitation(inviteId: string): Promise<ApiResponse<{ message: string }>> {
    return this.makeApiCall('admin-invitations-api', {
      method: 'DELETE',
      body: JSON.stringify({ invite_id: inviteId })
    });
  }

  // Promo Codes API
  async getPromoCodes(): Promise<ApiResponse<{ promo_codes: any[] }>> {
    return this.makeApiCall('promo-codes-api?action=list', {
      method: 'GET'
    });
  }

  async createPromoCode(promoData: {
    code: string;
    description?: string;
    discount_percent?: number;
    trial_days_override?: number;
    is_perpetual_trial?: boolean;
    max_uses?: number;
    expires_at?: string;
    subscription_plan_id?: string;
  }): Promise<ApiResponse<{ promo_code: any }>> {
    return this.makeApiCall('promo-codes-api?action=create', {
      method: 'POST',
      body: JSON.stringify(promoData)
    });
  }

  async updatePromoCode(promoData: {
    id: string;
    description?: string;
    discount_percent?: number;
    trial_days_override?: number;
    is_perpetual_trial?: boolean;
    max_uses?: number;
    expires_at?: string;
    is_active?: boolean;
    subscription_plan_id?: string;
  }): Promise<ApiResponse<{ promo_code: any }>> {
    return this.makeApiCall('promo-codes-api?action=update', {
      method: 'POST',
      body: JSON.stringify(promoData)
    });
  }

  async deletePromoCode(promoId: string): Promise<ApiResponse<{ message: string }>> {
    return this.makeApiCall('promo-codes-api?action=delete', {
      method: 'POST',
      body: JSON.stringify({ id: promoId })
    });
  }

  async getPromoCodeStats(promoId: string): Promise<ApiResponse<{
    promo_code: any;
    stats: { total_uses: number; active_users: number; cancelled_users: number; remaining_uses: number | null };
    users: any[];
  }>> {
    return this.makeApiCall(`promo-codes-api?action=stats&promo_id=${promoId}`, {
      method: 'GET'
    });
  }

  // Subscription Plans API
  async getSubscriptionPlans(): Promise<ApiResponse<{ plans: Array<{ id: string; name: string; display_name: string }> }>> {
    return this.makeApiCall('subscription-api?action=plans', {
      method: 'GET'
    });
  }

  // Get current user's subscription status
  async getSubscriptionStatus(): Promise<ApiResponse<{
    subscription: {
      id: string;
      status: 'trialing' | 'active' | 'grace_period' | 'read_only' | 'cancelled' | 'expired' | 'free';
      trial_end: string | null;
      current_period_end: string | null;
    };
    plan: {
      id: string;
      name: string;
      display_name: string;
    };
  }>> {
    return this.makeApiCall('subscription-api?action=status', {
      method: 'GET'
    });
  }

  // Export Jobs API
  async getExportJobs(): Promise<ApiResponse<{
    jobs: Array<{
      id: string;
      status: string;
      progress: { percent: number; processed: number; total: number; current_step: string };
      result: { download_url: string; file_size_bytes: number; expires_at: string } | null;
      error: { message: string; details: any } | null;
      timestamps: { created: string; started: string; completed: string };
    }>;
  }>> {
    return this.makeApiCall('export-api', {
      method: 'GET'
    });
  }

  async getExportJobStatus(jobId: string): Promise<ApiResponse<{
    job: {
      id: string;
      status: string;
      progress: { percent: number; processed: number; total: number; current_step: string };
      result: { download_url: string; file_size_bytes: number; expires_at: string } | null;
      error: { message: string; details: any } | null;
      timestamps: { created: string; started: string; completed: string };
    };
  }>> {
    return this.makeApiCall(`export-api?job_id=${jobId}`, {
      method: 'GET'
    });
  }

  // Sitewide Discount API
  async getDiscount(): Promise<ApiResponse<{
    discount: {
      enabled: boolean;
      percent: number;
      code: string | null;
      applies_to: 'all' | 'new_users' | 'upgrades';
      starts_at: string | null;
      expires_at: string | null;
      banner_message: string | null;
    };
  }>> {
    return this.makeApiCall('admin-config-api?action=discount', {
      method: 'GET'
    });
  }

  async setDiscount(discountData: {
    enabled: boolean;
    percent: number;
    code?: string | null;
    applies_to?: 'all' | 'new_users' | 'upgrades';
    starts_at?: string | null;
    expires_at?: string | null;
    banner_message?: string | null;
  }): Promise<ApiResponse<{ message: string; discount: any }>> {
    return this.makeApiCall('admin-config-api?action=set_discount', {
      method: 'POST',
      body: JSON.stringify(discountData)
    });
  }

  // Utility methods
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.getAlbums();
      return result.success;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  // Handle common API errors
  handleApiError(error: ApiResponse): string {
    if (error.error?.includes('access denied') || error.error?.includes('not found')) {
      return 'You don\'t have permission to access this resource.';
    }
    if (error.error?.includes('network') || error.error?.includes('timeout')) {
      return 'Network error. Please check your connection and try again.';
    }
    return error.error || 'An unexpected error occurred. Please try again.';
  }
}

// Export singleton instance
export const adminApi = new AdminApiService();

// Export types for use in components
export type { ApiResponse };