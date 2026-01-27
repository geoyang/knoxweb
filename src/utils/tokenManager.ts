import { supabase } from '../lib/supabase';

export interface UserTokenSettings {
  token_expiry_days: number;
  allow_code_auth: boolean;
  allow_magic_link_auth: boolean;
  max_active_sessions: number;
  require_code_for_sensitive: boolean;
}

export class TokenManager {

  private static async getAuthHeaders(): Promise<Record<string, string> | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    };
  }

  /**
   * Get user's token settings via API
   */
  static async getUserTokenSettings(_userId: string): Promise<UserTokenSettings> {
    try {
      const headers = await TokenManager.getAuthHeaders();
      if (!headers) {
        console.warn('No auth session for token settings');
        return TokenManager.getDefaultSettings();
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-token-settings-api`,
        { method: 'GET', headers }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        console.warn('Error fetching user token settings via API', data.error);
        return TokenManager.getDefaultSettings();
      }

      return data.settings;
    } catch (error) {
      console.warn('Exception getting user token settings', error);
      return TokenManager.getDefaultSettings();
    }
  }

  /**
   * Update user's token settings via API
   */
  static async updateUserTokenSettings(
    _userId: string,
    settings: Partial<UserTokenSettings>
  ): Promise<boolean> {
    try {
      const headers = await TokenManager.getAuthHeaders();
      if (!headers) {
        console.warn('No auth session for updating token settings');
        return false;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-token-settings-api`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify(settings),
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        console.warn('Error updating user token settings via API', data.error);
        return false;
      }

      console.log('Updated user token settings', { settings });
      return true;
    } catch (error) {
      console.warn('Exception updating user token settings', error);
      return false;
    }
  }

  /**
   * Set custom token expiry in user metadata
   */
  static async setCustomTokenExpiry(userId: string): Promise<void> {
    try {
      const settings = await TokenManager.getUserTokenSettings(userId);
      const expiryDate = new Date(Date.now() + settings.token_expiry_days * 24 * 60 * 60 * 1000);
      
      const { error } = await supabase.auth.updateUser({
        data: {
          token_expires_at: expiryDate.toISOString(),
          token_expiry_days: settings.token_expiry_days,
          last_login_method: 'code_auth',
          last_login_at: new Date().toISOString(),
        }
      });

      if (error) {
        console.warn('Error setting custom token expiry', error);
      } else {
        console.log('Set custom token expiry', { 
          userId, 
          expiryDate: expiryDate.toISOString(),
          expiryDays: settings.token_expiry_days 
        });
      }
    } catch (error) {
      console.warn('Exception setting custom token expiry', error);
    }
  }

  /**
   * Check if user's token is near expiry
   */
  static async isTokenNearExpiry(userId: string): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== userId) return false;

      const tokenExpiresAt = user.user_metadata?.token_expires_at;
      if (!tokenExpiresAt) return false;

      const expiryDate = new Date(tokenExpiresAt);
      const daysUntilExpiry = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      
      // Consider "near expiry" if less than 7 days remaining
      return daysUntilExpiry < 7;
    } catch (error) {
      console.warn('Exception checking token expiry', error);
      return false;
    }
  }

  /**
   * Validate verification code format
   * Only allows characters used in server-side generation (excludes 0, O, 1, I, L)
   * Note: Code generation is now done server-side in send-verification-code edge function
   */
  static isValidVerificationCode(code: string): boolean {
    return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(code);
  }

  /**
   * Get default token settings
   */
  private static getDefaultSettings(): UserTokenSettings {
    return {
      token_expiry_days: 30,
      allow_code_auth: true,
      allow_magic_link_auth: true,
      max_active_sessions: 3,
      require_code_for_sensitive: false,
    };
  }

  /**
   * Clean up expired sessions (would be called server-side typically)
   */
  static async cleanupExpiredSessions(): Promise<void> {
    try {
      // This would typically be implemented server-side
      // For now, we can check the current user's token expiry
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const tokenExpiresAt = user.user_metadata?.token_expires_at;
      if (tokenExpiresAt && new Date(tokenExpiresAt) < new Date()) {
        console.log('User token has expired, signing out');
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch (error) {
      console.warn('Exception during session cleanup', error);
    }
  }
}