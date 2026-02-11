import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';
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
  const [accountCreated, setAccountCreated] = useState(false);
  const [sessionTokens, setSessionTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [appOpenFailed, setAppOpenFailed] = useState(false);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-10), `[${timestamp}] ${msg}`]);
    console.log(msg);
  };
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
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const userAgent = navigator.userAgent;

  const APP_STORE_URL = 'https://apps.apple.com/us/app/kizu-mobile/id6757609621';
  const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.evolve.kizu.mobile';

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
      // Fetch invite details via API (doesn't require auth)
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/view-circle-api?invite_id=${inviteId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': getSupabaseAnonKey(),
          },
        }
      );

      const data = await response.json();
      if (response.ok && data.success && data.invite) {
        const invite = data.invite;
        setInviteDetails({
          circleName: invite.circles?.name || 'a photo circle',
          role: invite.role,
          inviterName: invite.circles?.profiles?.full_name || 'Someone',
        });
        // Pre-fill email if available from invite (and not already set from URL)
        if (invite.email && !email) {
          setEmail(invite.email);
        }
      } else {
        // API returned error - show generic invitation message
        console.log('Could not load invite details, proceeding with generic signup');
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

  // If user is already logged in AND we haven't just created an account, redirect to admin
  // (Don't redirect if we're showing the success screen)
  if (user && !accountCreated) {
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

    addLog(`Starting signup for ${email} (mobile: ${isMobile})`);

    try {
      // Use direct fetch with proper timeout support
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        addLog('Request timed out after 30s, aborting...');
        controller.abort();
      }, 30000);

      const supabaseUrl = getSupabaseUrl();
      const supabaseAnonKey = getSupabaseAnonKey();

      addLog('Calling edge function...');

      const response = await fetch(`${supabaseUrl}/functions/v1/create-session-with-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          code: 'SIGNUP',
          full_name: fullName.trim() || null,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      addLog(`Response received: ${response.status}`);

      const authResponse = await response.json();
      addLog(`Parsed response: ${authResponse.success ? 'success' : 'failed'}`);

      if (!response.ok || !authResponse?.success) {
        console.error('Account creation failed', authResponse);
        setError(authResponse?.error || 'Failed to create account. Please try again.');
        setLoading(false);
        return;
      }

      // Store tokens and show success screen
      if (authResponse.session?.access_token && authResponse.session?.refresh_token) {
        addLog('Got session tokens, showing success screen');
        setSessionTokens({
          accessToken: authResponse.session.access_token,
          refreshToken: authResponse.session.refresh_token,
        });
        setAccountCreated(true);
        setLoading(false);
      } else {
        addLog('No session tokens in response');
        setError('Account created but missing session. Please try logging in manually.');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Signup error', err);
      addLog(`Error: ${err.name} - ${err.message}`);
      if (err.name === 'AbortError') {
        setError('Request timed out. Please check your connection and try again.');
      } else {
        setError(`Error: ${err.message || 'An unexpected error occurred'}`);
      }
      setLoading(false);
    }
  };

  // Handle opening the mobile app
  const handleOpenMobileApp = () => {
    if (!sessionTokens) return;

    const tokenData = JSON.stringify({
      access_token: sessionTokens.accessToken,
      refresh_token: sessionTokens.refreshToken
    });
    // Use URL-safe base64 encoding (replace +/= with URL-safe chars)
    const base64Tokens = btoa(tokenData);
    const urlSafeTokens = base64Tokens.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const appLink = `kizu://auth-session/${urlSafeTokens}`;

    addLog('Attempting to open app via deep link...');

    // If the app opens, the page loses visibility. Track that.
    let appOpened = false;
    const onVisibilityChange = () => {
      if (document.hidden) {
        appOpened = true;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Try the deep link
    window.location.href = appLink;

    // After 1.5s, if page is still visible, app didn't open
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (!appOpened) {
        addLog('App did not open, showing download options');
        setAppOpenFailed(true);
      }
    }, 1500);
  };

  // Handle continuing to web dashboard
  const handleContinueToWeb = async () => {
    if (!sessionTokens) return;

    setLoading(true);

    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: sessionTokens.accessToken,
      refresh_token: sessionTokens.refreshToken,
    });

    if (sessionError) {
      console.error('Failed to set session', sessionError);
      setError('Sign-in failed. Please try logging in manually.');
      setLoading(false);
      return;
    }

    if (sessionData.session && sessionData.user) {
      window.location.href = '/admin';
    } else {
      setError('Sign-in failed. Please try logging in manually.');
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

        {/* Success Screen - Show after account is created */}
        {accountCreated ? (
          <div className="text-center space-y-6">
            <div className="text-6xl text-green-500">✓</div>
            <div>
              <h2 className="text-xl font-bold text-theme-primary mb-2">Account Created!</h2>
              <p className="text-theme-secondary">
                Welcome to Kizu{fullName ? `, ${fullName}` : ''}!
              </p>
            </div>

            {isMobile ? (
              <>
                <button
                  onClick={handleOpenMobileApp}
                  className="w-full btn-primary py-4 text-lg font-semibold"
                >
                  Open in Kizu App
                </button>

                {appOpenFailed && (
                  <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-sm text-theme-secondary font-medium">
                      Don't have the app yet? Download it:
                    </p>
                    <div className="flex gap-3 items-center justify-center">
                      {(isIOS || (!isIOS && !isAndroid)) && (
                        <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
                          <img src="https://www.kizu.online/app-store-badge.png"
                               alt="Download on the App Store" height="44" />
                        </a>
                      )}
                      {(isAndroid || (!isIOS && !isAndroid)) && (
                        <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
                          <img src="https://www.kizu.online/google-play-badge.png"
                               alt="Get it on Google Play" height="44" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={handleContinueToWeb}
                    disabled={loading}
                    className="text-sm text-theme-secondary underline hover:text-theme-primary"
                  >
                    {loading ? 'Loading...' : 'Or continue in browser'}
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={handleContinueToWeb}
                disabled={loading}
                className="w-full btn-primary py-4 text-lg font-semibold"
              >
                {loading ? 'Signing in...' : 'Continue to Dashboard'}
              </button>
            )}

            {error && (
              <div className="alert-error">
                {error}
              </div>
            )}
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
            className="w-full btn-primary py-3 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
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
            {window.location.hostname !== 'dashboard.kizu.online' && (
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400">
              <p><strong>Device:</strong> {isMobile ? '📱 Mobile' : '💻 Desktop'}</p>
              <p className="mt-1 break-all"><strong>UA:</strong> {userAgent.substring(0, 100)}...</p>
            </div>
            )}
          </>
        )}

        {/* Debug log panel */}
        {debugLogs.length > 0 && window.location.hostname !== 'dashboard.kizu.online' && (
          <div className="mt-4 p-3 bg-black text-green-400 rounded text-xs font-mono max-h-40 overflow-y-auto">
            <p className="text-white mb-1 font-bold">Debug Log:</p>
            {debugLogs.map((log, i) => (
              <p key={i} className="break-all">{log}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
