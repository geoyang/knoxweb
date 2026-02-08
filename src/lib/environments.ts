/**
 * Environment configuration for Kizu Web
 * Allows switching between dev and production Supabase projects
 */

export interface EnvironmentConfig {
  name: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// Environment configurations - loaded from env vars
export const ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  dev: {
    name: 'Development',
    supabaseUrl: import.meta.env.VITE_DEV_SUPABASE_URL || '',
    supabaseAnonKey: import.meta.env.VITE_DEV_SUPABASE_ANON_KEY || '',
  },
  prod: {
    name: 'Production',
    supabaseUrl: import.meta.env.VITE_PROD_SUPABASE_URL || '',
    supabaseAnonKey: import.meta.env.VITE_PROD_SUPABASE_ANON_KEY || '',
  },
};

const STORAGE_KEY = 'kizu-environment';

/**
 * Get the currently selected environment key
 * Manual override (localStorage) takes priority, then auto-detects based on hostname
 */
export function getSelectedEnvironmentKey(): string {
  // Check localStorage first for manual override
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ENVIRONMENTS[stored]) {
      return stored;
    }
  } catch {
    // localStorage not available
  }

  // Auto-detect environment based on hostname
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // dev.dashboard.kizu.online should use dev environment
    if (hostname.includes('dev.dashboard') || hostname === 'localhost') {
      return 'dev';
    }
    // dashboard.kizu.online uses prod
    if (hostname.includes('dashboard.kizu.online') && !hostname.includes('dev.')) {
      return 'prod';
    }
  }

  // Default to prod environment (most users are on production)
  return 'prod';
}

/**
 * Get the current environment configuration
 */
export function getCurrentEnvironment(): EnvironmentConfig {
  const key = getSelectedEnvironmentKey();
  return ENVIRONMENTS[key];
}

/**
 * Set the selected environment and reload the page
 */
export function setEnvironment(envKey: string): void {
  if (!ENVIRONMENTS[envKey]) {
    console.error(`Unknown environment: ${envKey}`);
    return;
  }

  try {
    // Clear existing auth data to avoid cross-environment issues
    const oldEnv = getSelectedEnvironmentKey();
    if (oldEnv !== envKey) {
      // Clear auth tokens from old environment
      const oldProjectRef = ENVIRONMENTS[oldEnv].supabaseUrl.split('//')[1]?.split('.')[0];
      if (oldProjectRef) {
        localStorage.removeItem(`sb-${oldProjectRef}-auth-token`);
      }
    }

    localStorage.setItem(STORAGE_KEY, envKey);

    // Reload to reinitialize Supabase client with new config
    window.location.reload();
  } catch (error) {
    console.error('Failed to set environment:', error);
  }
}

/**
 * Check if we're using the production environment
 */
export function isProduction(): boolean {
  return getSelectedEnvironmentKey() === 'prod';
}

/**
 * Get the current Supabase URL
 */
export function getSupabaseUrl(): string {
  return getCurrentEnvironment().supabaseUrl;
}

/**
 * Get the current Supabase anon key
 */
export function getSupabaseAnonKey(): string {
  return getCurrentEnvironment().supabaseAnonKey;
}
