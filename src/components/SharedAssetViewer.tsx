import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface AssetData {
  id: string;
  media_type: string;
  width: number;
  height: number;
  created_at: string;
}

interface Memory {
  id: string;
  content_text: string | null;
  memory_type: 'text' | 'video' | 'image';
  content_url?: string;
  thumbnail_url?: string;
  duration?: number;
  user_id: string;
  created_at: string;
  parent_id: string | null;
  user: {
    full_name: string;
    avatar_url?: string;
  };
}

interface Reaction {
  emoji: string;
  count: number;
}

interface ViewResponse {
  valid: boolean;
  expired: boolean;
  in_album: boolean;
  asset: AssetData;
  owner: { name: string };
  token_id: string;
  memories?: Memory[];
  reactions?: Reaction[];
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  // Zoomable image component
  const ZoomableImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [lastTap, setLastTap] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const initialDistance = useRef<number>(0);
    const initialScale = useRef<number>(1);

    const handleDoubleClick = useCallback(() => {
      if (scale > 1) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } else {
        setScale(2.5);
      }
    }, [scale]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialDistance.current = distance;
        initialScale.current = scale;
      } else if (e.touches.length === 1) {
        const now = Date.now();
        if (now - lastTap < 300) {
          handleDoubleClick();
        }
        setLastTap(now);
        if (scale > 1) {
          setIsDragging(true);
          setDragStart({ x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y });
        }
      }
    }, [scale, lastTap, position, handleDoubleClick]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const newScale = Math.min(Math.max(initialScale.current * (distance / initialDistance.current), 1), 5);
        setScale(newScale);
        if (newScale === 1) setPosition({ x: 0, y: 0 });
      } else if (e.touches.length === 1 && isDragging && scale > 1) {
        const newX = e.touches[0].clientX - dragStart.x;
        const newY = e.touches[0].clientY - dragStart.y;
        setPosition({ x: newX, y: newY });
      }
    }, [isDragging, scale, dragStart]);

    const handleTouchEnd = useCallback(() => {
      setIsDragging(false);
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(scale * delta, 1), 5);
      setScale(newScale);
      if (newScale === 1) setPosition({ x: 0, y: 0 });
    }, [scale]);

    const toggleFullscreen = useCallback(() => {
      setIsFullscreen(!isFullscreen);
      if (!isFullscreen) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
    }, [isFullscreen]);

    return (
      <>
        <div
          ref={containerRef}
          className={`relative rounded-lg shadow-2xl cursor-zoom-in ${isFullscreen ? 'fixed inset-0 z-50 bg-black rounded-none flex items-center justify-center' : ''}`}
          onDoubleClick={handleDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          style={{ touchAction: scale > 1 ? 'none' : 'auto' }}
        >
          <img
            src={src}
            alt={alt}
            className="select-none max-w-full h-auto"
            style={{
              maxHeight: isFullscreen ? '100vh' : undefined,
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            }}
            draggable={false}
          />
          {isFullscreen && (
            <button
              onClick={toggleFullscreen}
              className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {!isFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        )}
      </>
    );
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

  if (state === 'valid' && data) {
    const isVideo = data.asset.media_type?.startsWith('video');
    const memories = data.memories || [];
    const reactions = data.reactions || [];
    const topLevelMemories = memories.filter(m => !m.parent_id);

    return (
      <div className="h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col overflow-hidden">
        {/* Header - Fixed */}
        <header className="bg-black/30 backdrop-blur-sm p-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                {data.owner.name?.charAt(0)?.toUpperCase() || 'K'}
              </div>
              <div>
                <p className="text-white font-medium">{data.owner.name}</p>
                <p className="text-white/60 text-sm">{formatDate(data.asset.created_at)}</p>
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

        {/* Media Section */}
        <div className="mx-auto px-4 pt-4 flex justify-center">
          <div className="relative group">
            {isVideo ? (
              <video src={`${imageUrl}&type=original`} controls className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain bg-black" poster={imageUrl || undefined} />
            ) : (
              <img
                src={`${imageUrl}&type=original`}
                alt="Shared photo"
                className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
                style={{ width: 'auto', height: 'auto' }}
              />
            )}
          </div>

          {/* Reactions - Below media, fixed */}
          {reactions.length > 0 && (
            <div className="flex gap-2 mt-4 flex-wrap">
              {reactions.map((r, i) => (
                <div key={i} className="bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5">
                  <span className="text-xl">{r.emoji}</span>
                  <span className="text-white/80 text-sm font-medium">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Memories Section - Scrollable */}
        {topLevelMemories.length > 0 ? (
          <div className="flex-1 min-h-0 max-w-4xl mx-auto w-full px-4 py-4">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 h-full flex flex-col">
              <h3 className="text-white/80 font-semibold mb-4 flex items-center gap-2 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Memories ({topLevelMemories.length})
              </h3>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {topLevelMemories.map((memory) => {
                  const replies = memories.filter(m => m.parent_id === memory.id);
                  return (
                    <div key={memory.id} className="space-y-2">
                      {/* Main memory */}
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {memory.user.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-white font-medium text-sm">{memory.user.full_name}</span>
                            <span className="text-white/40 text-xs">{formatTime(memory.created_at)}</span>
                          </div>
                          {memory.memory_type === 'video' && memory.content_url ? (
                            <video src={memory.content_url} controls className="mt-1 w-full max-w-xs rounded" poster={memory.thumbnail_url} />
                          ) : memory.memory_type === 'image' && memory.content_url ? (
                            <img src={memory.content_url} alt="Memory" className="mt-1 max-w-xs rounded" />
                          ) : (
                            <p className="text-white/80 text-sm mt-0.5">{memory.content_text}</p>
                          )}
                        </div>
                      </div>
                      {/* Replies */}
                      {replies.length > 0 && (
                        <div className="ml-11 space-y-2 border-l-2 border-white/10 pl-3">
                          {replies.map((reply) => (
                            <div key={reply.id} className="flex gap-2">
                              <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {reply.user.full_name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-white font-medium text-xs">{reply.user.full_name}</span>
                                  <span className="text-white/40 text-xs">{formatTime(reply.created_at)}</span>
                                </div>
                                {reply.memory_type === 'video' && reply.content_url ? (
                                  <video src={reply.content_url} controls className="mt-1 w-full max-w-xs rounded" poster={reply.thumbnail_url} />
                                ) : reply.memory_type === 'image' && reply.content_url ? (
                                  <img src={reply.content_url} alt="Reply" className="mt-1 max-w-xs rounded" />
                                ) : (
                                  <p className="text-white/70 text-sm">{reply.content_text}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Footer - Fixed */}
        <footer className="bg-black/30 backdrop-blur-sm p-4 text-center flex-shrink-0">
          <p className="text-white/60 text-sm">Shared with Kizu - Private by design</p>
        </footer>
      </div>
    );
  }

  if (state === 'expired_in_album' && data) {
    if (requestSubmitted) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
            <svg className="w-16 h-16 mx-auto text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Request Submitted!</h1>
            <p className="text-gray-600 mb-6">{data.owner.name} has been notified. You'll receive an email if they grant you access.</p>
            <button onClick={() => navigate('/')} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
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
            <p className="text-gray-700 text-center">Request access from <strong>{data.owner.name}</strong></p>
            <p className="text-gray-500 text-sm text-center mt-2">You'll need a Kizu account to get permanent access.</p>
          </div>
          {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>}
          <form onSubmit={handleRequestAccess} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input type="text" id="name" value={requesterName} onChange={(e) => setRequesterName(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="John Smith" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Your Email <span className="text-red-500">*</span></label>
              <input type="email" id="email" required value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="john@example.com" />
            </div>
            <button type="submit" disabled={submitting || !requesterEmail} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {submitting ? (
                <><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Submitting...</>
              ) : 'Request Access'}
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
            <p className="text-gray-700 mb-4">To get access, contact <strong>{data.owner.name}</strong> and ask them to:</p>
            <ol className="list-decimal list-inside text-gray-600 space-y-2">
              <li>Add this photo to an album</li>
              <li>Share the album with a circle that includes you</li>
            </ol>
            <p className="text-gray-500 text-sm mt-4">You'll also need a Kizu account.</p>
          </div>
          <a href="https://kizu.online" className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center">
            Create Kizu Account
          </a>
        </div>
      </div>
    );
  }

  return null;
};
