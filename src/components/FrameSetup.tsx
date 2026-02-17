import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSupabaseUrl, getSupabaseAnonKey, getAppScheme } from '../lib/environments';

interface InviteData {
  circleName: string;
  inviterName: string;
  albumCount: number;
  email: string;
}

type Step = 'loading' | 'register' | 'success' | 'error';

export const FrameSetup: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteData | null>(null);

  // Registration form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Success data
  const [appLoginToken, setAppLoginToken] = useState<string | null>(null);

  useEffect(() => {
    loadInvite();
  }, [token]);

  const loadInvite = async () => {
    if (!token) {
      setError('Invalid invitation link');
      setStep('error');
      return;
    }

    try {
      // Use edge function to get invitation data
      const supabaseUrl = getSupabaseUrl();
      const supabaseAnonKey = getSupabaseAnonKey();

      const response = await fetch(
        `${supabaseUrl}/functions/v1/picture-frame-invite-api?token=${token}`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
        }
      );

      const result = await response.json();
      console.log('Invitation API result:', result);

      if (!response.ok || !result.success) {
        setError(result.error || 'This invitation link is invalid or has expired.');
        setStep('error');
        return;
      }

      const invitation = result.invitation;

      setInvite({
        circleName: invitation.circle_name || 'Family Circle',
        inviterName: invitation.inviter_name || 'Someone',
        albumCount: invitation.album_count || 0,
        email: invitation.prefilled_email || '',
      });

      // Pre-populate email if available
      if (invitation.prefilled_email) {
        setEmail(invitation.prefilled_email);
      }
      // Pre-populate name if available
      if (invitation.prefilled_name) {
        setFullName(invitation.prefilled_name);
      }
      setStep('register');
    } catch (err) {
      console.error('Error loading invitation:', err);
      setError('Failed to load invitation');
      setStep('error');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const supabaseUrl = getSupabaseUrl();
      const supabaseAnonKey = getSupabaseAnonKey();
      // Use activate action - no verification code needed for picture frames
      const response = await fetch(
        `${supabaseUrl}/functions/v1/picture-frame-verify-api?action=activate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            qr_token: token,
            full_name: fullName.trim(),
            email: email.trim().toLowerCase(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to activate picture frame');
        setSubmitting(false);
        return;
      }

      setAppLoginToken(data.app_login_token);
      setStep('success');
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const deepLink = appLoginToken ? `${getAppScheme()}://frame-login/${appLoginToken}` : null;

  // Loading state
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Loading invitation...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (step === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Unable to Load Invitation</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-500">Please ask the person who invited you for a new link.</p>
        </div>
      </div>
    );
  }

  // Registration form - just name entry, email is pre-filled
  if (step === 'register') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">📷</div>
            <h1 className="text-2xl font-bold text-gray-800">Picture Frame Setup</h1>
            <p className="text-gray-600 mt-2">
              <strong>{invite?.inviterName}</strong> invited you to view photos from{' '}
              <strong>{invite?.circleName}</strong>
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg text-gray-900 placeholder-gray-400 bg-white"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg text-gray-900 placeholder-gray-400 bg-white"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting || !fullName.trim() || !email.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Setting up...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">You're All Set!</h1>
        <p className="text-gray-600 mb-6">
          Your picture frame is ready. Choose how you'd like to view it.
        </p>

        <div className="space-y-4">
          {/* Browser frame option */}
          {appLoginToken && (
            <a
              href={`/frame?token=${appLoginToken}`}
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              🖥️ Use This Browser as Frame
            </a>
          )}

          <div className="text-gray-400 text-sm">— or use a mobile device —</div>

          <div className="flex gap-3 items-center justify-center">
            <a href="https://apps.apple.com/app/kizu/id6738030817" target="_blank" rel="noopener noreferrer">
              <img src="https://www.kizu.online/app-store-badge.png"
                   alt="Download on the App Store" height="44" />
            </a>
            <a href="https://play.google.com/store/apps/details?id=com.knox.mediavault" target="_blank" rel="noopener noreferrer">
              <img src="https://www.kizu.online/google-play-badge.png"
                   alt="Get it on Google Play" height="44" />
            </a>
          </div>

          {deepLink && (
            <a
              href={deepLink}
              className="block w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Open Kizu App
            </a>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Use browser for computers/TVs, or the app for tablets/phones
        </p>
      </div>
    </div>
  );
};
