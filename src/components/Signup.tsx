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
      <div className="min-h-screen auth-gradient flex items-center justify-center p-4">
        <div className="auth-card p-8 w-full max-w-md text-center">
          <div className="loading-spinner h-12 w-12 mx-auto"></div>
          <p className="mt-4 text-theme-secondary">Loading...</p>
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
      console.log('🔑 SIGNUP: Creating account with full_name:', fullName);
      const { data: authResponse, error: authError } = await supabase.functions.invoke('create-session-with-code', {
        body: {
          email: email.toLowerCase().trim(),
          code: 'SIGNUP', // Special code to indicate direct signup
          full_name: fullName.trim() || null,
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

  const getRoleBadgeClass = (role: string) => {
    const classMap: Record<string, string> = {
      admin: 'badge-error',
      editor: 'badge-warning',
      contributor: 'badge-success',
      read_only: 'badge-default',
    };
    return classMap[role] || 'badge-default';
  };

  if (loadingInvite) {
    return (
      <div className="min-h-screen auth-gradient flex items-center justify-center p-4">
        <div className="auth-card p-8 w-full max-w-md text-center">
          <div className="loading-spinner h-12 w-12 mx-auto"></div>
          <p className="mt-4 text-theme-secondary">Loading invitation details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen auth-gradient flex justify-center p-4 pt-16 relative">
      {/* Theme toggle in corner */}
      <div className="absolute top-4 right-4">
        <ThemeToggle size="sm" />
      </div>

      <div className="auth-card p-8 w-full max-w-md h-fit">
        <div className="text-center mb-6">
          <div className="text-4xl mb-4">📸</div>
          <h1 className="text-3xl font-bold text-theme-primary">Join Kizu</h1>
          {inviteDetails ? (
            <p className="text-theme-secondary mt-2">
              {inviteDetails.inviterName} invited you to join{' '}
              <strong>{inviteDetails.circleName}</strong>
            </p>
          ) : inviteId ? (
            <p className="text-theme-secondary mt-2">
              You've been invited to join a photo circle. Create your account to get started.
            </p>
          ) : (
            <p className="text-theme-secondary mt-2">
              Create your account to get started
            </p>
          )}
        </div>

        {/* Invitation details card */}
        {inviteDetails && (
          <div className="badge-primary p-4 rounded-lg mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{inviteDetails.circleName}</p>
                <p className="text-sm opacity-80">Photo Circle</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeClass(inviteDetails.role)}`}>
                {getRoleDisplay(inviteDetails.role)}
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="form-label">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="input placeholder-muted"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="email" className="form-label">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input placeholder-muted disabled:input-disabled"
              placeholder="your@email.com"
              disabled={!!inviteEmail}
            />
          </div>

          {error && (
            <div className="alert-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !fullName || !email}
            className="w-full btn-primary py-3"
          >
            {loading ? 'Creating account...' : 'Create Account & Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-theme-secondary">
          <p>
            Already have an account?{' '}
            <a
              href={inviteId ? `/login?redirect=/view-circle/${inviteId}` : '/login'}
              className="link-primary underline"
            >
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
