import React, { useState, useEffect, useCallback } from 'react';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';
import { getAccessToken } from '../lib/supabase';
import { MomentsJobMonitor } from './MomentsJobMonitor';

interface CoverAsset {
  id: string;
  thumbnail: string | null;
  web_uri: string | null;
  path: string | null;
}

interface Asset {
  id: string;
  asset_uri: string;
  thumbnail_uri: string | null;
  media_type: string;
  created_at: string;
  location_name: string | null;
  width: number | null;
  height: number | null;
  display_order: number;
}

interface Moment {
  id: string;
  grouping_type: 'location' | 'people' | 'event' | 'on_this_day';
  grouping_criteria: any;
  title: string;
  subtitle: string | null;
  cover_asset_ids: string[];
  cover_assets?: CoverAsset[];
  assets?: Asset[];
  asset_count?: number;
  is_saved: boolean;
  date_range_start: string | null;
  date_range_end: string | null;
  created_at: string;
  viewed_at: string | null;
}

const TYPE_ICONS: Record<string, string> = {
  location: '📍',
  people: '👥',
  event: '📅',
  on_this_day: '⏰',
};

const TYPE_COLORS: Record<string, string> = {
  location: 'bg-green-100 text-green-800',
  people: 'bg-purple-100 text-purple-800',
  event: 'bg-blue-100 text-blue-800',
  on_this_day: 'bg-amber-100 text-amber-800',
};

interface UserOption {
  id: string;
  display_name: string;
  asset_count: number;
}

export const MomentsGallery: React.FC = () => {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMoment, setSelectedMoment] = useState<Moment | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('current');
  const [loadingUsers, setLoadingUsers] = useState(true);

  const fetchMoments = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      const userParam = selectedUserId !== 'current' ? `&user_id=${selectedUserId}` : '';
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/moments-api?action=feed&include_assets=true${userParam}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            apikey: getSupabaseAnonKey(),
          },
        }
      );

      const data = await response.json();

      if (data.success && data.moments) {
        setMoments(data.moments);
        setError(null);
      } else {
        setError(data.error || 'Failed to load moments');
      }
    } catch (err) {
      console.error('Error fetching moments:', err);
      setError('Failed to load moments');
    } finally {
      setLoading(false);
    }
  }, [selectedUserId]);

  const fetchUsers = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;

    try {
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/moments-api?action=users`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            apikey: getSupabaseAnonKey(),
          },
        }
      );
      const data = await response.json();
      if (data.success && data.users) {
        setUsers(data.users.map((u: any) => ({
          id: u.id,
          display_name: u.display_name,
          asset_count: u.photo_count,
        })));
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchMomentDetail = async (momentId: string) => {
    const token = getAccessToken();
    if (!token) return;

    try {
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/moments-api/${momentId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            apikey: getSupabaseAnonKey(),
          },
        }
      );

      const data = await response.json();

      if (data.success && data.moment) {
        setSelectedMoment(data.moment);
      }
    } catch (err) {
      console.error('Error fetching moment detail:', err);
    }
  };

  const handleSaveMoment = async (momentId: string) => {
    const token = getAccessToken();
    if (!token) return;

    try {
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/moments-api/${momentId}/save`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            apikey: getSupabaseAnonKey(),
          },
        }
      );

      const data = await response.json();

      if (data.success) {
        setMoments((prev) =>
          prev.map((m) => (m.id === momentId ? { ...m, is_saved: true } : m))
        );
        if (selectedMoment?.id === momentId) {
          setSelectedMoment((prev) => (prev ? { ...prev, is_saved: true } : null));
        }
      }
    } catch (err) {
      console.error('Error saving moment:', err);
    }
  };

  const handleDismissMoment = async (momentId: string) => {
    const token = getAccessToken();
    if (!token) return;

    if (!window.confirm('Dismiss this moment? It will be hidden from your feed.')) {
      return;
    }

    try {
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/moments-api/${momentId}/dismiss`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            apikey: getSupabaseAnonKey(),
          },
        }
      );

      const data = await response.json();

      if (data.success) {
        setMoments((prev) => prev.filter((m) => m.id !== momentId));
        if (selectedMoment?.id === momentId) {
          setSelectedMoment(null);
        }
      }
    } catch (err) {
      console.error('Error dismissing moment:', err);
    }
  };

  const handleGenerateMoments = async () => {
    const token = getAccessToken();
    if (!token) return;

    setGenerating(true);
    setGenerationStatus('Creating generation job...');

    try {
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/moments-cron?action=generate-user&user_id=${selectedUserId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            apikey: getSupabaseAnonKey(),
          },
        }
      );

      const data = await response.json();

      if (data.success) {
        setGenerationStatus(`Job created: ${data.job_id || 'queued'}. The Kizu-AI worker will process it in the background. Refresh in a few minutes to see your moments.`);
        // Refresh after a longer delay since AI processing takes time
        setTimeout(() => {
          fetchMoments();
        }, 10000);
      } else {
        setGenerationStatus(`Error: ${data.message || data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error generating moments:', err);
      setGenerationStatus('Failed to trigger generation');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchMoments();
    const interval = setInterval(fetchMoments, 10000);
    return () => clearInterval(interval);
  }, [fetchMoments, fetchUsers]);

  const getImageUrl = (asset: CoverAsset | Asset): string | null => {
    if ('thumbnail_uri' in asset && asset.thumbnail_uri) return asset.thumbnail_uri;
    if ('thumbnail' in asset && asset.thumbnail) return asset.thumbnail;
    if ('web_uri' in asset && asset.web_uri) return asset.web_uri;
    if ('asset_uri' in asset && asset.asset_uri) return asset.asset_uri;
    if ('path' in asset && asset.path) return asset.path;
    return null;
  };

  const renderCollage = (moment: Moment) => {
    const coverImages = moment.cover_assets || [];

    if (coverImages.length === 0) {
      return (
        <div className="aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 rounded-t-xl flex items-center justify-center">
          <span className="text-4xl opacity-50">📷</span>
        </div>
      );
    }

    const displayImages = coverImages.slice(0, 4);

    return (
      <div className="aspect-[4/3] bg-gray-100 rounded-t-xl overflow-hidden grid grid-cols-2 gap-0.5">
        {displayImages.map((asset, index) => {
          const url = getImageUrl(asset);
          return (
            <div
              key={asset.id}
              className={`bg-gray-200 ${
                displayImages.length === 1 ? 'col-span-2 row-span-2' :
                displayImages.length === 2 ? 'row-span-2' :
                displayImages.length === 3 && index === 0 ? 'row-span-2' : ''
              }`}
            >
              {url ? (
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-2xl opacity-30">📷</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">⚠️</div>
        <p className="text-gray-600">{error}</p>
        <button
          onClick={fetchMoments}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header with Generate Button */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Your Moments</h3>
          <p className="text-sm text-gray-500">
            Auto-curated collections based on your photos
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={loadingUsers || generating}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100"
          >
            <option value="current">Current User</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name} ({u.asset_count} photos)
              </option>
            ))}
          </select>
          <button
            onClick={handleGenerateMoments}
            disabled={generating}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Generating...
              </>
            ) : (
              <>
                <span>Generate Moments</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Job Queue Monitor */}
      <MomentsJobMonitor userId={selectedUserId} />

      {/* Generation Status */}
      {generationStatus && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-800">{generationStatus}</p>
        </div>
      )}

      {/* Moments Grid */}
      {moments.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <div className="text-6xl mb-4 opacity-50">✨</div>
          <h4 className="text-xl font-medium text-gray-700 mb-2">No Moments Yet</h4>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Moments are automatically generated from your photos based on location, people, events, and memories from the past.
          </p>
          <button
            onClick={handleGenerateMoments}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Your First Moments'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {moments.map((moment) => (
            <div
              key={moment.id}
              className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => fetchMomentDetail(moment.id)}
            >
              {/* Collage */}
              {renderCollage(moment)}

              {/* Content */}
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-lg ${
                      TYPE_COLORS[moment.grouping_type] || 'bg-gray-100'
                    }`}
                  >
                    {TYPE_ICONS[moment.grouping_type] || '📷'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-800 truncate">{moment.title}</h4>
                    {moment.subtitle && (
                      <p className="text-sm text-gray-500 truncate">{moment.subtitle}</p>
                    )}
                  </div>
                  {!moment.viewed_at && (
                    <span className="bg-blue-600 text-white text-xs font-medium px-2 py-0.5 rounded">
                      NEW
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveMoment(moment.id);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      moment.is_saved
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {moment.is_saved ? '🔖 Saved' : '🔖 Save'}
                  </button>
                  {!moment.is_saved && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDismissMoment(moment.id);
                      }}
                      className="flex items-center justify-center gap-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Moment Detail Modal */}
      {selectedMoment && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedMoment(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-2xl ${
                      TYPE_COLORS[selectedMoment.grouping_type] || 'bg-gray-100'
                    }`}
                  >
                    {TYPE_ICONS[selectedMoment.grouping_type] || '📷'}
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">{selectedMoment.title}</h3>
                    {selectedMoment.subtitle && (
                      <p className="text-gray-500">{selectedMoment.subtitle}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedMoment(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ✕
                </button>
              </div>

              {/* Stats and Actions */}
              <div className="flex items-center gap-4 mt-4">
                <span className="text-sm text-gray-500">
                  {selectedMoment.asset_count || selectedMoment.assets?.length || 0} photos
                </span>
                <button
                  onClick={() => handleSaveMoment(selectedMoment.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedMoment.is_saved
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {selectedMoment.is_saved ? '🔖 Saved' : '🔖 Save Moment'}
                </button>
              </div>
            </div>

            {/* Photos Grid */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {selectedMoment.assets && selectedMoment.assets.length > 0 ? (
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {selectedMoment.assets.map((asset) => {
                    const url = getImageUrl(asset);
                    return (
                      <div
                        key={asset.id}
                        className="aspect-square bg-gray-100 rounded-lg overflow-hidden"
                      >
                        {url ? (
                          <img
                            src={url}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-2xl opacity-30">📷</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Loading photos...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
