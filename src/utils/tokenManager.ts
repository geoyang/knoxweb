import { supabase } from '../lib/supabase';

export interface UserTokenSettings {
  token_expiry_days: number;
  allow_code_auth: boolean;
  allow_magic_link_auth: boolean;
  max_active_sessions: number;
  require_code_for_sensitive: boolean;
}

export class TokenManager {
  
  /**
   * Get user's token settings or create defaults
   */
  static async getUserTokenSettings(userId: string): Promise<UserTokenSettings> {
    try {
      const { data, error } = await supabase
        .from('user_token_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.warn('Error fetching user token settings, using defaults', error);
        return TokenManager.getDefaultSettings();
      }

      return {
        token_expiry_days: data.token_expiry_days || 30,
        allow_code_auth: data.allow_code_auth ?? true,
        allow_magic_link_auth: data.allow_magic_link_auth ?? true,
        max_active_sessions: data.max_active_sessions || 3,
        require_code_for_sensitive: data.require_code_for_sensitive ?? false,
      };
    } catch (error) {
      console.warn('Exception getting user token settings', error);
      return TokenManager.getDefaultSettings();
    }
  }

  /**
   * Update user's token settings
   */
  static async updateUserTokenSettings(
    userId: string, 
    settings: Partial<UserTokenSettings>
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_token_settings')
        .upsert({
          user_id: userId,
          ...settings,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.warn('Error updating user token settings', error);
        return false;
      }

      console.log('Updated user token settings', { userId, settings });
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
   * Generate a secure 4-digit alphanumeric code
   */
  static generateVerificationCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    
    // Use crypto.getRandomValues for better randomness if available
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint8Array(4);
      crypto.getRandomValues(array);
      for (let i = 0; i < 4; i++) {
        result += chars[array[i] % chars.length];
      }
    } else {
      // Fallback to Math.random
      for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    
    return result;
  }

  /**
   * Validate verification code format
   */
  static isValidVerificationCode(code: string): boolean {
    return /^[A-Z0-9]{4}$/.test(code);
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
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.warn('Exception during session cleanup', error);
    }
  }
}