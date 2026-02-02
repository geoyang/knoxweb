import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface AlbumAsset {
  id: string;
  media_type: string;
  width: number;
  height: number;
  created_at: string;
}

interface AlbumData {
  id: string;
  title: string;
  description: string | null;
  date_created: string;
  assets: AlbumAsset[];
}

interface ViewResponse {
  valid: boolean;
  expired: boolean;
  album: AlbumData;
  owner: { name: string; avatar_url: string | null };
  error?: string;
}

type ViewState = 'loading' | 'valid' | 'expired' | 'error';

export const SharedAlbumViewer: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<ViewState>('loading');
  const [data, setData] = useState<ViewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AlbumAsset | null>(null);
  const [accessEmail, setAccessEmail] = useState('');
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadAlbum();
    } else {
      setError('No share token provided');
      setState('error');
    }
  }, [token]);

  const loadAlbum = async () => {
    try {
      setState('loading');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/album-share-api?action=view&token=${token}`,
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
        setError(result.error || 'Failed to load shared album');
        setState('error');
        return;
      }

      setData(result);

      if (result.valid) {
        setState('valid');
      } else if (result.expired) {
        setState('expired');
      } else {
        setError('Invalid token');
        setState('error');
      }
    } catch (err) {
      console.error('Error loading shared album:', err);
      setError('Failed to load shared album');
      setState('error');
    }
  };

  const getServeUrl = (assetId: string, type: 'thumbnail' | 'original') => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/functions/v1/album-share-api?action=serve&token=${token}&asset_id=${assetId}&type=${type}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleCheckAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessEmail || !token) return;

    setCheckingAccess(true);
    setAccessError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/album-share-api?action=check-access`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ token, email: accessEmail }),
        }
      );

      const result = await response.json();

      if (result.has_access && result.redirect_url) {
        window.location.href = result.redirect_url;
      } else {
        setAccessError('No account found with access to this album. You can still view it here.');
      }
    } catch {
      setAccessError('Something went wrong. Please try again.');
    } finally {
      setCheckingAccess(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Loading album...</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Unable to Load</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button onClick={() => navigate('/')} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (state === 'expired' && data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <svg className="w-16 h-16 mx-auto text-amber-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">This link has expired</h1>
          <p className="text-gray-600 mt-2 mb-4">
            The album "<strong>{data.album.title}</strong>" was shared by {data.owner.name}, but the link is no longer valid.
          </p>
          <p className="text-gray-500 text-sm mb-6">Ask {data.owner.name} to share a new link.</p>
          <a href="https://kizu.online" className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center">
            Learn about Kizu
          </a>
        </div>
      </div>
    );
  }

  if (state === 'valid' && data) {
    const { album, owner } = data;

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col">
        {/* Header */}
        <header className="bg-black/30 backdrop-blur-sm p-4 flex-shrink-0">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              {owner.avatar_url ? (
                <img src={owner.avatar_url} alt={owner.name} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                  {owner.name?.charAt(0)?.toUpperCase() || 'K'}
                </div>
              )}
              <div>
                <p className="text-white font-medium">{owner.name}</p>
                <p className="text-white/60 text-sm">{formatDate(album.date_created)}</p>
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

        {/* Album Title */}
        <div className="max-w-6xl mx-auto w-full px-4 pt-6 pb-2">
          <h1 className="text-white text-2xl font-bold">{album.title}</h1>
          {album.description && (
            <p className="text-white/70 mt-1">{album.description}</p>
          )}
          <p className="text-white/50 text-sm mt-1">{album.assets.length} photo{album.assets.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Kizu Account Access */}
        <div className="max-w-6xl mx-auto w-full px-4 pt-2 pb-0">
          <form onSubmit={handleCheckAccess} className="bg-white/5 backdrop-blur-sm rounded-xl p-4 flex flex-col sm:flex-row items-center gap-3">
            <p className="text-white/70 text-sm whitespace-nowrap">Have a Kizu account?</p>
            <input
              type="email"
              value={accessEmail}
              onChange={(e) => { setAccessEmail(e.target.value); setAccessError(null); }}
              placeholder="Enter your email"
              className="flex-1 w-full sm:w-auto bg-white/10 text-white placeholder-white/40 rounded-lg px-3 py-2 text-sm border border-white/10 focus:border-white/30 focus:outline-none"
            />
            <button
              type="submit"
              disabled={checkingAccess || !accessEmail}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {checkingAccess ? 'Checking...' : 'Get Full Access'}
            </button>
          </form>
          {accessError && (
            <p className="text-white/50 text-xs mt-2 text-center">{accessError}</p>
          )}
        </div>

        {/* Photo Grid */}
        <div className="max-w-6xl mx-auto w-full px-4 py-4 flex-1">
          {album.assets.length === 0 ? (
            <div className="bg-white/5 rounded-xl p-8 text-center">
              <p className="text-white/60">This album is empty.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {album.assets.map((asset) => (
                <div
                  key={asset.id}
                  className="relative aspect-square cursor-pointer group overflow-hidden rounded-lg bg-white/5"
                  onClick={() => setSelectedAsset(asset)}
                >
                  <img
                    src={getServeUrl(asset.id, 'thumbnail')}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                    loading="lazy"
                  />
                  {asset.media_type?.startsWith('video') && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-black/50 rounded-full p-2">
                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="bg-black/30 backdrop-blur-sm p-4 text-center flex-shrink-0">
          <p className="text-white/60 text-sm">Shared with Kizu</p>
        </footer>

        {/* Fullscreen Modal */}
        {selectedAsset && (
          <div
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
            onClick={() => setSelectedAsset(null)}
          >
            <button
              onClick={() => setSelectedAsset(null)}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors z-10"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div onClick={(e) => e.stopPropagation()} className="max-w-[95vw] max-h-[95vh]">
              {selectedAsset.media_type?.startsWith('video') ? (
                <video
                  src={getServeUrl(selectedAsset.id, 'original')}
                  controls
                  autoPlay
                  className="max-w-full max-h-[95vh] rounded-lg"
                />
              ) : (
                <img
                  src={getServeUrl(selectedAsset.id, 'original')}
                  alt=""
                  className="max-w-full max-h-[95vh] rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};
