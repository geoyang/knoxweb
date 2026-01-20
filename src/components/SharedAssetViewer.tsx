import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface AssetData {
  id: string;
  media_type: string;
  width: number;
  height: number;
  created_at: string;
}

interface ViewResponse {
  valid: boolean;
  expired: boolean;
  in_album: boolean;
  asset: AssetData;
  owner: {
    name: string;
  };
  token_id: string;
  error?: string;
}

type ViewState = 'loading' | 'valid' | 'expired_in_album' | 'expired_not_in_album' | 'error';

export const SharedAssetViewer: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<ViewState>('loading');
  const [data, setData] = useState<ViewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  useEffect(() => {
    if (token) {
      loadAsset();
    } else {
      setError('No share token provided');
      setState('error');
    }
  }, [token]);

  const loadAsset = async () => {
    try {
      setState('loading');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/asset-share-api?action=view&token=${token}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );

      const result: ViewResponse = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to load shared asset');
        setState('error');
        return;
      }

      setData(result);

      if (result.valid) {
        setState('valid');
        setImageUrl(`${supabaseUrl}/functions/v1/asset-share-api?action=serve&token=${token}`);
      } else if (result.expired) {
        setState(result.in_album ? 'expired_in_album' : 'expired_not_in_album');
      } else {
        setError('Invalid token');
        setState('error');
      }
    } catch (err) {
      console.error('Error loading shared asset:', err);
      setError('Failed to load shared asset');
      setState('error');
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !requesterEmail) return;

    try {
      setSubmitting(true);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/asset-share-api?action=request-access`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            token,
            requester_email: requesterEmail,
            requester_name: requesterName || undefined,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit access request');
      }

      setRequestSubmitted(true);
    } catch (err) {
      console.error('Error requesting access:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">
            <svg className="w-16 h-16 mx-auto text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Unable to Load</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (state === 'valid' && data) {
    const isVideo = data.asset.media_type?.startsWith('video');

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col">
        <header className="bg-black/30 backdrop-blur-sm p-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                {data.owner.name?.charAt(0)?.toUpperCase() || 'K'}
              </div>
              <div>
                <p className="text-white font-medium">{data.owner.name}</p>
                <p className="text-white/60 text-sm">
                  {new Date(data.asset.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="text-white/60 text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Shared via Kizu
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-4xl w-full">
            {isVideo ? (
              <video
                src={`${imageUrl}&type=original`}
                controls
                className="w-full rounded-lg shadow-2xl"
                poster={imageUrl || undefined}
              />
            ) : (
              <img
                src={`${imageUrl}&type=original`}
                alt="Shared photo"
                className="w-full rounded-lg shadow-2xl"
                style={{ maxHeight: '80vh', objectFit: 'contain' }}
              />
            )}
          </div>
        </main>

        <footer className="bg-black/30 backdrop-blur-sm p-4 text-center">
          <p className="text-white/60 text-sm">
            Shared with Kizu - Private by design
          </p>
        </footer>
      </div>
    );
  }

  if (state === 'expired_in_album' && data) {
    if (requestSubmitted) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
            <div className="text-6xl mb-4">
              <svg className="w-16 h-16 mx-auto text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Request Submitted!</h1>
            <p className="text-gray-600 mb-6">
              {data.owner.name} has been notified of your request. You'll receive an email if they grant you access.
            </p>
            <button
              onClick={() => navigate('/')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
          <div className="text-center mb-6">
            <svg className="w-16 h-16 mx-auto text-amber-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">This link has expired</h1>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-gray-700 text-center">
              Request access from <strong>{data.owner.name}</strong>
            </p>
            <p className="text-gray-500 text-sm text-center mt-2">
              You'll need a Kizu account to get permanent access to this photo.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleRequestAccess} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Your Name
              </label>
              <input
                type="text"
                id="name"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="John Smith"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Your Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="email"
                required
                value={requesterEmail}
                onChange={(e) => setRequesterEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="john@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !requesterEmail}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Submitting...
                </>
              ) : (
                'Request Access'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (state === 'expired_not_in_album' && data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-500 to-gray-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
          <div className="text-center mb-6">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">This link has expired</h1>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-gray-700 mb-4">
              To get access to this photo, contact <strong>{data.owner.name}</strong> and ask them to:
            </p>
            <ol className="list-decimal list-inside text-gray-600 space-y-2">
              <li>Add this photo to an album</li>
              <li>Share the album with a circle that includes you</li>
            </ol>
            <p className="text-gray-500 text-sm mt-4">
              You'll also need a Kizu account.
            </p>
          </div>

          <a
            href="https://kizu.online"
            className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
          >
            Create Kizu Account
          </a>
        </div>
      </div>
    );
  }

  return null;
};
