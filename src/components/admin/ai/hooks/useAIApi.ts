/**
 * useAIApi Hook
 * Manages AI API connection state and health checks
 */

import { useState, useEffect, useCallback } from 'react';
import { aiApi } from '../../../../services/aiApi';
import { AI_CONFIG } from '../config';
import type { AIHealthStatus } from '../../../../types/ai';

interface UseAIApiReturn {
  connected: boolean | null;
  health: AIHealthStatus | null;
  loading: boolean;
  error: string | null;
  checkHealth: () => Promise<void>;
}

export function useAIApi(): UseAIApiReturn {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [health, setHealth] = useState<AIHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[AI API] Checking health...');
      const result = await aiApi.healthCheck();
      console.log('[AI API] Health check result:', result);

      if (result.success && result.data) {
        setConnected(true);
        setHealth(result.data);
      } else {
        setConnected(false);
        setError(result.error || 'Failed to connect');
        console.warn('[AI API] Health check failed:', result.error);
      }
    } catch (err) {
      console.error('[AI API] Health check exception:', err);
      setConnected(false);
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();

    // Periodic health checks
    const interval = setInterval(checkHealth, AI_CONFIG.healthCheckInterval);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return { connected, health, loading, error, checkHealth };
}
