import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';
import { isPlaceholderEmail } from '../utils/phoneDisplayUtils';

interface ShareRequestData {
  id: string;
  share_type: string;
  status: string;
  metadata: {
    person_name?: string;
    contact_id?: string;
    [key: string]: any;
  };
  requester: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  };
  target: {
    id: string;
    full_name: string;
    email: string;
  };
  expires_at: string;
  created_at: string;
}

export const ShareRequest: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<ShareRequestData | null>(null);
  const [responded, setResponded] = useState(false);
  const [responseType, setResponseType] = useState<'accepted' | 'declined' | null>(null);

  useEffect(() => {
    if (token) {
      loadShareRequest();
    } else {
      setError('No share token provided');
      setLoading(false);
    }
  }, [token]);

  const loadShareRequest = async () => {
    try {
      setLoading(true);
      const supabaseUrl = getSupabaseUrl();

      const response = await fetch(
        `${supabaseUrl}/functions/v1/share-api?action=view&token=${token}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': getSupabaseAnonKey(),
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (result.expired) {
          setError('This share request has expired');
        } else {
          setError(result.error || 'Failed to load share request');
        }
        return;
      }

      setRequest(result.request);

      // Check if already responded
      if (result.request.status !== 'pending') {
        setResponded(true);
        setResponseType(result.request.status as 'accepted' | 'declined');
      }
    } catch (err) {
      console.error('Error loading share request:', err);
      setError('Failed to load share request');
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (response: 'accepted' | 'declined') => {
    if (!token) return;

    try {
      setResponding(true);
      const supabaseUrl = getSupabaseUrl();

      const apiResponse = await fetch(
        `${supabaseUrl}/functions/v1/share-api?action=respond`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': getSupabaseAnonKey(),
          },
          body: JSON.stringify({ token, response }),
        }
      );

      const result = await apiResponse.json();

      if (!apiResponse.ok) {
        throw new Error(result.error || 'Failed to respond to request');
      }

      setResponded(true);
      setResponseType(response);
    } catch (err) {
      console.error('Error responding to share request:', err);
      setError(err instanceof Error ? err.message : 'Failed to respond');
    } finally {
      setResponding(false);
    }
  };

  const getShareTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      contact_info: 'Contact Information',
      document: 'Document',
      list: 'List',
      album: 'Album',
      folder: 'Folder',
      asset: 'Photo',
      custom: 'Item',
    };
    return labels[type] || 'Item';
  };

  const getShareTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      contact_info: '👤',
      document: '📄',
      list: '📋',
      album: '📷',
      folder: '📁',
      asset: '🖼️',
      custom: '📦',
    };
    return icons[type] || '📦';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Loading share request...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Unable to Load Request</h1>
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

  if (!request) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white">
          <p className="text-lg">Share request not found</p>
        </div>
      </div>
    );
  }

  // Already responded view
  if (responded) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${responseType === 'accepted' ? 'from-green-500 to-teal-600' : 'from-gray-500 to-gray-600'} flex items-center justify-center p-4`}>
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">
            {responseType === 'accepted' ? '✅' : '❌'}
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            {responseType === 'accepted' ? 'Request Accepted!' : 'Request Declined'}
          </h1>
          <p className="text-gray-600 mb-6">
            {responseType === 'accepted' ? (
              request.share_type === 'contact_info' ? (
                <>You've shared <strong>{request.metadata.person_name || 'the contact'}</strong>'s information with {request.requester.full_name}.</>
              ) : (
                <>You've accepted the share request from {request.requester.full_name}.</>
              )
            ) : (
              <>You've declined this share request.</>
            )}
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Show share request details and accept/decline buttons
  const personName = request.metadata.person_name || 'a contact';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">{getShareTypeIcon(request.share_type)}</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Share Request</h1>
        </div>

        {/* Requester info */}
        <div className="flex items-center gap-4 bg-gray-50 rounded-lg p-4 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
            {request.requester.avatar_url ? (
              <img
                src={request.requester.avatar_url}
                alt={request.requester.full_name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              request.requester.full_name?.charAt(0)?.toUpperCase() || '?'
            )}
          </div>
          <div>
            <p className="font-semibold text-gray-800">{request.requester.full_name}</p>
            {!isPlaceholderEmail(request.requester.email) && <p className="text-sm text-gray-500">{request.requester.email}</p>}
          </div>
        </div>

        {/* Request details */}
        <div className="text-center mb-6">
          {request.share_type === 'contact_info' ? (
            <p className="text-gray-600">
              <strong>{request.requester.full_name}</strong> saw <strong>{personName}</strong> tagged in a shared photo and would like you to share their contact information.
            </p>
          ) : (
            <p className="text-gray-600">
              <strong>{request.requester.full_name}</strong> is requesting access to share a {getShareTypeLabel(request.share_type).toLowerCase()} with you.
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={() => handleRespond('accepted')}
            disabled={responding}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {responding ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </>
            ) : request.share_type === 'contact_info' ? (
              `Share ${personName}'s Contact`
            ) : (
              'Accept Request'
            )}
          </button>

          <button
            onClick={() => handleRespond('declined')}
            disabled={responding}
            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Decline
          </button>
        </div>

        <p className="text-sm text-gray-500 text-center mt-6">
          This request will expire on {new Date(request.expires_at).toLocaleDateString()}.
        </p>
      </div>
    </div>
  );
};
