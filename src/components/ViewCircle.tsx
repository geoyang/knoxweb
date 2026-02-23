import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';
import { getDisplayIdentifier, isPlaceholderEmail } from '../utils/phoneDisplayUtils';

interface InviteData {
  id: string;
  circle_id: string;
  email: string;
  role: string;
  status: string;
  circle?: {
    id: string;
    name: string;
    description?: string;
  };
}

interface UserCircle {
  id: string;
  circle_id: string;
  role: string;
  status: string;
  circle: {
    id: string;
    name: string;
    description?: string;
  };
}

export const ViewCircle: React.FC = () => {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userCircles, setUserCircles] = useState<UserCircle[]>([]);
  const [loadingCircles, setLoadingCircles] = useState(false);

  const fetchUserCircles = async (_userId: string) => {
    try {
      setLoadingCircles(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('No session for fetching circles');
        return;
      }

      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/view-circle-api?action=my_circles`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': getSupabaseAnonKey(),
          },
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        console.error('Error fetching user circles:', data.error);
        return;
      }

      setUserCircles(data.circles || []);
    } catch (err) {
      console.error('Error fetching user circles:', err);
    } finally {
      setLoadingCircles(false);
    }
  };

  useEffect(() => {
    checkAuthAndLoadInvite();
  }, [inviteId]);

  const checkAuthAndLoadInvite = async () => {
    try {
      setLoading(true);

      // Check if user is authenticated
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Session error:', sessionError);
      }

      if (session?.user) {
        setUser(session.user);
      }

      // Load invite data
      if (!inviteId) {
        setError('No invitation ID provided');
        return;
      }

      // Fetch invite via API
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/view-circle-api?invite_id=${inviteId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': getSupabaseAnonKey(),
          },
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        console.error('Invite error:', data.error);
        setError('Invalid or expired invitation');
        return;
      }

      const inviteData = data.invite;
      if (!inviteData) {
        setError('Invitation not found');
        return;
      }

      // Map the response
      setInvite({
        id: inviteData.id,
        circle_id: inviteData.circle_id,
        email: inviteData.email,
        role: inviteData.role,
        status: inviteData.status,
        circle: inviteData.circles as any,
      });

      // Check if already accepted
      if (inviteData.status === 'accepted') {
        setAccepted(true);
        // Fetch all user circles if already accepted and user is logged in
        if (session?.user) {
          fetchUserCircles(session.user.id);
        }
      }

      // If user is logged in and email matches, verify they can accept
      if (session?.user && session.user.email?.toLowerCase() !== inviteData.email.toLowerCase()) {
        setError(`This invitation was sent to ${getDisplayIdentifier(inviteData.email)}. Please log in with that account.`);
      }
    } catch (err) {
      console.error('Error loading invite:', err);
      setError('Failed to load invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async () => {
    if (!invite || !user) return;

    try {
      setAccepting(true);

      // Get the current session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Call the accept-circle-invite edge function (uses service role to bypass RLS)
      const supabaseUrl = getSupabaseUrl();
      const response = await fetch(`${supabaseUrl}/functions/v1/accept-circle-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': getSupabaseAnonKey(),
        },
        body: JSON.stringify({ invite_id: invite.id }),
      });

      const result = await response.json();
      console.log('Accept invitation result:', result);

      if (!response.ok) {
        throw new Error(result.details || result.error || 'Failed to accept invitation');
      }

      setAccepted(true);

      // Fetch all user circles to show them after acceptance
      await fetchUserCircles(user.id);
    } catch (err) {
      console.error('Error accepting invitation:', err);
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  const handleLogin = () => {
    // Redirect to login with return URL
    const returnUrl = `/view-circle/${inviteId}`;
    navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-lg">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Unable to Load Invitation</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 text-center text-white">
          <p className="text-lg">Invitation not found</p>
        </div>
      </div>
    );
  }

  // Already accepted view
  if (accepted) {
    const hasMultipleCircles = userCircles.length > 1;

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Welcome to {invite.circle?.name}!</h1>
          <p className="text-gray-600 mb-6">
            You've successfully joined the circle as {invite.role === 'read_only' ? 'a Viewer' : `an ${invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}`}.
          </p>

          {/* Show all circles if user is a member of multiple */}
          {loadingCircles ? (
            <div className="flex items-center justify-center py-4 mb-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
            </div>
          ) : hasMultipleCircles ? (
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-3">You're a member of {userCircles.length} circles:</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {userCircles.map((uc) => (
                  <div
                    key={uc.id}
                    className="bg-gray-50 rounded-lg p-3 flex items-center justify-between hover:bg-gray-100 cursor-pointer transition-colors"
                    onClick={() => navigate(`/album/${uc.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                        {uc.circle.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-800">{uc.circle.name}</p>
                        <p className="text-xs text-gray-500 capitalize">
                          {uc.role === 'read_only' ? 'Viewer' : uc.role}
                        </p>
                      </div>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-green-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-800">
                You can now view and {invite.role !== 'read_only' ? 'contribute to ' : ''}albums shared with this circle.
              </p>
            </div>
          )}

          <button
            onClick={handleGoToDashboard}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Not logged in - prompt to login
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="text-6xl mb-4">👋</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">You're Invited!</h1>
          <p className="text-gray-600 mb-4">
            You've been invited to join <strong>{invite.circle?.name || 'a circle'}</strong> as {invite.role === 'read_only' ? 'a Viewer' : `an ${invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}`}.
          </p>
          {invite.circle?.description && (
            <p className="text-gray-500 text-sm mb-6">{invite.circle.description}</p>
          )}
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              Please log in with <strong>{getDisplayIdentifier(invite.email)}</strong> to accept this invitation.
            </p>
          </div>
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Log In to Accept
          </button>
        </div>
      </div>
    );
  }

  // Logged in - show accept button
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="text-6xl mb-4">👥</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Accept Invitation</h1>
        <p className="text-gray-600 mb-4">
          You've been invited to join <strong>{invite.circle?.name || 'a circle'}</strong> as {invite.role === 'read_only' ? 'a Viewer' : `an ${invite.role.charAt(0).toUpperCase() + invite.role.slice(1)}`}.
        </p>
        {invite.circle?.description && (
          <p className="text-gray-500 text-sm mb-6">{invite.circle.description}</p>
        )}

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
            <span>Signed in as</span>
            <strong>{getDisplayIdentifier(user.email)}</strong>
          </div>
        </div>

        <button
          onClick={handleAcceptInvitation}
          disabled={accepting}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {accepting ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Accepting...
            </>
          ) : (
            'Accept Invitation'
          )}
        </button>

        <p className="text-sm text-gray-500 mt-4">
          By accepting, you'll be able to view albums shared with this circle.
        </p>
      </div>
    </div>
  );
};
