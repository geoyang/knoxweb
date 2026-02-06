import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../../lib/environments';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/adminApi';

interface User {
  id: string;
  email: string | null;
  full_name: string | null;
  date_created: string;
  date_modified: string;
  created_at: string;
  last_sign_in_at: string | null | undefined;
  circle_memberships?: {
    id: string;
    role: string;
    status: string;
    circles: {
      id: string;
      name: string;
    } | any;
  }[];
  album_count?: number;
}

interface UserStats {
  total_users: number;
  active_users: number;
  users_last_30_days: number;
}

export const UsersManager: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<UserStats>({ total_users: 0, active_users: 0, users_last_30_days: 0 });
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'created' | 'name' | 'last_active'>('created');

  const { user: currentUser } = useAuth();

  // Modal editing state
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [editingMembershipId, setEditingMembershipId] = useState<string | null>(null);
  const [editMembershipRole, setEditMembershipRole] = useState('');
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Add to Circle state
  const [showAddToCircle, setShowAddToCircle] = useState(false);
  const [allCircles, setAllCircles] = useState<{ id: string; name: string; owner_name: string }[]>([]);
  const [addCircleId, setAddCircleId] = useState('');
  const [addCircleRole, setAddCircleRole] = useState('contributor');
  const [addingToCircle, setAddingToCircle] = useState(false);

  useEffect(() => {
    if (currentUser?.id) {
      loadUsers();
    } else {
      setLoading(false);
    }
  }, [currentUser?.id]);

  // Sync selectedUser when users list refreshes
  useEffect(() => {
    if (selectedUser) {
      const updated = users.find(u => u.id === selectedUser.id);
      if (updated) {
        setSelectedUser(updated);
      } else {
        setSelectedUser(null);
      }
    }
  }, [users]);

  const resetModalState = () => {
    setEditingName(false);
    setEditNameValue('');
    setEditingMembershipId(null);
    setEditMembershipRole('');
    setConfirmRemoveId(null);
    setModalLoading(null);
    setModalError(null);
    setShowAddToCircle(false);
    setAddCircleId('');
    setAddCircleRole('contributor');
  };

  const handleOpenAddToCircle = async () => {
    setShowAddToCircle(true);
    setModalError(null);
    const result = await adminApi.getCircles();
    if (result.success && result.data?.circles) {
      setAllCircles(result.data.circles.map((c: any) => ({
        id: c.id,
        name: c.name,
        owner_name: c.owner?.full_name || c.owner?.email || 'Unknown',
      })));
    } else {
      setModalError(result.error || 'Failed to load circles');
    }
  };

  const handleAddToCircle = async () => {
    if (!selectedUser || !addCircleId) return;
    setAddingToCircle(true);
    setModalError(null);
    const result = await adminApi.addUserToCircle(addCircleId, {
      email: selectedUser.email || '',
      role: addCircleRole,
      full_name: selectedUser.full_name || undefined,
    });
    if (!result.success) {
      setModalError(result.error || 'Failed to add user to circle');
    } else {
      setShowAddToCircle(false);
      setAddCircleId('');
      setAddCircleRole('contributor');
      loadUsers(true);
    }
    setAddingToCircle(false);
  };

  const handleSaveName = async () => {
    if (!selectedUser) return;
    setModalLoading('name');
    setModalError(null);
    const result = await adminApi.updateUserProfile(selectedUser.id, { full_name: editNameValue });
    if (!result.success) {
      setModalError(result.error || 'Failed to update name');
    } else {
      setEditingName(false);
      loadUsers(true);
    }
    setModalLoading(null);
  };

  const handleSaveMembershipRole = async (membershipId: string) => {
    setModalLoading(membershipId);
    setModalError(null);
    const result = await adminApi.updateMemberRole(membershipId, editMembershipRole);
    if (!result.success) {
      setModalError(result.error || 'Failed to update role');
    } else {
      setEditingMembershipId(null);
      loadUsers(true);
    }
    setModalLoading(null);
  };

  const handleRemoveMembership = async (membershipId: string) => {
    setModalLoading(membershipId);
    setModalError(null);
    const result = await adminApi.removeMember(membershipId);
    if (!result.success) {
      setModalError(result.error || 'Failed to remove member');
    } else {
      setConfirmRemoveId(null);
      loadUsers(true);
    }
    setModalLoading(null);
  };

  const loadUsers = async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      // Get session for API call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Fetch users via admin-users-api
      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/admin-users-api`,
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
        throw new Error(data.error || 'Failed to load users');
      }

      // Map API response to User interface
      const combinedUsers: User[] = (data.users || []).map((apiUser: any) => ({
        id: apiUser.id,
        email: apiUser.email,
        full_name: apiUser.full_name,
        date_created: apiUser.date_created,
        date_modified: apiUser.date_modified,
        created_at: apiUser.date_created,
        last_sign_in_at: null, // Not available from profiles table
        circle_memberships: apiUser.circle_memberships || [],
        album_count: apiUser.album_count || 0,
      }));

      setUsers(combinedUsers);
      updateStats(combinedUsers);
      setError(null);
    } catch (err) {
      console.error('Error loading users:', err);
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const updateStats = (userList: User[]) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    setStats({
      total_users: userList.length,
      active_users: userList.filter(u => u.last_sign_in_at).length,
      users_last_30_days: userList.filter(u =>
        u.created_at && new Date(u.created_at) > thirtyDaysAgo
      ).length,
    });
  };


  const filteredUsers = users.filter(user =>
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedUsers = filteredUsers.sort((a, b) => {
    switch (sortBy) {
      case 'name':
        const aName = a.full_name || a.email || '';
        const bName = b.full_name || b.email || '';
        return aName.localeCompare(bName);
      case 'last_active':
        const aDate = a.last_sign_in_at || '';
        const bDate = b.last_sign_in_at || '';
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      case 'created':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
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
        <h2 className="text-2xl font-bold text-gray-900">Users Management</h2>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-blue-600 mb-2">{stats.total_users}</div>
          <div className="text-gray-600">Total Users</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-green-600 mb-2">{stats.active_users}</div>
          <div className="text-gray-600">Active Users</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-3xl font-bold text-purple-600 mb-2">{stats.users_last_30_days}</div>
          <div className="text-gray-600">New (30 days)</div>
        </div>
      </div>

      {/* Search and Sort */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Users
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="created">Date Created</option>
              <option value="name">Name</option>
              <option value="last_active">Last Active</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Albums
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Circles
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Active
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedUsers.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedUser(user)}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-full overflow-hidden">
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <span className="text-lg">👤</span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {user.full_name || 'Unnamed User'}
                      </div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                      {user.id === currentUser?.id && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          You
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {user.album_count || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {user.circle_memberships?.length || 0} memberships
                  </div>
                  {user.circle_memberships && user.circle_memberships.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {user.circle_memberships.slice(0, 2).map(membership => (
                        <span
                          key={membership.id}
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(membership.role)}`}
                        >
                          {membership.circles.name}
                        </span>
                      ))}
                      {user.circle_memberships.length > 2 && (
                        <span className="text-xs text-gray-500">
                          +{user.circle_memberships.length - 2} more
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.last_sign_in_at ? (
                    new Date(user.last_sign_in_at).toLocaleDateString()
                  ) : (
                    'Never'
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedUsers.length === 0 && (
        <div className="text-center py-16">
          <div className="text-6xl mb-4 opacity-50">👥</div>
          <h3 className="text-2xl font-bold text-gray-700 mb-2">No Users Found</h3>
          <p className="text-gray-500">
            {searchTerm ? 'No users match your search criteria.' : 'No users registered yet.'}
          </p>
        </div>
      )}

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center">
                <div className="flex-shrink-0 h-16 w-16 bg-gray-100 rounded-full overflow-hidden">
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <span className="text-2xl">👤</span>
                  </div>
                </div>
                <div className="ml-4">
                  {editingName ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        className="text-lg font-bold border border-gray-300 rounded px-2 py-1"
                        disabled={modalLoading === 'name'}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                      />
                      <button onClick={handleSaveName} disabled={modalLoading === 'name'} className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
                        {modalLoading === 'name' ? '...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingName(false)} disabled={modalLoading === 'name'} className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <h3 className="text-xl font-bold text-gray-900">
                        {selectedUser.full_name || 'Unnamed User'}
                      </h3>
                      <button
                        onClick={() => { setEditNameValue(selectedUser.full_name || ''); setEditingName(true); setModalError(null); }}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                  <p className="text-gray-600">{selectedUser.email}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Active
                    </span>
                    {selectedUser.id === currentUser?.id && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        You
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setSelectedUser(null); resetModalState(); }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            {modalError && (
              <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded mb-4">{modalError}</div>
            )}

            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Account Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Created:</span>
                    <span className="ml-2">{new Date(selectedUser.created_at).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Last Sign In:</span>
                    <span className="ml-2">
                      {selectedUser.last_sign_in_at
                        ? new Date(selectedUser.last_sign_in_at).toLocaleDateString()
                        : 'Never'
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Albums:</span>
                    <span className="ml-2">{selectedUser.album_count || 0}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Circle Memberships:</span>
                    <span className="ml-2">{selectedUser.circle_memberships?.length || 0}</span>
                  </div>
                </div>
              </div>

              {/* Circle Memberships */}
              {selectedUser.circle_memberships && selectedUser.circle_memberships.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Circle Memberships</h4>
                  <div className="space-y-2">
                    {selectedUser.circle_memberships.map(membership => (
                      <div key={membership.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{membership.circles?.name || 'Unknown'}</span>
                          {membership.circles?.owner_name && (
                            <span className="text-xs text-gray-500 ml-2">by {membership.circles.owner_name}</span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          {editingMembershipId === membership.id ? (
                            <>
                              <select
                                value={editMembershipRole}
                                onChange={(e) => setEditMembershipRole(e.target.value)}
                                className="text-xs border border-gray-300 rounded px-2 py-1"
                                disabled={modalLoading === membership.id}
                              >
                                {['read_only', 'contributor', 'editor', 'admin'].map(r => (
                                  <option key={r} value={r}>{r.replace('_', ' ')}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleSaveMembershipRole(membership.id)}
                                disabled={modalLoading === membership.id || editMembershipRole === membership.role}
                                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {modalLoading === membership.id ? '...' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingMembershipId(null)}
                                disabled={modalLoading === membership.id}
                                className="text-xs text-gray-600 hover:text-gray-800"
                              >
                                Cancel
                              </button>
                            </>
                          ) : confirmRemoveId === membership.id ? (
                            <>
                              <span className="text-xs text-red-600 font-medium">Remove from circle?</span>
                              <button
                                onClick={() => handleRemoveMembership(membership.id)}
                                disabled={modalLoading === membership.id}
                                className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:opacity-50"
                              >
                                {modalLoading === membership.id ? '...' : 'Yes'}
                              </button>
                              <button
                                onClick={() => setConfirmRemoveId(null)}
                                disabled={modalLoading === membership.id}
                                className="text-xs text-gray-600 hover:text-gray-800"
                              >
                                No
                              </button>
                            </>
                          ) : (
                            <>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(membership.role)}`}>
                                {membership.role.replace('_', ' ')}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(membership.status)}`}>
                                {membership.status}
                              </span>
                              <button
                                onClick={() => { setEditingMembershipId(membership.id); setEditMembershipRole(membership.role); setModalError(null); }}
                                className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => { setConfirmRemoveId(membership.id); setModalError(null); }}
                                className="px-2 py-1 text-xs text-red-600 hover:text-red-800 font-medium"
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add to Circle */}
              <div>
                {!showAddToCircle ? (
                  <button
                    onClick={handleOpenAddToCircle}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                  >
                    Add to Circle
                  </button>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <h4 className="font-semibold text-gray-900 text-sm">Add to Circle</h4>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <select
                        value={addCircleId}
                        onChange={(e) => setAddCircleId(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={addingToCircle}
                      >
                        <option value="">Select a circle...</option>
                        {Object.entries(
                          allCircles
                            .filter(c => !selectedUser?.circle_memberships?.some(m => m.circles?.id === c.id))
                            .reduce<Record<string, typeof allCircles>>((groups, c) => {
                              (groups[c.owner_name] = groups[c.owner_name] || []).push(c);
                              return groups;
                            }, {})
                        )
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([ownerName, circles]) => (
                            <optgroup key={ownerName} label={ownerName}>
                              {circles.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </optgroup>
                          ))}
                      </select>
                      <select
                        value={addCircleRole}
                        onChange={(e) => setAddCircleRole(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={addingToCircle}
                      >
                        {['read_only', 'contributor', 'editor', 'admin'].map(r => (
                          <option key={r} value={r}>{r.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleAddToCircle}
                        disabled={addingToCircle || !addCircleId}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        {addingToCircle ? 'Adding...' : 'Add'}
                      </button>
                      <button
                        onClick={() => setShowAddToCircle(false)}
                        disabled={addingToCircle}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};