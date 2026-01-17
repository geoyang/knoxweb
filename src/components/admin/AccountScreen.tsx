import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { adminApi } from '../../services/adminApi';

interface UserStats {
  albums: number;
  photos: number;
  circles: number;
  shared: number;
}

interface AccountScreenProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountScreen: React.FC<AccountScreenProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user, userProfile, signOut, isSuperAdmin } = useAuth();
  const [showAvatarOptions, setShowAvatarOptions] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(userProfile?.avatar_url || null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | Blob | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [editedName, setEditedName] = useState(userProfile?.full_name || '');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stats, setStats] = useState<UserStats>({ albums: 0, photos: 0, circles: 0, shared: 0 });
  const [loadingStats, setLoadingStats] = useState(false);

  // Collapsible section states - default to collapsed
  const [showAccountInfo, setShowAccountInfo] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const [showAppInfo, setShowAppInfo] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      onClose();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const hasChanges = () => {
    const nameChanged = editedName !== (userProfile?.full_name || '');
    const avatarChanged = pendingAvatarFile !== null;
    return nameChanged || avatarChanged;
  };

  const handleSave = async () => {
    if (!user) return;
    if (!hasChanges()) return;

    setSaving(true);
    try {
      const updates: { full_name?: string; avatar_url?: string } = {};

      // Handle name change
      if (editedName !== (userProfile?.full_name || '')) {
        updates.full_name = editedName.trim();
      }

      // Handle avatar upload
      if (pendingAvatarFile) {
        const fileExt = pendingAvatarFile instanceof File ? pendingAvatarFile.name.split('.').pop() : 'jpg';
        const fileName = `${user.id}/avatar.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, pendingAvatarFile, { upsert: true, contentType: pendingAvatarFile.type || 'image/jpeg' });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);

        updates.avatar_url = urlData.publicUrl;
      }

      // Update profile
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', user.id);

        if (error) throw error;
      }

      // Force reload to update the context
      window.location.reload();
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Failed to save changes. Please try again.');
      setSaving(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setShowAvatarOptions(false);

    // Store the file for later upload
    setPendingAvatarFile(file);

    // Create a preview URL
    const previewUrl = URL.createObjectURL(file);
    setPendingAvatarPreview(previewUrl);
  };

  const startCamera = async () => {
    setShowAvatarOptions(false);
    setCameraError(null);
    setShowCamera(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Camera error:', error);
      setCameraError('Could not access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    setCameraError(null);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !user) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const size = Math.min(video.videoWidth, video.videoHeight);

    // Set canvas to square
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate crop to center square
    const offsetX = (video.videoWidth - size) / 2;
    const offsetY = (video.videoHeight - size) / 2;

    // Draw cropped square image
    ctx.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);

    // Convert to blob and store for later upload
    canvas.toBlob((blob) => {
      if (!blob) return;

      stopCamera();

      // Store the blob for later upload
      setPendingAvatarFile(blob);

      // Create a preview URL
      const previewUrl = URL.createObjectURL(blob);
      setPendingAvatarPreview(previewUrl);
    }, 'image/jpeg', 0.9);
  };

  // Sync avatar URL and name when userProfile changes
  useEffect(() => {
    if (userProfile?.avatar_url) {
      setAvatarUrl(userProfile.avatar_url);
    }
    if (userProfile?.full_name !== undefined) {
      setEditedName(userProfile.full_name || '');
    }
  }, [userProfile?.avatar_url, userProfile?.full_name]);

  // Cleanup camera on unmount or close
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Fetch user statistics when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchStats = async () => {
      setLoadingStats(true);
      try {
        const [albumsResult, imagesResult, circlesResult] = await Promise.all([
          adminApi.getAlbums(),
          adminApi.getImages(),
          adminApi.getCircles(),
        ]);

        const newStats: UserStats = {
          albums: 0,
          photos: 0,
          circles: 0,
          shared: 0,
        };

        if (albumsResult.success && albumsResult.data) {
          newStats.albums = albumsResult.data.count || albumsResult.data.albums?.length || 0;
          if (albumsResult.data.stats) {
            newStats.shared = albumsResult.data.stats.shared || 0;
          }
        }

        if (imagesResult.success && imagesResult.data) {
          newStats.photos = imagesResult.data.count || imagesResult.data.assets?.length || 0;
        }

        if (circlesResult.success && circlesResult.data) {
          newStats.circles = circlesResult.data.count || circlesResult.data.circles?.length || 0;
        }

        setStats(newStats);
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [isOpen]);

  if (!isOpen) return null;

  const displayName = userProfile?.full_name || user?.email || 'Unknown User';
  const createdAt = user?.created_at ? new Date(user.created_at) : null;
  const avatarInitial = userProfile?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Account Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Profile Section */}
          <div className="text-center mb-8">
            {/* Avatar with click to change */}
            <div className="relative inline-block">
              <button
                onClick={() => setShowAvatarOptions(!showAvatarOptions)}
                disabled={saving}
                className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 hover:ring-4 hover:ring-blue-200 transition-all cursor-pointer overflow-hidden relative"
              >
                {pendingAvatarPreview ? (
                  <img
                    src={pendingAvatarPreview}
                    alt="New Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                    onError={() => setAvatarUrl(null)}
                  />
                ) : (
                  <span className="text-3xl text-blue-600">{avatarInitial}</span>
                )}
                <div className="absolute inset-0 bg-black/0 hover:bg-black/20 flex items-center justify-center transition-colors">
                  <span className="text-white opacity-0 hover:opacity-100 text-xs font-medium">Change</span>
                </div>
                {pendingAvatarPreview && (
                  <div className="absolute -bottom-1 -right-1 bg-blue-600 rounded-full p-1">
                    <span className="text-white text-xs">●</span>
                  </div>
                )}
              </button>

              {/* Avatar options dropdown */}
              {showAvatarOptions && (
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-white rounded-lg shadow-xl border py-2 w-48 z-10">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <span>🖼️</span> Choose Photo
                  </button>
                  <button
                    onClick={startCamera}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <span>📷</span> Take Photo
                  </button>
                  {(avatarUrl || pendingAvatarPreview) && (
                    <button
                      onClick={() => {
                        setShowAvatarOptions(false);
                        if (pendingAvatarPreview) {
                          // Just clear the pending preview
                          setPendingAvatarFile(null);
                          setPendingAvatarPreview(null);
                        } else {
                          // Mark for removal on save
                          setAvatarUrl(null);
                          setPendingAvatarFile(null);
                        }
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <span>🗑️</span> {pendingAvatarPreview ? 'Cancel New Photo' : 'Remove Avatar'}
                    </button>
                  )}
                </div>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              {/* Hidden canvas for photo capture */}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {displayName}
            </h3>
            {userProfile?.full_name && (
              <p className="text-sm text-gray-500 mb-2">{user?.email}</p>
            )}
            {isSuperAdmin && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                Super Admin
              </span>
            )}
          </div>

          {/* Account Information */}
          <div className="space-y-6">
            <div>
              <button
                onClick={() => setShowAccountInfo(!showAccountInfo)}
                className="w-full flex items-center justify-between text-sm font-medium text-gray-700 mb-3 hover:text-gray-900"
              >
                <span>Account Information</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showAccountInfo ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showAccountInfo && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                    <span className="text-sm text-gray-600">Name</span>
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="px-2 py-1 border border-gray-300 rounded text-sm w-40 text-right text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Your name"
                    />
                  </div>
                  <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                    <span className="text-sm text-gray-600">Email</span>
                    <span className="text-sm font-medium text-gray-900">{user?.email}</span>
                  </div>
                  {createdAt && (
                    <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                      <span className="text-sm text-gray-600">Account Created</span>
                      <span className="text-sm text-gray-500">
                        {createdAt.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                    <span className="text-sm text-gray-600">Account Type</span>
                    <span className="text-sm font-medium text-gray-900">
                      {isSuperAdmin ? 'Super Admin' : 'User'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Kizu Statistics */}
            <div>
              <button
                onClick={() => setShowStats(!showStats)}
                className="w-full flex items-center justify-between text-sm font-medium text-gray-700 mb-3 hover:text-gray-900"
              >
                <span>Kizu Statistics</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showStats ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showStats && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center py-3 px-2 bg-blue-50 rounded-md">
                    <div className="text-lg font-semibold text-blue-600">
                      {loadingStats ? (
                        <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        stats.albums
                      )}
                    </div>
                    <div className="text-xs text-gray-600">Albums</div>
                  </div>
                  <div className="text-center py-3 px-2 bg-green-50 rounded-md">
                    <div className="text-lg font-semibold text-green-600">
                      {loadingStats ? (
                        <span className="inline-block w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        stats.photos
                      )}
                    </div>
                    <div className="text-xs text-gray-600">Photos</div>
                  </div>
                  <div className="text-center py-3 px-2 bg-purple-50 rounded-md">
                    <div className="text-lg font-semibold text-purple-600">
                      {loadingStats ? (
                        <span className="inline-block w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        stats.circles
                      )}
                    </div>
                    <div className="text-xs text-gray-600">Circles</div>
                  </div>
                  <div className="text-center py-3 px-2 bg-orange-50 rounded-md">
                    <div className="text-lg font-semibold text-orange-600">
                      {loadingStats ? (
                        <span className="inline-block w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        stats.shared
                      )}
                    </div>
                    <div className="text-xs text-gray-600">Shared</div>
                  </div>
                </div>
              )}
            </div>

            {/* Features */}
            <div>
              <button
                onClick={() => setShowFeatures(!showFeatures)}
                className="w-full flex items-center justify-between text-sm font-medium text-gray-700 mb-3 hover:text-gray-900"
              >
                <span>Features</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showFeatures ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showFeatures && (
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      onClose();
                      navigate('/frame');
                    }}
                    className="w-full flex items-center gap-3 py-3 px-3 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 rounded-md transition-colors text-left"
                  >
                    <span className="text-2xl">🖼️</span>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-900 block">Picture Frame Mode</span>
                      <span className="text-xs text-gray-500">Use this browser as a photo display</span>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* App Information */}
            <div>
              <button
                onClick={() => setShowAppInfo(!showAppInfo)}
                className="w-full flex items-center justify-between text-sm font-medium text-gray-700 mb-3 hover:text-gray-900"
              >
                <span>Application</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showAppInfo ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showAppInfo && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                    <span className="text-sm text-gray-600">Version</span>
                    <span className="text-sm text-gray-500">Kizu Web v1.0.0</span>
                  </div>
                  <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                    <span className="text-sm text-gray-600">Environment</span>
                    <span className="text-sm text-gray-500">
                      {import.meta.env.MODE === 'development' ? 'Development' : 'Production'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 space-y-3">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges()}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-md transition-colors text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-sm font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Click outside to close avatar options */}
      {showAvatarOptions && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowAvatarOptions(false)}
        />
      )}

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg max-w-md w-full mx-4 overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">Take Photo</h3>
              <button
                onClick={stopCamera}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="relative aspect-square bg-black">
              {cameraError ? (
                <div className="absolute inset-0 flex items-center justify-center text-white text-center p-4">
                  <div>
                    <span className="text-4xl mb-4 block">📷</span>
                    <p>{cameraError}</p>
                  </div>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
              )}
              {/* Circular overlay guide */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-4 border-white/50 rounded-full" />
              </div>
            </div>

            <div className="p-4 flex gap-3">
              <button
                onClick={stopCamera}
                className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={capturePhoto}
                disabled={!!cameraError}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>📸</span> Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
