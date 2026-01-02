import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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
      // Get the circle_user data including email
      const { data, error: dbError } = await supabase
        .from('circle_users')
        .select(`
          id,
          status,
          type,
          email,
          curated_albums,
          invited_by,
          circle_id
        `)
        .eq('qr_code_token', token)
        .eq('type', 'picture_frame')
        .single();

      console.log('circle_users query result:', { data, error: dbError });

      if (dbError || !data) {
        console.error('DB Error:', dbError);
        setError('This invitation link is invalid or has expired.');
        setStep('error');
        return;
      }

      // Fetch circle name separately
      let circleName = 'Family Circle';
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

      // Fetch inviter name separately
      let inviterName = 'Someone';
      if (data.invited_by) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', data.invited_by)
          .single();
        if (profileData) {
          inviterName = profileData.full_name || profileData.email?.split('@')[0] || 'Someone';
        }
      }

      if (data.status === 'accepted') {
        setError('This invitation has already been used.');
        setStep('error');
        return;
      }

      setInvite({
        circleName,
        inviterName,
        albumCount: data.curated_albums?.length || 0,
        email: data.email || '',
      });
      // Pre-populate email if available
      if (data.email) {
        setEmail(data.email);
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
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      // Use activate action - no verification code needed for picture frames
      const response = await fetch(
        `${supabaseUrl}/functions/v1/picture-frame-verify-api?action=activate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

  const deepLink = appLoginToken ? `knox://frame-login/${appLoginToken}` : null;

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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
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
          Your picture frame is ready. Download the Knox app to get started.
        </p>

        <div className="space-y-4">
          <a
            href="https://play.google.com/store/apps/details?id=com.knox.mediavault"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            Download from Play Store
          </a>

          {deepLink && (
            <>
              <div className="text-gray-400 text-sm">— or if app is installed —</div>
              <a
                href={deepLink}
                className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Open Knox App
              </a>
            </>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-6">
          After installing, tap "Open Knox App" to complete setup
        </p>
      </div>
    </div>
  );
};
