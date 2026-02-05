import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseUrl, getSupabaseAnonKey } from '../../lib/environments';
import { supabase } from '../../lib/supabase';

interface Circle {
  id: string;
  name: string;
  owner_id: string;
}

export const AddMember: React.FC = () => {
  const { circleId } = useParams<{ circleId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const email = searchParams.get('email') || '';
  const defaultRole = searchParams.get('role') || 'viewer';

  const [circle, setCircle] = useState<Circle | null>(null);
  const [selectedRole, setSelectedRole] = useState(defaultRole);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const roleLabels: Record<string, string> = {
    viewer: 'Viewer (can view shared content)',
    read_only: 'Viewer (can view shared content)',
    contributor: 'Contributor (can add content)',
    editor: 'Editor (can add and edit content)',
    admin: 'Admin (full access)',
  };

  useEffect(() => {
    if (!authLoading && !user) {
      // Redirect to login with return URL
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      navigate(`/login?returnUrl=${returnUrl}`);
      return;
    }

    if (user && circleId) {
      loadCircle();
    }
  }, [user, authLoading, circleId]);

  const loadCircle = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const supabaseUrl = getSupabaseUrl();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/admin-circles-api?action=get&id=${circleId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': getSupabaseAnonKey(),
          },
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || 'Circle not found');
        setLoading(false);
        return;
      }

      // Check if user is owner or admin of this circle
      if (result.circle.owner_id !== user?.id) {
        setError('You do not have permission to add members to this circle');
        setLoading(false);
        return;
      }

      setCircle(result.circle);
      setLoading(false);
    } catch (err) {
      console.error('Error loading circle:', err);
      setError('Failed to load circle');
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!circle || !email) return;

    setSending(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        setError('Not authenticated');
        setSending(false);
        return;
      }

      const supabaseUrl = getSupabaseUrl();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/admin-circles-api?action=invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': getSupabaseAnonKey(),
          },
          body: JSON.stringify({
            circle_id: circle.id,
            invites: [{
              email: email.toLowerCase(),
              role: selectedRole === 'viewer' ? 'read_only' : selectedRole,
              name: name || undefined,
            }],
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || 'Failed to send invitation');
        setSending(false);
        return;
      }

      setSuccess(true);
    } catch (err) {
      console.error('Error sending invitation:', err);
      setError('Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !circle) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Unable to Add Member</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/admin/circles')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Go to Circles
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Invitation Sent!</h1>
          <p className="text-gray-600 mb-6">
            An invitation has been sent to <strong>{email}</strong> to join <strong>{circle?.name}</strong> as a {selectedRole}.
          </p>
          <button
            onClick={() => navigate('/admin/circles')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Back to Circles
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Add Member to Circle</h1>
        <p className="text-gray-600 mb-6">
          Add <strong>{email}</strong> to <strong>{circle?.name}</strong>
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter their name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="viewer">Viewer</option>
              <option value="contributor">Contributor</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-sm text-gray-500 mt-1">{roleLabels[selectedRole]}</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => navigate('/admin/circles')}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddMember}
              disabled={sending || !email}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {sending ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
