import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export const SignupSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [circleName, setCircleName] = useState('');

  useEffect(() => {
    // Get stored signup data
    const signupData = sessionStorage.getItem('signupSuccess');
    if (signupData) {
      const data = JSON.parse(signupData);
      setUserName(data.fullName || '');
      setCircleName(data.circleName || '');
    }
  }, []);

  const handleContinue = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get stored credentials
      const signupData = sessionStorage.getItem('signupSuccess');
      if (!signupData) {
        setError('Session expired. Please sign up again.');
        setLoading(false);
        return;
      }

      const data = JSON.parse(signupData);

      // Sign in with the stored temporary credentials
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.tempPassword
      });

      if (signInError) {
        console.error('Sign in failed', signInError);
        setError('Failed to sign in. Please try logging in manually.');
        setLoading(false);
        return;
      }

      if (signInData.session && signInData.user) {
        console.log('Successfully signed in');

        // Clear the stored credentials
        sessionStorage.removeItem('signupSuccess');

        // Navigate to the redirect path
        window.location.href = data.redirectPath || '/admin';
      }
    } catch (err) {
      console.error('Error during sign in', err);
      setError('An unexpected error occurred.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md text-center">
        <div className="text-6xl mb-6">✓</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Account Created!</h1>
        <p className="text-gray-600 mb-4">
          Welcome to Kizu{userName ? `, ${userName}` : ''}! Your account has been verified and you're all set.
        </p>
        {circleName && (
          <p className="text-gray-600 mb-4">
            You've been added to <strong>{circleName}</strong>.
          </p>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleContinue}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-md transition-colors"
        >
          {loading ? 'Signing in...' : 'OK'}
        </button>
      </div>
    </div>
  );
};
