import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DebugSupabase } from './DebugSupabase';
import { TokenManager } from '../utils/tokenManager';
import { ThemeToggle } from './ui/ThemeToggle';
import { getSelectedEnvironmentKey, setEnvironment, ENVIRONMENTS } from '../lib/environments';

const REMEMBER_EMAIL_KEY = 'knox_remember_email';
const SAVED_EMAIL_KEY = 'knox_saved_email';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [authMethod, setAuthMethod] = useState<'magic-link' | 'code'>('code');
  const [codeSent, setCodeSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [deliveryChannel, setDeliveryChannel] = useState<'email' | 'sms'>('email');
  const [rememberEmail, setRememberEmail] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [showEnvSelector, setShowEnvSelector] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState(getSelectedEnvironmentKey());
  const [appOpenFailed, setAppOpenFailed] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [sessionTokens, setSessionTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);

  const { user, loading: authLoading, signInWithMagicLink, signInWithCode, verifyCode, checkUserExists, signUp } = useAuth();

  // Detect if user is on mobile device
  const isMobileDevice = () => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
  };

  const isMobile = isMobileDevice();
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);

  const APP_STORE_URL = 'https://apps.apple.com/us/app/kizu-mobile/id6757609621';
  const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.evolve.kizu.mobile';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Check for signup mode from URL parameter
  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'signup') {
      setIsSignUp(true);
    }
  }, [searchParams]);

  // Load saved email on mount
  useEffect(() => {
    const remember = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (remember === 'true') {
      setRememberEmail(true);
      const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY);
      if (savedEmail) {
        setEmail(savedEmail);
      }
    }
  }, []);

  const handleRememberEmailChange = (checked: boolean) => {
    setRememberEmail(checked);
    localStorage.setItem(REMEMBER_EMAIL_KEY, checked ? 'true' : 'false');
    if (!checked) {
      localStorage.removeItem(SAVED_EMAIL_KEY);
    }
  };

  const saveEmailIfRemembered = () => {
    if (rememberEmail && email) {
      localStorage.setItem(SAVED_EMAIL_KEY, email.toLowerCase().trim());
    }
  };

  // Don't redirect while auth is still loading, but allow verification screen to stay
  if (authLoading && !codeSent && !emailSent) {
    return (
      <div className="min-h-screen auth-gradient flex items-center justify-center">
        <div className="loading-spinner h-12 w-12"></div>
      </div>
    );
  }

  // Redirect if already logged in (but not during code entry)
  if (user && !codeSent) {
    return <Navigate to="/admin" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (authMethod === 'magic-link') {
        await handleMagicLinkAuth();
      } else {
        await handleCodeAuth();
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLinkAuth = async () => {
    // Check if user exists first
    const { exists, error: checkError } = await checkUserExists(email);

    if (checkError) {
      setError('Failed to verify user account. Please try again.');
      return;
    }

    if (!exists) {
      setError(`No account found for ${email}.`);
      setIsSignUp(true);
      return;
    }

    const { error } = await signInWithMagicLink(email);
    if (error) {
      setError(error.message);
    } else {
      setEmailSent(true);
    }
  };

  const handleCodeAuth = async () => {
    // Check if user exists first
    const { exists, error: checkError } = await checkUserExists(email);

    if (checkError) {
      setError('Failed to verify user account. Please try again.');
      return;
    }

    if (!exists) {
      setError(`No account found for ${email}.`);
      setIsSignUp(true);
      return;
    }

    const { error, code, deliveryChannel: channel } = await signInWithCode(email);
    if (error) {
      setError(error.message);
    } else {
      saveEmailIfRemembered();
      setCodeSent(true);
      if (channel === 'sms') {
        setDeliveryChannel('sms');
      }
      if (import.meta.env.DEV && code) {
        setDevCode(code);
      }
    }
  };

  const handleCodeVerification = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!verificationCode || verificationCode.length !== 4) {
      setError('Please enter the 4-digit code');
      return;
    }

    setLoading(true);
    setError(null);

    console.log('🔑 CODE VERIFICATION: Starting verification for:', email);

    try {
      // On mobile, skip setSession so tokens stay fresh for the deep link handoff.
      // This matches the Signup.tsx pattern where raw tokens are stored in state.
      const { error, success, tokens } = await verifyCode(email, verificationCode, undefined, isMobile);
      if (error) {
        setError(error.message);
      } else if (success) {
        console.log('Code verification successful, mobile:', isMobile);
        if (isMobile && tokens) {
          setSessionTokens({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
          });
          setLoginSuccess(true);
        } else if (isMobile) {
          // Fallback: tokens not returned (e.g., hashed_token flow), session already set
          setLoginSuccess(true);
        } else {
          navigate('/admin', { replace: true });
        }
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmailSent(false);
    setCodeSent(false);
    setVerificationCode('');
    setDevCode(null);
    setDeliveryChannel('email');
    setEmail('');
    setError(null);
    setIsSignUp(false);
    setSignUpSuccess(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await signUp(email, fullName.trim());
      if (error) {
        setError(error.message);
      } else {
        setSignUpSuccess(true);
      }
    } catch (err) {
      setError('Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchAuthMethod = () => {
    setAuthMethod(authMethod === 'magic-link' ? 'code' : 'magic-link');
    resetForm();
  };

  // Handle opening the mobile app with session tokens (matching Signup.tsx pattern)
  const handleOpenMobileApp = () => {
    if (!sessionTokens) {
      // Fallback: try to get from live session (hashed_token flow where tokens were consumed)
      handleOpenMobileAppFallback();
      return;
    }

    const tokenData = JSON.stringify({
      access_token: sessionTokens.accessToken,
      refresh_token: sessionTokens.refreshToken,
    });
    const base64Tokens = btoa(tokenData);
    const urlSafeTokens = base64Tokens.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const appLink = `kizu://auth-session/${urlSafeTokens}`;

    let appOpened = false;
    const onVisibilityChange = () => {
      if (document.hidden) {
        appOpened = true;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    window.location.href = appLink;

    setTimeout(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (!appOpened) {
        setAppOpenFailed(true);
      }
    }, 1500);
  };

  // Fallback for hashed_token flow where session was already consumed
  const handleOpenMobileAppFallback = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const tokenData = JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    const base64Tokens = btoa(tokenData);
    const urlSafeTokens = base64Tokens.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const appLink = `kizu://auth-session/${urlSafeTokens}`;

    window.location.href = appLink;

    let appOpened = false;
    const onVisibilityChange = () => {
      if (document.hidden) {
        appOpened = true;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    setTimeout(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (!appOpened) {
        setAppOpenFailed(true);
      }
    }, 1500);
  };

  const handleContinueToWeb = async () => {
    if (sessionTokens) {
      // Tokens weren't consumed yet (skipSetSession was used), set them now
      setLoading(true);
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: sessionTokens.accessToken,
        refresh_token: sessionTokens.refreshToken,
      });
      if (sessionError) {
        setError('Failed to sign in. Please try logging in again.');
        setLoading(false);
        return;
      }
    }
    navigate('/admin', { replace: true });
  };

  // Handle environment change
  const handleEnvChange = (envKey: string) => {
    setSelectedEnv(envKey);
    if (envKey !== getSelectedEnvironmentKey()) {
      setEnvironment(envKey);
    }
  };

  const currentEnv = getSelectedEnvironmentKey();

  return (
    <div className="min-h-screen auth-gradient flex flex-col">
      {/* Development Environment Banner */}
      {currentEnv === 'dev' && (
        <div className="bg-orange-500 text-white text-center py-1 text-sm font-medium">
          Development Environment
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-4 relative">
      {/* Hidden key icon for dev/prod switch */}
      <button
        onClick={() => setShowEnvSelector(!showEnvSelector)}
        className="absolute top-4 left-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-30 hover:opacity-100 transition-opacity"
        title="Environment Settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Environment selector dropdown */}
      {showEnvSelector && (
        <div className="absolute top-14 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 z-50 min-w-[200px]">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
            Backend Environment
          </div>
          <div className="space-y-1">
            {Object.entries(ENVIRONMENTS).map(([key, env]) => (
              <button
                key={key}
                onClick={() => handleEnvChange(key)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedEnv === key
                    ? key === 'dev'
                      ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                      : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className="font-medium">{env.name}</span>
                {selectedEnv === key && (
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
              {ENVIRONMENTS[selectedEnv].supabaseUrl.split('//')[1]?.split('.')[0]}
            </div>
          </div>
        </div>
      )}

      {/* Theme toggle in corner */}
      <div className="absolute top-4 right-4">
        <ThemeToggle size="sm" />
      </div>

      <div className="auth-card p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-4">📸</div>
          <h1 className="text-3xl font-bold text-theme-primary">Kizu Admin</h1>
          <p className="text-theme-secondary">
            {loginSuccess
              ? 'Welcome back!'
              : signUpSuccess
              ? 'Account created successfully!'
              : isSignUp
              ? 'Create your account'
              : emailSent
              ? 'Check your email for the magic link'
              : codeSent
              ? deliveryChannel === 'sms'
                ? 'Enter the 4-digit code sent to your phone'
                : `Enter the 4-digit code sent to ${email}`
              : 'Passwordless Authentication'
            }
          </p>
        </div>

        {signUpSuccess ? (
          <div className="space-y-6">
            <div className="alert-success">
              <div className="flex items-center">
                <div className="text-2xl mr-2">📧</div>
                <div>
                  <p className="font-medium">Check your email!</p>
                  <p className="text-sm">We sent a verification link to {email}. Click the link to activate your account.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => { setSignUpSuccess(false); setIsSignUp(false); setEmail(''); }}
              className="w-full btn-secondary"
            >
              Back to Sign In
            </button>
          </div>
        ) : isSignUp ? (
          <form onSubmit={handleSignUp} className="space-y-6">
            <div>
              <label htmlFor="fullName" className="form-label">
                Your Name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="input placeholder-muted"
                placeholder="John Smith"
                autoComplete="name"
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
                className="input placeholder-muted"
                placeholder="your@email.com"
              />
            </div>

            {error && (
              <div className="alert-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !fullName.trim()}
              className="w-full btn-primary"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>

            <p className="text-sm text-theme-secondary text-center">
              We'll create your account and you can sign in immediately.
            </p>
          </form>
        ) : !emailSent && !codeSent ? (
          <form onSubmit={handleSubmit} className="space-y-6">
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
                className="input placeholder-muted"
                placeholder="your@email.com"
              />
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center">
                <input
                  id="remember-email"
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => handleRememberEmailChange(e.target.checked)}
                  className="h-4 w-4 checkbox rounded cursor-pointer"
                />
                <label htmlFor="remember-email" className="ml-2 block text-sm text-theme-secondary cursor-pointer">
                  Remember my email
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary whitespace-nowrap shrink-0"
              >
                {loading ? 'Sending...' : 'Send Code'}
              </button>
            </div>

            {error && (
              <div className="alert-error">
                {error}
              </div>
            )}

            <p className="text-sm text-theme-secondary text-center">
              {authMethod === 'magic-link'
                ? 'No password needed! We\'ll send you a secure link to sign in.'
                : 'We\'ll send you a 4-digit code to verify your identity.'
              }
            </p>
          </form>
        ) : loginSuccess ? (
          <div className="text-center space-y-6">
            <div className="text-6xl text-green-500">✓</div>
            <div>
              <h2 className="text-xl font-bold text-theme-primary mb-2">Signed In!</h2>
              <p className="text-theme-secondary">
                Your identity has been verified.
              </p>
            </div>

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
                className="text-sm text-theme-secondary underline hover:text-theme-primary"
              >
                Or continue in browser
              </button>
            </div>
          </div>
        ) : emailSent ? (
          <div className="space-y-6">
            <div className="alert-success">
              <div className="flex items-center">
                <div className="text-2xl mr-2">📧</div>
                <div>
                  <p className="font-medium">Magic link sent!</p>
                  <p className="text-sm">Check your email ({email}) and click the link to sign in.</p>
                </div>
              </div>
            </div>

            <button
              onClick={resetForm}
              className="w-full btn-secondary"
            >
              Try Different Email
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="alert-success">
              <div className="flex items-center">
                <div className="text-2xl mr-2">🔢</div>
                <div>
                  <p className="font-medium">Code sent!</p>
                  <p className="text-sm">
                    {deliveryChannel === 'sms'
                      ? 'Enter the 4-digit code sent to your phone via SMS'
                      : `Enter the 4-digit code sent to ${email}`}
                  </p>
                  {import.meta.env.DEV && devCode && (
                    <p className="dev-banner mt-2">
                      Dev Code: <strong>{devCode}</strong>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleCodeVerification} className="space-y-6">
              <div>
                <label htmlFor="code" className="form-label">
                  4-Digit Code
                </label>
                <input
                  id="code"
                  type="text"
                  value={verificationCode}
                  onChange={(e) => {
                    const code = e.target.value.toUpperCase().slice(0, 4);
                    setVerificationCode(code);
                    // Auto-submit when 4 characters are entered
                    if (code.length === 4) {
                      console.log('🔑 AUTO-SUBMIT: Code complete, auto-submitting for:', email);
                      setTimeout(async () => {
                        setLoading(true);
                        setError(null);
                        try {
                          const { error, success, tokens } = await verifyCode(email, code, undefined, isMobile);
                          if (error) {
                            setError(error.message);
                          } else if (success) {
                            if (isMobile && tokens) {
                              setSessionTokens({
                                accessToken: tokens.access_token,
                                refreshToken: tokens.refresh_token,
                              });
                              setLoginSuccess(true);
                            } else if (isMobile) {
                              setLoginSuccess(true);
                            } else {
                              navigate('/admin', { replace: true });
                            }
                          }
                        } catch (err) {
                          setError('Verification failed. Please try again.');
                        } finally {
                          setLoading(false);
                        }
                      }, 100);
                    }
                  }}
                  maxLength={4}
                  inputMode="text"
                  autoCapitalize="characters"
                  className="input text-center text-2xl font-bold tracking-widest py-3"
                  placeholder="----"
                  autoComplete="one-time-code"
                />
              </div>

              {error && (
                <div className="alert-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !verificationCode || verificationCode.length !== 4}
                className="w-full btn-primary py-2"
              >
                {loading ? 'Verifying...' : '✓ Verify Code'}
              </button>
            </form>

            <button
              onClick={resetForm}
              className="w-full btn-secondary"
            >
              Try Different Email
            </button>
          </div>
        )}

        <div className="mt-6 text-center text-sm text-theme-secondary">
          {isSignUp ? (
            <p>
              Already have an account?{' '}
              <button
                onClick={() => { setIsSignUp(false); setError(null); }}
                className="text-theme-link hover:underline font-medium"
              >
                Sign in
              </button>
            </p>
          ) : (
            <p>
              Don't have an account?{' '}
              <button
                onClick={() => setIsSignUp(true)}
                className="text-theme-link hover:underline font-medium"
              >
                Create one
              </button>
            </p>
          )}
        </div>
      </div>

      {/* Click outside to close env selector */}
      {showEnvSelector && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowEnvSelector(false)}
        />
      )}
      </div>
    </div>
  );
};
