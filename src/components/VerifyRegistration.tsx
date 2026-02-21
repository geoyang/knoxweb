import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';
import { getDisplayIdentifier } from '../utils/phoneDisplayUtils';

interface VerificationResult {
  success: boolean;
  message: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  circle?: {
    id: string;
    name: string;
  };
  redirectUrl?: string;
  error?: string;
}

export const VerifyRegistration: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const verifyRegistration = async () => {
      const token = searchParams.get('token');
      const inviteId = searchParams.get('invite');

      if (!token || !inviteId) {
        setStatus('error');
        setResult({ success: false, message: 'Invalid verification link', error: 'Missing token or invite ID' });
        return;
      }

      try {
        const supabaseUrl = getSupabaseUrl();
        const supabaseAnonKey = getSupabaseAnonKey();

        const response = await fetch(
          `${supabaseUrl}/functions/v1/verify-registration?token=${token}&invite=${inviteId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const data = await response.json();

        if (data.success) {
          setStatus('success');
          setResult(data);
        } else {
          setStatus('error');
          setResult({ success: false, message: data.error || 'Verification failed', error: data.error });
        }
      } catch (err) {
        setStatus('error');
        setResult({
          success: false,
          message: 'Failed to verify registration',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    };

    verifyRegistration();
  }, [searchParams]);

  // Countdown and redirect after success
  useEffect(() => {
    if (status === 'success' && result?.redirectUrl) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            // Navigate to login page with verified status
            const url = new URL(result.redirectUrl!);
            navigate(`${url.pathname}${url.search}`);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [status, result, navigate]);

  if (status === 'verifying') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mx-auto mb-6"></div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Verifying Your Account</h1>
          <p className="text-gray-600">Please wait while we complete your registration...</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Welcome to Kizu!</h1>
          <p className="text-gray-600 mb-4">
            Your account has been verified successfully.
          </p>

          {result?.user && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4 text-left">
              <p className="text-sm text-gray-600">
                <strong>Name:</strong> {result.user.firstName} {result.user.lastName}
              </p>
              <p className="text-sm text-gray-600">
                <strong>Email:</strong> {getDisplayIdentifier(result.user.email)}
              </p>
              {result.circle && (
                <p className="text-sm text-gray-600">
                  <strong>Circle:</strong> {result.circle.name}
                </p>
              )}
            </div>
          )}

          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <p className="text-blue-800">
              Redirecting to sign in in <strong>{countdown}</strong> seconds...
            </p>
          </div>

          <button
            onClick={() => {
              if (result?.redirectUrl) {
                const url = new URL(result.redirectUrl);
                navigate(`${url.pathname}${url.search}`);
              }
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            Sign In Now
          </button>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Verification Failed</h1>
        <p className="text-gray-600 mb-4">
          {result?.message || 'We couldn\'t verify your account.'}
        </p>

        {result?.error && (
          <div className="bg-red-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-red-800">{result.error}</p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            Try Again
          </button>
          <p className="text-sm text-gray-500">
            If the problem persists, please contact support.
          </p>
        </div>
      </div>
    </div>
  );
};
