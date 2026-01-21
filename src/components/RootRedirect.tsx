import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const RootRedirect: React.FC = () => {
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleHashParams = async () => {
      const hash = window.location.hash;

      // Check if there are auth tokens in the hash (email confirmation, magic link, etc.)
      if (hash && hash.includes('access_token')) {
        console.log('Found auth tokens in hash, processing...');

        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');
        const errorParam = hashParams.get('error');
        const errorDescription = hashParams.get('error_description');

        if (errorParam) {
          console.error('Auth error:', errorParam, errorDescription);
          setError(errorDescription || errorParam);
          setChecking(false);
          return;
        }

        if (accessToken) {
          try {
            const { data, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            });

            if (sessionError) {
              console.error('Session setup error:', sessionError);
              setError(sessionError.message);
              setChecking(false);
              return;
            }

            console.log('Session established via hash params:', data);

            // Clear the hash from URL
            window.history.replaceState({}, '', '/');

            // Redirect to admin
            navigate('/admin', { replace: true });
            return;
          } catch (err) {
            console.error('Error processing auth tokens:', err);
            setError(err instanceof Error ? err.message : 'Authentication failed');
            setChecking(false);
            return;
          }
        }
      }

      // No hash params, just redirect to admin
      setChecking(false);
    };

    handleHashParams();
  }, [navigate]);

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white max-w-md w-full mx-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Verifying your account...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center mx-4">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Verification Failed</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/login"
            className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return <Navigate to="/admin" replace />;
};
