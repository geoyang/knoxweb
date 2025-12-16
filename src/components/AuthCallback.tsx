import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const AuthCallback: React.FC = () => {
  const [status, setStatus] = useState('Processing authentication...');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('Auth callback initiated');
        console.log('URL search params:', window.location.search);
        console.log('URL hash:', window.location.hash);
        
        // Get the access token and refresh token from the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const searchParamsObj = Object.fromEntries(searchParams.entries());
        
        console.log('Hash params:', Object.fromEntries(hashParams.entries()));
        console.log('Search params:', searchParamsObj);

        // Check if we have authentication parameters
        const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
        const tokenType = hashParams.get('token_type') || searchParams.get('token_type');
        const error = hashParams.get('error') || searchParams.get('error');
        const errorDescription = hashParams.get('error_description') || searchParams.get('error_description');

        if (error) {
          console.error('Auth callback error:', error, errorDescription);
          setError(`Authentication failed: ${errorDescription || error}`);
          setStatus('Authentication failed');
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        if (!accessToken) {
          console.warn('No access token found in callback URL');
          setError('No authentication tokens found in URL');
          setStatus('Authentication failed');
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        setStatus('Setting up session...');
        console.log('Setting up session with tokens');

        // Set the session using the tokens
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        });

        if (sessionError) {
          console.error('Session setup error:', sessionError);
          setError(`Failed to setup session: ${sessionError.message}`);
          setStatus('Session setup failed');
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        console.log('Session established:', data);
        setStatus('Authentication successful! Redirecting...');
        
        // Wait a moment then redirect to admin
        setTimeout(() => {
          navigate('/admin', { replace: true });
        }, 1000);

      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Unknown authentication error');
        setStatus('Authentication failed');
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleAuthCallback();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white max-w-md w-full mx-4">
        <div className="text-6xl mb-4">🔐</div>
        <h2 className="text-2xl font-bold mb-4">Knox Authentication</h2>
        <p className="text-lg mb-4">{status}</p>
        
        {error ? (
          <div className="bg-red-500/20 border border-red-300 rounded-lg p-4 mb-4">
            <p className="text-red-100">{error}</p>
            <p className="text-sm text-red-200 mt-2">
              Redirecting to login page...
            </p>
          </div>
        ) : (
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
        )}
      </div>
    </div>
  );
};