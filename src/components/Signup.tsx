import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ThemeToggle } from './ui/ThemeToggle';

export const Signup: React.FC = () => {
  const [searchParams] = useSearchParams();
  const inviteId = searchParams.get('invite');
  const inviteEmail = searchParams.get('email');
  const inviteName = searchParams.get('name');

  const [email, setEmail] = useState(inviteEmail || '');
  const [fullName, setFullName] = useState(inviteName || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileAppLink, setMobileAppLink] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<{
    circleName: string;
    role: string;
    inviterName: string;
  } | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(!!inviteId);

  const { user, loading: authLoading } = useAuth();

  // Detect if user is on mobile device
  const isMobileDevice = () => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
  };

  const isMobile = isMobileDevice();
  const userAgent = navigator.userAgent;

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

  // Don't wait for auth loading on signup page - new users won't have a session
  // Just check if user is already logged in (after auth loads)

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

    console.log('🔑 SIGNUP: Starting account creation...', { email, fullName, isMobile });

    try {
      // Create account and log in directly - no verification code needed
      // The user already received an invite email, so we trust the email address
      console.log('🔑 SIGNUP: Calling create-session-with-code...');

      const { data: authResponse, error: authError } = await supabase.functions.invoke('create-session-with-code', {
        body: {
          email: email.toLowerCase().trim(),
          code: 'SIGNUP', // Special code to indicate direct signup
          full_name: fullName.trim() || null,
        }
      });

      console.log('🔑 SIGNUP: API response received', { authResponse, authError });

      if (authError || !authResponse?.success) {
        console.error('Account creation failed', { authError, authResponse });
        setError(authResponse?.error || 'Failed to create account. Please try again.');
        setLoading(false);
        return;
      }

      console.log('Account created successfully', authResponse);
      console.log('session:', authResponse.session);

      // The function returns session tokens directly
      if (authResponse.session?.access_token && authResponse.session?.refresh_token) {
        console.log('🔑 SIGNUP: Session tokens received!');
        const accessToken = authResponse.session.access_token;
        const refreshToken = authResponse.session.refresh_token;

        // Check if on mobile - create token and show app link
        const checkMobile = isMobileDevice();
        console.log('🔑 SIGNUP: Device check - isMobile:', checkMobile, 'userAgent:', navigator.userAgent);

        if (checkMobile) {
          console.log('🔑 SIGNUP: Mobile device detected, creating deep link for app...');

          try {
            // Encode the tokens for the deep link (base64 encoded JSON)
            const tokenData = JSON.stringify({ access_token: accessToken, refresh_token: refreshToken });
            console.log('🔑 SIGNUP: Token data prepared');
            const encodedTokens = btoa(tokenData);
            console.log('🔑 SIGNUP: Tokens encoded');
            const appLink = `kizu://auth-session/${encodedTokens}`;

            console.log('🔑 SIGNUP: Mobile app link created:', appLink.substring(0, 50) + '...');
            setMobileAppLink(appLink);
            console.log('🔑 SIGNUP: State updated with mobileAppLink');
            setLoading(false);
            console.log('🔑 SIGNUP: Loading set to false');

            // Try to auto-open the app
            setTimeout(() => {
              console.log('🔑 SIGNUP: Attempting to open app...');
              window.location.href = appLink;
            }, 500);
          } catch (mobileErr) {
            console.error('🔑 SIGNUP: Error creating mobile link:', mobileErr);
            setError('Failed to create app link. Please try again.');
            setLoading(false);
          }
          return;
        }

        // Web sign-in - set the session directly using the tokens
        console.log('Setting session with tokens...');

        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          console.error('Failed to set session', sessionError);
          setError('Account created but sign-in failed. Please try logging in manually.');
          setLoading(false);
          return;
        }

        if (sessionData.session && sessionData.user) {
          console.log('Successfully signed in, redirecting to admin...');

          // Redirect to admin
          window.location.href = '/admin';
        } else {
          console.log('No session or user after setSession', sessionData);
          setError('Sign-in completed but no session created. Please try logging in manually.');
          setLoading(false);
        }
      } else {
        console.log('No session tokens in response', authResponse);
        setError('Account created but missing session. Please try logging in manually.');
        setLoading(false);
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

  // Don't block render for invite loading - show form immediately

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

        {/* Mobile App Success - Show when account created on mobile */}
        {mobileAppLink ? (
          <div className="text-center space-y-6">
            <div className="text-6xl">✓</div>
            <div>
              <h2 className="text-xl font-bold text-theme-primary mb-2">Account Created!</h2>
              <p className="text-theme-secondary">
                Welcome to Kizu{fullName ? `, ${fullName}` : ''}! Tap the button below to open the app and sign in.
              </p>
            </div>
            <a
              href={mobileAppLink}
              className="block w-full btn-primary py-4 text-center text-lg font-semibold"
            >
              Open Kizu App
            </a>
            <p className="text-sm text-theme-secondary">
              If the app doesn't open automatically, make sure you have the Kizu app installed.
            </p>
          </div>
        ) : (
          <>
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

            {/* Debug info */}
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400">
              <p><strong>Device:</strong> {isMobile ? '📱 Mobile' : '💻 Desktop'}</p>
              <p className="mt-1 break-all"><strong>UA:</strong> {userAgent.substring(0, 100)}...</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
