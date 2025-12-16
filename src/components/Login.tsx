import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { DebugSupabase } from './DebugSupabase';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  
  const { user, signInWithMagicLink } = useAuth();

  // Redirect if already logged in
  if (user) {
    return <Navigate to="/admin" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await signInWithMagicLink(email);
      if (error) {
        setError(error.message);
      } else {
        setEmailSent(true);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-4">📸</div>
          <h1 className="text-3xl font-bold text-gray-800">Knox Admin</h1>
          <p className="text-gray-600">
            {emailSent 
              ? 'Check your email for the magic link' 
              : 'Enter your email to receive a magic link'
            }
          </p>
        </div>

        {!emailSent ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="your@email.com"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 px-4 rounded-md transition-colors"
            >
              {loading ? 'Sending magic link...' : 'Send Magic Link'}
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
              <div className="flex items-center">
                <div className="text-2xl mr-2">📧</div>
                <div>
                  <p className="font-medium">Magic link sent!</p>
                  <p className="text-sm">Check your email ({email}) and click the link to sign in.</p>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => {
                setEmailSent(false);
                setEmail('');
                setError(null);
              }}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
            >
              Try Different Email
            </button>
          </div>
        )}

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Don't have an account? Contact your administrator.</p>
        </div>

        {/* Debug component temporarily disabled due to profiles table RLS restrictions
        {import.meta.env.DEV && (
          <div className="mt-6">
            <DebugSupabase />
          </div>
        )} */}
      </div>
    </div>
  );
};