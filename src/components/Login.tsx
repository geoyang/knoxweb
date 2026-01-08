import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { DebugSupabase } from './DebugSupabase';
import { TokenManager } from '../utils/tokenManager';
import { ThemeToggle } from './ui/ThemeToggle';

const REMEMBER_EMAIL_KEY = 'knox_remember_email';
const SAVED_EMAIL_KEY = 'knox_saved_email';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [authMethod, setAuthMethod] = useState<'magic-link' | 'code'>('code');
  const [codeSent, setCodeSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [rememberEmail, setRememberEmail] = useState(false);

  const { user, loading: authLoading, signInWithMagicLink, signInWithCode, verifyCode, checkUserExists } = useAuth();
  const navigate = useNavigate();

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
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white dark:border-indigo-400"></div>
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
      setError(`No account found for ${email}. Please contact your administrator.`);
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
      setError(`No account found for ${email}. Please contact your administrator.`);
      return;
    }

    const { error, code } = await signInWithCode(email);
    if (error) {
      setError(error.message);
    } else {
      saveEmailIfRemembered();
      setCodeSent(true);
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

    try {
      const { error, success } = await verifyCode(email, verificationCode);
      if (error) {
        setError(error.message);
      } else if (success) {
        console.log('Code verification successful, redirecting...');
        navigate('/admin', { replace: true });
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
    setEmail('');
    setError(null);
  };

  const switchAuthMethod = () => {
    setAuthMethod(authMethod === 'magic-link' ? 'code' : 'magic-link');
    resetForm();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4 relative">
      {/* Theme toggle in corner */}
      <div className="absolute top-4 right-4">
        <ThemeToggle size="sm" />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl dark:shadow-2xl dark:shadow-black/20 p-8 w-full max-w-md border border-transparent dark:border-slate-800">
        <div className="text-center mb-8">
          <div className="text-4xl mb-4">📸</div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Knox Admin</h1>
          <p className="text-slate-600 dark:text-slate-400">
            {emailSent
              ? 'Check your email for the magic link'
              : codeSent
              ? `Enter the 4-digit code sent to ${email}`
              : 'Passwordless Authentication'
            }
          </p>
        </div>

        {/* Auth Method Toggle - Magic Link temporarily disabled
        {!emailSent && !codeSent && (
          <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setAuthMethod('magic-link')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                authMethod === 'magic-link'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              🪄 Magic Link
            </button>
            <button
              type="button"
              onClick={() => setAuthMethod('code')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                authMethod === 'code'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              🔢 4-Digit Code
            </button>
          </div>
        )}
        */}

        {!emailSent && !codeSent ? (
          <form onSubmit={handleSubmit} className="space-y-6">
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
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="your@email.com"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-email"
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => handleRememberEmailChange(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600 rounded cursor-pointer bg-white dark:bg-slate-800"
                />
                <label htmlFor="remember-email" className="ml-2 block text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  Remember my email
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 disabled:bg-indigo-300 dark:disabled:bg-indigo-800 text-white font-bold py-2 px-4 rounded-md transition-colors"
              >
                {loading
                  ? 'Sending...'
                  : '📱 Send Code'
                }
              </button>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-md">
                {error}
              </div>
            )}

            <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
              {authMethod === 'magic-link'
                ? 'No password needed! We\'ll send you a secure link to sign in.'
                : 'We\'ll send you a 4-digit code to verify your identity.'
              }
            </p>
          </form>
        ) : emailSent ? (
          <div className="space-y-6">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-md">
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
              className="w-full bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors"
            >
              Try Different Email
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-md">
              <div className="flex items-center">
                <div className="text-2xl mr-2">🔢</div>
                <div>
                  <p className="font-medium">Code sent!</p>
                  <p className="text-sm">Enter the 4-digit code sent to {email}</p>
                  {import.meta.env.DEV && devCode && (
                    <p className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 px-2 py-1 rounded mt-2">
                      Dev Code: <strong>{devCode}</strong>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleCodeVerification} className="space-y-6">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
                      setTimeout(async () => {
                        setLoading(true);
                        setError(null);
                        try {
                          const { error, success } = await verifyCode(email, code);
                          if (error) {
                            setError(error.message);
                          } else if (success) {
                            navigate('/admin', { replace: true });
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
                  className="w-full px-3 py-3 text-center text-2xl font-bold tracking-widest border border-slate-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="----"
                  autoComplete="one-time-code"
                />
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-md">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !verificationCode || verificationCode.length !== 4}
                className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 disabled:bg-indigo-300 dark:disabled:bg-indigo-800 text-white font-bold py-2 px-4 rounded-md transition-colors"
              >
                {loading ? 'Verifying...' : '✓ Verify Code'}
              </button>
            </form>

            <button
              onClick={resetForm}
              className="w-full bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors"
            >
              Try Different Email
            </button>
          </div>
        )}

        <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          <p>Don't have an account? Contact your administrator.</p>
          {/* Switch auth method - temporarily disabled
          {(emailSent || codeSent) && (
            <button
              onClick={switchAuthMethod}
              className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline mt-2"
            >
              Try {authMethod === 'magic-link' ? '4-digit code' : 'magic link'} instead
            </button>
          )}
          */}
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