import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ThemeToggle } from './ui/ThemeToggle';

export const Signup: React.FC = () => {
  const [searchParams] = useSearchParams();
  const inviteId = searchParams.get('invite');
  const inviteEmail = searchParams.get('email');

  const [email, setEmail] = useState(inviteEmail || '');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<{
    circleName: string;
    role: string;
    inviterName: string;
  } | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(!!inviteId);

  const { user, loading: authLoading } = useAuth();

  // Load invite details if we have an invite ID
  useEffect(() => {
    if (inviteId) {
      loadInviteDetails();
    } else {
      setLoadingInvite(false);
    }
  }, [inviteId]);

  const loadInviteDetails = async () => {
    try {
      // Try to fetch invite details - this may be blocked by RLS for anonymous users
      // We'll just show a generic message if we can't load details
      const { data, error } = await supabase
        .from('circle_users')
        .select(`
          email,
          role,
          circle_id
        `)
        .eq('id', inviteId)
        .single();

      if (!error && data) {
        // Try to get circle name
        let circleName = 'a photo circle';
        if (data.circle_id) {
          const { data: circleData } = await supabase
            .from('circles')
            .select('name')
            .eq('id', data.circle_id)
            .single();
          if (circleData?.name) {
            circleName = circleData.name;
          }
        }

        setInviteDetails({
          circleName,
          role: data.role,
          inviterName: 'Someone',
        });
        // Pre-fill email if available from invite (and not already set from URL)
        if (data.email && !email) {
          setEmail(data.email);
        }
      } else {
        // RLS blocked access - that's OK, we'll show generic invitation message
        console.log('Could not load invite details (RLS), proceeding with generic signup');
      }
    } catch (err) {
      console.log('Could not load invite details:', err);
      // Continue without invite details - user can still sign up
    } finally {
      setLoadingInvite(false);
    }
  };

  // Show loading while auth is initializing
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl dark:shadow-2xl dark:shadow-black/20 p-8 w-full max-w-md text-center border border-transparent dark:border-slate-800">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is already logged in, redirect to admin
  if (user) {
    window.location.href = '/admin';
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Store redirect path before creating account
    const redirectPath = inviteId ? `/view-circle/${inviteId}` : '/admin';
    sessionStorage.setItem('postLoginRedirect', redirectPath);

    try {
      // Create account and log in directly - no verification code needed
      // The user already received an invite email, so we trust the email address
      const { data: authResponse, error: authError } = await supabase.functions.invoke('create-session-with-code', {
        body: {
          email: email.toLowerCase().trim(),
          code: 'SIGNUP', // Special code to indicate direct signup
        }
      });

      if (authError || !authResponse?.success) {
        console.error('Account creation failed', { authError, authResponse });
        setError(authResponse?.error || 'Failed to create account. Please try again.');
        setLoading(false);
        return;
      }

      console.log('Account created successfully', authResponse);

      // Store credentials for the success page - don't sign in here
      if (authResponse.temp_auth?.temp_password) {
        // Redirect to admin after signup
        const path = '/admin';

        // Store all data needed for the success page
        sessionStorage.setItem('signupSuccess', JSON.stringify({
          email: authResponse.temp_auth.email,
          tempPassword: authResponse.temp_auth.temp_password,
          userId: authResponse.temp_auth.user_id,
          fullName: fullName,
          inviteId: inviteId,
          circleName: inviteDetails?.circleName || '',
          redirectPath: path,
        }));

        console.log('Account created, navigating to success page');

        // Navigate to success page (no auth required)
        window.location.href = '/signup-success';
      }
    } catch (err) {
      console.error('Signup error', err);
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  const getRoleDisplay = (role: string) => {
    const roleMap: Record<string, string> = {
      admin: 'Admin',
      editor: 'Editor',
      contributor: 'Contributor',
      read_only: 'Viewer',
    };
    return roleMap[role] || role;
  };

  const getRoleColor = (role: string) => {
    const colorMap: Record<string, string> = {
      admin: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
      editor: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400',
      contributor: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
      read_only: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-400',
    };
    return colorMap[role] || 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-400';
  };

  if (loadingInvite) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl dark:shadow-2xl dark:shadow-black/20 p-8 w-full max-w-md text-center border border-transparent dark:border-slate-800">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading invitation details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-slate-900 dark:to-slate-800 flex justify-center p-4 pt-16 relative">
      {/* Theme toggle in corner */}
      <div className="absolute top-4 right-4">
        <ThemeToggle size="sm" />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl dark:shadow-2xl dark:shadow-black/20 p-8 w-full max-w-md h-fit border border-transparent dark:border-slate-800">
        <div className="text-center mb-6">
          <div className="text-4xl mb-4">📸</div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Join Knox</h1>
          {inviteDetails ? (
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              {inviteDetails.inviterName} invited you to join{' '}
              <strong>{inviteDetails.circleName}</strong>
            </p>
          ) : inviteId ? (
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              You've been invited to join a photo circle. Create your account to get started.
            </p>
          ) : (
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              Create your account to get started
            </p>
          )}
        </div>

        {/* Invitation details card */}
        {inviteDetails && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-indigo-900 dark:text-indigo-300">{inviteDetails.circleName}</p>
                <p className="text-sm text-indigo-700 dark:text-indigo-400">Photo Circle</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleColor(inviteDetails.role)}`}>
                {getRoleDisplay(inviteDetails.role)}
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-500"
              placeholder="your@email.com"
              disabled={!!inviteEmail}
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !fullName || !email}
            className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 disabled:bg-indigo-300 dark:disabled:bg-indigo-800 text-white font-bold py-3 px-4 rounded-md transition-colors"
          >
            {loading ? 'Creating account...' : 'Create Account & Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          <p>
            Already have an account?{' '}
            <a
              href={inviteId ? `/login?redirect=/view-circle/${inviteId}` : '/login'}
              className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline"
            >
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
