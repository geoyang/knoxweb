import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/adminApi';
import { getDisplayIdentifier, isPlaceholderEmail } from '../../utils/phoneDisplayUtils';

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
  invited_by_profile: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
  user_profile: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

interface InviteStats {
  total_invites: number;
  pending_invites: number;
  accepted_invites: number;
  declined_invites: number;
}

interface CircleOption {
  id: string;
  name: string;
  description: string | null;
}

type StatusFilter = 'all' | 'pending' | 'accepted' | 'declined' | 'cancelled';

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

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatRoleLabel = (role: string) => role.replace('_', ' ');

export const InvitesManager: React.FC = () => {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [stats, setStats] = useState<InviteStats>({
    total_invites: 0,
    pending_invites: 0,
    accepted_invites: 0,
    declined_invites: 0,
  });
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [circleFilter, setCircleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Action states
  const [resending, setResending] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  // New invitation form
  const [showNewInviteForm, setShowNewInviteForm] = useState(false);
  const [newInviteCircleId, setNewInviteCircleId] = useState('');
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteRole, setNewInviteRole] = useState('read_only');
  const [sendingInvite, setSendingInvite] = useState(false);

  const fetchInvitations = useCallback(async () => {
    try {
      setError(null);
      const result = await adminApi.getInvitations();
      if (result.success && result.data) {
        setInvitations(result.data.invitations || []);
        setStats(result.data.stats || {
          total_invites: 0,
          pending_invites: 0,
          accepted_invites: 0,
          declined_invites: 0,
        });
        setCircles(result.data.circles || []);
      } else {
        setError(result.error || 'Failed to load invitations');
      }
    } catch (err) {
      setError('Failed to load invitations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const handleResend = async (inviteId: string) => {
    setResending(inviteId);
    try {
      const result = await adminApi.resendInvitation(inviteId);
      if (result.success) {
        alert('Invitation resent successfully.');
      } else {
        alert(result.error || 'Failed to resend invitation.');
      }
    } catch {
      alert('Failed to resend invitation.');
    } finally {
      setResending(null);
    }
  };

  const handleCancel = async (inviteId: string) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) return;

    setCancelling(inviteId);
    try {
      const result = await adminApi.cancelInvitation(inviteId);
      if (result.success) {
        await fetchInvitations();
      } else {
        alert(result.error || 'Failed to cancel invitation.');
      }
    } catch {
      alert('Failed to cancel invitation.');
    } finally {
      setCancelling(null);
    }
  };

  const handleSendNewInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInviteCircleId || !newInviteEmail) return;

    setSendingInvite(true);
    try {
      const result = await adminApi.sendInvitation({
        circle_id: newInviteCircleId,
        email: newInviteEmail.trim().toLowerCase(),
        role: newInviteRole,
      });
      if (result.success) {
        setShowNewInviteForm(false);
        setNewInviteEmail('');
        setNewInviteRole('read_only');
        setNewInviteCircleId('');
        await fetchInvitations();
      } else {
        alert(result.error || 'Failed to send invitation.');
      }
    } catch {
      alert('Failed to send invitation.');
    } finally {
      setSendingInvite(false);
    }
  };

  // Apply filters
  const filteredInvitations = invitations.filter((inv) => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (circleFilter !== 'all' && inv.circle_id !== circleFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesEmail = inv.email?.toLowerCase().includes(q);
      const matchesName = inv.user_profile?.full_name?.toLowerCase().includes(q);
      const matchesCircle = inv.circles?.name?.toLowerCase().includes(q);
      if (!matchesEmail && !matchesName && !matchesCircle) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Invitations</h2>
        {circles.length > 0 && (
          <button
            onClick={() => setShowNewInviteForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
          >
            New Invitation
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total_invites}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-yellow-600">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.pending_invites}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-green-600">Accepted</p>
          <p className="text-2xl font-bold text-green-600">{stats.accepted_invites}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-red-600">Declined</p>
          <p className="text-2xl font-bold text-red-600">{stats.declined_invites}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by email, name, or circle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {/* Circle filter */}
          <select
            value={circleFilter}
            onChange={(e) => setCircleFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">All Circles</option>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Invitations List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {filteredInvitations.length === invitations.length
              ? `${invitations.length} Invitation${invitations.length !== 1 ? 's' : ''}`
              : `${filteredInvitations.length} of ${invitations.length} Invitation${invitations.length !== 1 ? 's' : ''}`}
          </h3>
        </div>
        <div className="divide-y">
          {filteredInvitations.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              {invitations.length === 0
                ? 'No invitations yet. Invite someone to a circle to get started.'
                : 'No invitations match your filters.'}
            </div>
          ) : (
            filteredInvitations.map((inv) => (
              <div key={inv.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Invite info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900 truncate">
                        {inv.user_profile?.full_name || getDisplayIdentifier(inv.email)}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(inv.status)}`}>
                        {inv.status}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoleColor(inv.role)}`}>
                        {formatRoleLabel(inv.role)}
                      </span>
                    </div>
                    {inv.user_profile?.full_name && !isPlaceholderEmail(inv.email) && (
                      <p className="text-sm text-gray-500 truncate">{inv.email}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>
                        Circle: <span className="text-gray-600">{inv.circles?.name || 'Unknown'}</span>
                      </span>
                      <span>
                        Invited {formatDate(inv.date_invited)}
                      </span>
                      {inv.invited_by_profile && (
                        <span>
                          by {inv.invited_by_profile.full_name || getDisplayIdentifier(inv.invited_by_profile.email)}
                        </span>
                      )}
                      {inv.date_responded && (
                        <span>
                          Responded {formatDate(inv.date_responded)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  {inv.status === 'pending' && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleResend(inv.id)}
                        disabled={resending === inv.id}
                        className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition-colors disabled:opacity-50"
                      >
                        {resending === inv.id ? 'Sending...' : 'Resend'}
                      </button>
                      <button
                        onClick={() => handleCancel(inv.id)}
                        disabled={cancelling === inv.id}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-md transition-colors disabled:opacity-50"
                      >
                        {cancelling === inv.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* New Invitation Modal */}
      {showNewInviteForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Send Invitation</h3>
            <form onSubmit={handleSendNewInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Circle</label>
                <select
                  value={newInviteCircleId}
                  onChange={(e) => setNewInviteCircleId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a circle...</option>
                  {circles.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={newInviteEmail}
                  onChange={(e) => setNewInviteEmail(e.target.value)}
                  required
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={newInviteRole}
                  onChange={(e) => setNewInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="read_only">Read Only</option>
                  <option value="contributor">Contributor</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={sendingInvite}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2 px-4 rounded-md font-medium transition-colors"
                >
                  {sendingInvite ? 'Sending...' : 'Send Invitation'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewInviteForm(false);
                    setNewInviteEmail('');
                    setNewInviteRole('read_only');
                    setNewInviteCircleId('');
                  }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-4 rounded-md font-medium transition-colors"
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
