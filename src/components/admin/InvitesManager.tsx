import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/adminApi';
import { supabase } from '../../lib/supabase';

interface Invitation {
  id: string;
  circle_id: string;
  user_id: string | null;
  email: string;
  role: string;
  status: string;
  date_invited: string;
  invited_by: string;
  date_responded: string | null;
  invite_expires: string | null;
  circles: {
    id: string;
    name: string;
    description: string | null;
  };
  invited_by_profile?: {
    full_name: string | null;
    email: string | null;
  };
  user_profile?: {
    full_name: string | null;
    email: string | null;
  };
}

interface Circle {
  id: string;
  name: string;
  description: string | null;
}

interface InviteStats {
  total_invites: number;
  pending_invites: number;
  accepted_invites: number;
  declined_invites: number;
}

export const InvitesManager: React.FC = () => {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [stats, setStats] = useState<InviteStats>({
    total_invites: 0,
    pending_invites: 0,
    accepted_invites: 0,
    declined_invites: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCircle, setSelectedCircle] = useState<string>('all');

  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      loadInvitations(); // This now loads both invitations and circles
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  // Stats are now calculated on backend, no need for local calculation
  useEffect(() => {
    // No-op: stats come from API
  }, [invitations]);

  const loadInvitations = async () => {
    if (!user?.id) {
      console.warn('No user ID available for filtering invitations');
      setInvitations([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Check authentication state first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        console.error('Authentication issue:', sessionError);
        setError('Please log in again to continue.');
        setLoading(false);
        return;
      }
      
      const result = await adminApi.getInvitations();
      
      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }

      setInvitations(result.data?.invitations || []);
      setStats(result.data?.stats || {
        total_invites: 0,
        pending_invites: 0,
        accepted_invites: 0,
        declined_invites: 0,
      });
      setCircles(result.data?.circles || []);
      setError(null);
    } catch (err) {
      console.error('Error loading invitations:', err);
      setError(err instanceof Error ? err.message : 'Failed to load invitations');
    } finally {
      setLoading(false);
    }
  };

  const loadCircles = async () => {
    // Circles are now loaded as part of loadInvitations()
    // This method is kept for compatibility but does nothing
    return;
  };

  const calculateStats = () => {
    // Stats are now calculated on the backend and loaded with invitations
    // This method is kept for compatibility but does nothing
    return;
  };

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);

    try {
      const result = await adminApi.sendInvitation({
        circle_id: formData.get('circle_id') as string,
        email: formData.get('email') as string,
        role: formData.get('role') as string,
      });
      
      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }

      setShowInviteForm(false);
      form.reset();
      await loadInvitations();
    } catch (err) {
      console.error('Error sending invitation:', err);
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    }
  };

  const handleResendInvitation = async (inviteId: string, email: string, circleName: string, role: string) => {
    try {
      const result = await adminApi.resendInvitation(inviteId);
      
      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }
      
      alert('Invitation resent successfully!');
    } catch (err) {
      console.error('Error resending invitation:', err);
      setError(err instanceof Error ? err.message : 'Failed to resend invitation');
    }
  };

  const handleCancelInvitation = async (inviteId: string) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) return;

    try {
      const result = await adminApi.cancelInvitation(inviteId);
      
      if (!result.success) {
        throw new Error(adminApi.handleApiError(result));
      }
      
      await loadInvitations();
    } catch (err) {
      console.error('Error cancelling invitation:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel invitation');
    }
  };

  const copyInviteLink = (inviteId: string) => {
    const link = `${window.location.origin}/album/${inviteId}`;
    navigator.clipboard.writeText(link);
    alert('Invite link copied to clipboard!');
  };

  const filteredInvitations = invitations.filter(invitation => {
    const statusMatch = selectedStatus === 'all' || invitation.status === selectedStatus;
    const circleMatch = selectedCircle === 'all' || invitation.circle_id === selectedCircle;
    return statusMatch && circleMatch;
  });

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'editor': return 'bg-orange-100 text-orange-800';
      case 'contributor': return 'bg-green-100 text-green-800';
      case 'read_only': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'declined': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Invitations Management</h2>
        <button
          onClick={() => setShowInviteForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
        >
          Send New Invitation
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-blue-600 mb-2">{stats.total_invites}</div>
          <div className="text-gray-600">Total Invitations</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-yellow-600 mb-2">{stats.pending_invites}</div>
          <div className="text-gray-600">Pending</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-green-600 mb-2">{stats.accepted_invites}</div>
          <div className="text-gray-600">Accepted</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-red-600 mb-2">{stats.declined_invites}</div>
          <div className="text-gray-600">Declined</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Circle
            </label>
            <select
              value={selectedCircle}
              onChange={(e) => setSelectedCircle(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Circles</option>
              {circles.map(circle => (
                <option key={circle.id} value={circle.id}>
                  {circle.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Invitations Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invitee
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Circle
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date Invited
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredInvitations.map(invitation => (
              <tr key={invitation.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {invitation.user_profile?.full_name || invitation.email}
                    </div>
                    {invitation.user_profile?.full_name && (
                      <div className="text-sm text-gray-500">{invitation.email}</div>
                    )}
                    {invitation.user_id && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                        User Account
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{invitation.circles.name}</div>
                  {invitation.circles.description && (
                    <div className="text-sm text-gray-500 truncate max-w-xs">
                      {invitation.circles.description}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(invitation.role)}`}>
                    {invitation.role.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invitation.status)}`}>
                    {invitation.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(invitation.date_invited).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex space-x-2">
                    {invitation.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleResendInvitation(
                            invitation.id,
                            invitation.email,
                            invitation.circles.name,
                            invitation.role
                          )}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Resend
                        </button>
                        {invitation.role === 'read_only' && (
                          <button
                            onClick={() => copyInviteLink(invitation.id)}
                            className="text-green-600 hover:text-green-800"
                            title="Copy invite link"
                          >
                            Copy Link
                          </button>
                        )}
                        <button
                          onClick={() => handleCancelInvitation(invitation.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {invitation.status === 'accepted' && invitation.role === 'read_only' && (
                      <button
                        onClick={() => copyInviteLink(invitation.id)}
                        className="text-green-600 hover:text-green-800"
                        title="Copy album link"
                      >
                        Copy Link
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredInvitations.length === 0 && (
        <div className="text-center py-16">
          <div className="text-6xl mb-4 opacity-50">📧</div>
          <h3 className="text-2xl font-bold text-gray-700 mb-2">No Invitations Found</h3>
          <p className="text-gray-500">
            {selectedStatus === 'all' && selectedCircle === 'all' 
              ? 'You haven\'t sent any invitations yet. Create circles and invite people to start sharing!' 
              : 'No invitations match your current filters.'}
          </p>
        </div>
      )}

      {/* Send Invitation Modal */}
      {showInviteForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Send New Invitation</h3>
            <form onSubmit={handleSendInvitation} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Circle
                </label>
                <select
                  name="circle_id"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a circle...</option>
                  {circles.map(circle => (
                    <option key={circle.id} value={circle.id}>
                      {circle.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  name="role"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="read_only">Read Only</option>
                  <option value="contributor">Contributor</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md font-medium transition-colors"
                >
                  Send Invitation
                </button>
                <button
                  type="button"
                  onClick={() => setShowInviteForm(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-md font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};