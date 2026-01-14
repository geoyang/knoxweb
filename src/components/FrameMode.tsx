import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface FrameAsset {
  id: string;
  web_uri: string;
  thumbnail_uri?: string;
  media_type: 'photo' | 'video';
  created_at?: string;
  location_name?: string;
}

interface FrameInfo {
  deviceId: string;
  deviceName: string;
  circleName: string;
  circleId: string;
  curatedAlbums: string[];
}

interface Circle {
  id: string;
  name: string;
  album_count?: number;
}

interface FrameSettings {
  slideshow_interval: number;
  transition: 'fade' | 'ken_burns' | 'none';
  display_order: 'random' | 'by_album' | 'by_album_random' | 'date_newest' | 'date_oldest';
  show_date: boolean;
  show_location: boolean;
}

type Step = 'loading' | 'authenticating' | 'select_circle' | 'ready' | 'error';

const DEFAULT_SETTINGS: FrameSettings = {
  slideshow_interval: 30,
  transition: 'fade',
  display_order: 'random',
  show_date: true,
  show_location: true,
};

const DURATION_STEPS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300];

const DISPLAY_ORDER_OPTIONS = [
  { value: 'random', label: 'Randomize All', icon: '🎲' },
  { value: 'by_album', label: 'By Album', icon: '📁' },
  { value: 'by_album_random', label: 'By Album Random', icon: '📂' },
  { value: 'date_newest', label: 'Newest First', icon: '⬇️' },
  { value: 'date_oldest', label: 'Oldest First', icon: '⬆️' },
] as const;

const formatDuration = (seconds: number): string => {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs === 0 ? `${mins} min` : `${mins}m ${secs}s`;
  }
  return `${seconds}s`;
};

export const FrameMode: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, userProfile, loading: authLoading } = useAuth();
  const token = searchParams.get('token');

  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<string | null>(null);
  const [frameInfo, setFrameInfo] = useState<FrameInfo | null>(null);
  const [assets, setAssets] = useState<FrameAsset[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [settings, setSettings] = useState<FrameSettings>(DEFAULT_SETTINGS);
  const [isPaused, setIsPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [useAuthSession, setUseAuthSession] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const storedSettings = localStorage.getItem('kizu_frame_settings');
    if (storedSettings) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(storedSettings) });
      } catch (e) {
        console.error('Failed to parse stored settings:', e);
      }
    }
  }, []);

  // Save settings to localStorage when changed
  const updateSettings = (newSettings: Partial<FrameSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem('kizu_frame_settings', JSON.stringify(updated));
      return updated;
    });
  };

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const slideshowTimerRef = useRef<NodeJS.Timeout | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Initialize frame mode - check auth session or token
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;

    // If we have a token in URL, use the device token flow
    if (token) {
      exchangeToken();
      return;
    }

    // Check for stored device token first
    const storedToken = localStorage.getItem('kizu_frame_device_token');
    if (storedToken) {
      setDeviceToken(storedToken);
      setStep('authenticating');
      return;
    }

    // If user is logged in via web app, use their session directly
    if (session?.access_token) {
      setUseAuthSession(true);
      setAccessToken(session.access_token);
      loadUserCircles();
      return;
    }

    // No auth method available
    setError('Please log in or set up your frame first.');
    setStep('error');
  }, [token, authLoading, session]);

  // Load user's circles when using auth session (via edge function)
  const loadUserCircles = async () => {
    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/picture-frame-content-api?action=list_circles`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error('Error loading circles:', data.error);
        setError('Failed to load your circles');
        setStep('error');
        return;
      }

      const circleList: Circle[] = data.circles || [];

      if (circleList.length === 0) {
        setError('You are not a member of any circles. Join a circle first.');
        setStep('error');
        return;
      }

      // If only one circle, use it directly
      if (circleList.length === 1) {
        await selectCircle(circleList[0]);
        return;
      }

      setCircles(circleList);
      setStep('select_circle');
    } catch (err) {
      console.error('Load circles error:', err);
      setError('Failed to load circles');
      setStep('error');
    }
  };

  // Select a circle and load its albums (via edge function)
  const selectCircle = async (circle: Circle) => {
    try {
      setStep('authenticating');

      // Load albums for this circle
      const response = await fetch(
        `${supabaseUrl}/functions/v1/picture-frame-content-api?action=list_albums&circle_id=${circle.id}`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error('Error loading albums:', data.error);
        setError('Failed to load albums');
        setStep('error');
        return;
      }

      const albumIds = (data.albums || []).map((a: any) => a.id);

      setFrameInfo({
        deviceId: 'web-browser',
        deviceName: 'Web Browser',
        circleName: circle.name,
        circleId: circle.id,
        curatedAlbums: albumIds,
      });

      // Load assets using the content API
      if (session?.access_token && albumIds.length > 0) {
        await loadAssetsWithAuth(session.access_token, albumIds);
      } else {
        setAssets([]);
        setStep('ready');
      }
    } catch (err) {
      console.error('Select circle error:', err);
      setError('Failed to select circle');
      setStep('error');
    }
  };

  // Load assets using edge function
  const loadAssetsWithAuth = async (token: string, albumIds: string[]) => {
    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/picture-frame-content-api?album_ids=${albumIds.join(',')}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error('Error loading assets:', data.error);
        setError('Failed to load photos');
        setStep('error');
        return;
      }

      const allAssets: FrameAsset[] = (data.assets || []).map((asset: any) => ({
        id: asset.id,
        web_uri: asset.web_uri || asset.path,
        thumbnail_uri: asset.thumbnail_uri,
        media_type: asset.media_type || 'photo',
        created_at: asset.created_at,
        location_name: asset.location_name,
      }));

      // Shuffle for random display
      const shuffled = [...allAssets].sort(() => Math.random() - 0.5);
      setAssets(shuffled);
      setStep('ready');
    } catch (err) {
      console.error('Load assets error:', err);
      setError('Failed to load photos');
      setStep('error');
    }
  };

  // Authenticate with device token
  useEffect(() => {
    if (deviceToken && step === 'authenticating') {
      authenticateFrame();
    }
  }, [deviceToken, step]);

  // Auto-hide controls (but not when settings is open)
  useEffect(() => {
    if (showControls && !showSettings) {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 5000);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [showControls, showSettings]);

  // Slideshow timer
  useEffect(() => {
    if (slideshowTimerRef.current) {
      clearTimeout(slideshowTimerRef.current);
      slideshowTimerRef.current = null;
    }

    if (isPaused || assets.length === 0 || step !== 'ready') {
      return;
    }

    const interval = (settings.slideshow_interval || 30) * 1000;
    slideshowTimerRef.current = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % assets.length);
    }, interval);

    return () => {
      if (slideshowTimerRef.current) {
        clearTimeout(slideshowTimerRef.current);
      }
    };
  }, [currentIndex, isPaused, assets.length, settings.slideshow_interval, step]);

  const exchangeToken = async () => {
    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/picture-frame-auth?action=exchange-app-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ app_login_token: token }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to authenticate frame');
        setStep('error');
        return;
      }

      // Store device token for future sessions
      localStorage.setItem('kizu_frame_device_token', data.device_token);
      localStorage.setItem('kizu_frame_info', JSON.stringify({
        deviceId: data.device.id,
        deviceName: data.device.name,
        circleName: data.circle.name,
        circleId: data.circle.id,
        curatedAlbums: data.curated_albums || [],
      }));

      setDeviceToken(data.device_token);
      setAccessToken(data.access_token);
      setFrameInfo({
        deviceId: data.device.id,
        deviceName: data.device.name,
        circleName: data.circle.name,
        circleId: data.circle.id,
        curatedAlbums: data.curated_albums || [],
      });

      // Remove token from URL for cleaner display
      navigate('/frame', { replace: true });

      setStep('authenticating');
    } catch (err) {
      console.error('Exchange token error:', err);
      setError('Failed to connect to server');
      setStep('error');
    }
  };

  const authenticateFrame = async () => {
    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/picture-frame-auth?action=authenticate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ device_token: deviceToken }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Clear stored token if invalid
        localStorage.removeItem('kizu_frame_device_token');
        localStorage.removeItem('kizu_frame_info');
        setError(data.error || 'Frame authentication failed');
        setStep('error');
        return;
      }

      // Check if we got a valid access token (nested in session object)
      const token = data.session?.access_token || data.access_token;
      if (!token) {
        console.error('No access token received from authentication');
        setError('Authentication failed - please try setting up the frame again');
        setStep('error');
        return;
      }

      setAccessToken(token);
      setFrameInfo({
        deviceId: data.device.id,
        deviceName: data.device.name,
        circleName: data.circle.name,
        circleId: data.circle.id,
        curatedAlbums: data.curated_albums || [],
      });

      // Load frame info from storage if not set
      if (!frameInfo) {
        const storedInfo = localStorage.getItem('kizu_frame_info');
        if (storedInfo) {
          setFrameInfo(JSON.parse(storedInfo));
        }
      }

      // Load assets
      await loadAssets(token, data.curated_albums || []);
    } catch (err) {
      console.error('Authenticate error:', err);
      setError('Failed to authenticate frame');
      setStep('error');
    }
  };

  const loadAssets = async (token: string, albumIds: string[]) => {
    try {
      // Use picture-frame-content-api to fetch assets (same as mobile app)
      const params = new URLSearchParams();
      if (albumIds.length > 0) {
        params.set('album_ids', albumIds.join(','));
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/picture-frame-content-api?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to load assets:', errorData);
        setError('Failed to load photos');
        setStep('error');
        return;
      }

      const data = await response.json();

      if (!data.success || !data.assets) {
        console.error('Invalid response from content API:', data);
        setError('Failed to load photos');
        setStep('error');
        return;
      }

      // Map assets to our format
      const allAssets: FrameAsset[] = data.assets.map((asset: any) => ({
        id: asset.id,
        web_uri: asset.web_uri || asset.path,
        thumbnail_uri: asset.thumbnail_uri,
        media_type: asset.media_type || 'photo',
        created_at: asset.created_at,
        location_name: asset.location_name,
      }));

      // Shuffle for random display
      const shuffled = [...allAssets].sort(() => Math.random() - 0.5);
      setAssets(shuffled);
      setStep('ready');
    } catch (err) {
      console.error('Load assets error:', err);
      setError('Failed to load photos');
      setStep('error');
    }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Close settings on Escape if open
    if (e.key === 'Escape' && showSettings) {
      setShowSettings(false);
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
      case ' ':
        if (!showSettings) {
          setCurrentIndex((prev) => (prev + 1) % assets.length);
        }
        break;
      case 'ArrowLeft':
        if (!showSettings) {
          setCurrentIndex((prev) => (prev - 1 + assets.length) % assets.length);
        }
        break;
      case 'p':
        if (!showSettings) {
          setIsPaused((prev) => !prev);
        }
        break;
      case 's':
        setShowSettings((prev) => !prev);
        break;
      case 'Escape':
        handleExit();
        break;
    }
    setShowControls(true);
  }, [assets.length, showSettings]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleExit = () => {
    // Only clear device tokens if not using auth session
    if (!useAuthSession) {
      localStorage.removeItem('kizu_frame_device_token');
      localStorage.removeItem('kizu_frame_info');
    }
    navigate('/admin');
  };

  const currentAsset = assets[currentIndex];

  // Loading state
  if (step === 'loading' || step === 'authenticating') {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl">{step === 'loading' ? 'Initializing...' : 'Loading photos...'}</p>
        </div>
      </div>
    );
  }

  // Circle selection state
  if (step === 'select_circle') {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="bg-zinc-900 rounded-2xl max-w-md w-full mx-4 p-6">
          <div className="text-center mb-6">
            <span className="text-5xl mb-4 block">🖼️</span>
            <h1 className="text-2xl font-bold text-white mb-2">Picture Frame Mode</h1>
            <p className="text-zinc-400">Select a circle to display photos from</p>
          </div>

          <div className="space-y-3">
            {circles.map((circle) => (
              <button
                key={circle.id}
                onClick={() => selectCircle(circle)}
                className="w-full flex items-center gap-4 p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors text-left"
              >
                <span className="text-3xl">👨‍👩‍👧‍👦</span>
                <div className="flex-1">
                  <p className="text-white font-semibold">{circle.name}</p>
                  <p className="text-zinc-400 text-sm">View all photos</p>
                </div>
                <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>

          <button
            onClick={() => navigate(-1)}
            className="w-full mt-6 py-3 text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (step === 'error') {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md text-center text-white">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-4">Frame Error</h1>
          <p className="text-white/70 mb-6">{error}</p>
          <button
            onClick={() => navigate(session ? '/admin' : '/')}
            className="bg-white/20 hover:bg-white/30 px-6 py-3 rounded-lg transition-colors"
          >
            {session ? 'Go Back' : 'Go Home'}
          </button>
        </div>
      </div>
    );
  }

  // No assets state
  if (assets.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-8xl mb-4 opacity-30">📷</div>
          <h1 className="text-3xl font-bold mb-2">No Photos Yet</h1>
          <p className="text-white/60 mb-4">
            Photos shared with this frame will appear here.
          </p>
          <p className="text-white/40 text-sm">
            Connected to {frameInfo?.circleName || 'your family'}
          </p>
        </div>
      </div>
    );
  }

  // Frame display
  return (
    <div
      className="fixed inset-0 bg-black cursor-none"
      onClick={() => setShowControls(true)}
      onMouseMove={() => setShowControls(true)}
    >
      {/* Ken Burns CSS Animation */}
      <style>{`
        @keyframes kenburns-1 {
          0% { transform: scale(1.0) translate(0%, 0%); }
          100% { transform: scale(1.35) translate(-5%, -3%); }
        }
        @keyframes kenburns-2 {
          0% { transform: scale(1.35) translate(5%, 0%); }
          100% { transform: scale(1.0) translate(-3%, 5%); }
        }
        @keyframes kenburns-3 {
          0% { transform: scale(1.0) translate(-3%, 4%); }
          100% { transform: scale(1.3) translate(5%, -5%); }
        }
        @keyframes kenburns-4 {
          0% { transform: scale(1.25) translate(0%, -4%); }
          100% { transform: scale(1.0) translate(-5%, 3%); }
        }
        .ken-burns-effect {
          animation-timing-function: ease-in-out;
          animation-fill-mode: forwards;
        }
      `}</style>

      {/* Current photo */}
      <div
        className={`absolute inset-0 flex items-center justify-center overflow-hidden ${
          settings.transition === 'fade' || settings.transition === 'ken_burns'
            ? 'transition-opacity duration-1000'
            : ''
        }`}
      >
        {currentAsset?.media_type === 'video' ? (
          <video
            key={currentAsset.id}
            src={currentAsset.web_uri}
            className="max-w-full max-h-full object-contain"
            autoPlay
            muted
            onEnded={() => setCurrentIndex((prev) => (prev + 1) % assets.length)}
          />
        ) : (
          <img
            key={currentAsset?.id}
            src={currentAsset?.web_uri}
            alt=""
            className={`max-w-full max-h-full object-contain ${
              settings.transition === 'ken_burns' ? 'ken-burns-effect' : ''
            }`}
            style={settings.transition === 'ken_burns' ? {
              animationName: `kenburns-${(currentIndex % 4) + 1}`,
              animationDuration: `${settings.slideshow_interval}s`,
            } : undefined}
          />
        )}
      </div>

      {/* Photo info overlay */}
      {showControls && currentAsset && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-8 pt-24">
          {settings.show_date && currentAsset.created_at && (
            <p className="text-white/80 text-lg">
              {new Date(currentAsset.created_at).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
          {settings.show_location && currentAsset.location_name && (
            <p className="text-white/60">{currentAsset.location_name}</p>
          )}
        </div>
      )}

      {/* Controls overlay */}
      {showControls && (
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-6">
          <div className="flex justify-between items-center">
            <div className="text-white">
              <h1 className="text-xl font-semibold">{frameInfo?.circleName}</h1>
              <p className="text-white/60 text-sm">
                {currentIndex + 1} / {assets.length}
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setIsPaused((prev) => !prev)}
                className="bg-white/20 hover:bg-white/30 p-3 rounded-full transition-colors"
                title={isPaused ? 'Play' : 'Pause'}
              >
                {isPaused ? (
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="bg-white/20 hover:bg-white/30 p-3 rounded-full transition-colors"
                title="Settings"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button
                onClick={handleExit}
                className="bg-white/20 hover:bg-white/30 p-3 rounded-full transition-colors"
                title="Exit Frame Mode"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
        <div
          className="h-full bg-white/60 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / assets.length) * 100}%` }}
        />
      </div>

      {/* Paused indicator */}
      {isPaused && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="bg-black/60 rounded-full p-6">
            <svg className="w-12 h-12 text-white/80" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      {showControls && !showSettings && (
        <div className="absolute bottom-8 right-8 text-white/40 text-xs">
          <p>← → Navigate • Space/P Pause • S Settings • Esc Exit</p>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}
        >
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full mx-4 max-h-[85vh] overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center p-5 border-b border-zinc-700">
              <h2 className="text-2xl font-semibold text-white">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[calc(85vh-80px)]">
              {/* Frame Info */}
              {frameInfo && (
                <div className="flex items-center gap-3 bg-zinc-800 p-4 rounded-xl mb-6">
                  <span className="text-2xl">📷</span>
                  <div className="flex-1">
                    <p className="text-white font-semibold">{frameInfo.circleName}</p>
                    <p className="text-zinc-400 text-sm">{frameInfo.curatedAlbums.length} albums</p>
                  </div>
                </div>
              )}

              {/* Slideshow Section */}
              <div className="mb-6">
                <h3 className="text-zinc-400 text-sm font-semibold uppercase tracking-wider mb-3">Slideshow</h3>

                {/* Duration */}
                <div className="flex justify-between items-center mb-4">
                  <span className="text-white">Duration</span>
                  <div className="flex items-center bg-zinc-800 rounded-lg">
                    <button
                      onClick={() => {
                        const idx = DURATION_STEPS.indexOf(settings.slideshow_interval);
                        if (idx > 0) updateSettings({ slideshow_interval: DURATION_STEPS[idx - 1] });
                      }}
                      className="w-11 h-11 flex items-center justify-center hover:bg-white/10 rounded-l-lg transition-colors disabled:opacity-30"
                      disabled={settings.slideshow_interval <= DURATION_STEPS[0]}
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <span className="w-16 text-center text-blue-400 font-semibold">
                      {formatDuration(settings.slideshow_interval)}
                    </span>
                    <button
                      onClick={() => {
                        const idx = DURATION_STEPS.indexOf(settings.slideshow_interval);
                        if (idx < DURATION_STEPS.length - 1) updateSettings({ slideshow_interval: DURATION_STEPS[idx + 1] });
                      }}
                      className="w-11 h-11 flex items-center justify-center hover:bg-white/10 rounded-r-lg transition-colors disabled:opacity-30"
                      disabled={settings.slideshow_interval >= DURATION_STEPS[DURATION_STEPS.length - 1]}
                    >
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Transition */}
                <div className="mb-4">
                  <span className="text-white block mb-2">Transition</span>
                  <div className="flex gap-3">
                    {([
                      { value: 'fade', label: 'Fade' },
                      { value: 'ken_burns', label: 'Ken Burns' },
                      { value: 'none', label: 'None' },
                    ] as const).map((t) => (
                      <button
                        key={t.value}
                        onClick={() => updateSettings({ transition: t.value })}
                        className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                          settings.transition === t.value
                            ? 'bg-blue-500 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Photo Order Section */}
              <div className="mb-6">
                <h3 className="text-zinc-400 text-sm font-semibold uppercase tracking-wider mb-3">Photo Order</h3>
                <div className="bg-zinc-800 rounded-xl overflow-hidden">
                  {DISPLAY_ORDER_OPTIONS.map((option, idx) => (
                    <button
                      key={option.value}
                      onClick={() => updateSettings({ display_order: option.value })}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors ${
                        settings.display_order === option.value
                          ? 'bg-blue-500 text-white'
                          : 'text-zinc-300 hover:bg-zinc-700'
                      } ${idx !== DISPLAY_ORDER_OPTIONS.length - 1 ? 'border-b border-zinc-700' : ''}`}
                    >
                      <span className="w-7">{option.icon}</span>
                      <span className="flex-1 text-left">{option.label}</span>
                      {settings.display_order === option.value && (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Display Section */}
              <div className="mb-6">
                <h3 className="text-zinc-400 text-sm font-semibold uppercase tracking-wider mb-3">Display</h3>

                {/* Show Date Toggle */}
                <div className="flex justify-between items-center py-3 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-400">📅</span>
                    <span className="text-white">Show Date</span>
                  </div>
                  <button
                    onClick={() => updateSettings({ show_date: !settings.show_date })}
                    className={`w-12 h-7 rounded-full transition-colors ${
                      settings.show_date ? 'bg-blue-500' : 'bg-zinc-600'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                        settings.show_date ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Show Location Toggle */}
                <div className="flex justify-between items-center py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-400">📍</span>
                    <span className="text-white">Show Location</span>
                  </div>
                  <button
                    onClick={() => updateSettings({ show_location: !settings.show_location })}
                    className={`w-12 h-7 rounded-full transition-colors ${
                      settings.show_location ? 'bg-blue-500' : 'bg-zinc-600'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                        settings.show_location ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Done Button */}
              <button
                onClick={() => setShowSettings(false)}
                className="w-full flex items-center justify-center gap-2 py-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors mb-4"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Done
              </button>

              {/* Exit Frame Mode */}
              <button
                onClick={handleExit}
                className="w-full flex items-center justify-center gap-3 py-4 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-xl transition-colors"
              >
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="text-red-400 font-semibold">Exit Picture Frame Mode</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
