import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

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

  useEffect(() => {
    if (currentUser?.id) {
      loadUsers();
      loadStats();
    } else {
      setLoading(false);
    }
  }, [currentUser?.id]);

  const loadUsers = async () => {
    try {
      setLoading(true);

      // Get users from auth.users via admin API
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      if (authError) throw authError;

      // Get profiles data
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          date_created,
          date_modified
        `);

      if (profilesError) throw profilesError;

      // Get circle memberships
      const { data: memberships, error: membershipsError } = await supabase
        .from('circle_users')
        .select('id, user_id, role, status, circle_id');

      if (membershipsError) throw membershipsError;

      // Get circles separately
      let circlesData: any[] = [];
      if (memberships && memberships.length > 0) {
        const circleIds = [...new Set(memberships.map(m => m.circle_id))];
        const { data: circlesList } = await supabase
          .from('circles')
          .select('id, name')
          .in('id', circleIds);
        
        circlesData = circlesList || [];
      }

      // Get album counts
      const { data: albumCounts, error: albumError } = await supabase
        .from('albums')
        .select('user_id');

      if (albumError) throw albumError;

      // Combine data
      const combinedUsers: User[] = authUsers.users.map(authUser => {
        const profile = profiles?.find(p => p.id === authUser.id);
        const userMemberships = memberships?.filter(m => m.user_id === authUser.id).map(membership => ({
          ...membership,
          circles: circlesData.find(circle => circle.id === membership.circle_id) || { id: membership.circle_id, name: 'Unknown Circle' }
        })) || [];
        const userAlbumCount = albumCounts?.filter(a => a.user_id === authUser.id).length || 0;

        return {
          id: authUser.id,
          email: authUser.email || profile?.email || null,
          full_name: profile?.full_name || null,
          date_created: profile?.date_created || authUser.created_at,
          date_modified: profile?.date_modified || authUser.updated_at || authUser.created_at,
          created_at: authUser.created_at,
          last_sign_in_at: authUser.last_sign_in_at,
          circle_memberships: userMemberships,
          album_count: userAlbumCount,
        };
      });

      setUsers(combinedUsers);
      setError(null); // Clear any previous errors on successful load
    } catch (err) {
      console.error('Error loading users:', err);
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data: authUsers, error } = await supabase.auth.admin.listUsers();
      if (error) throw error;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const totalUsers = authUsers.users.length;
      const activeUsers = authUsers.users.filter(u => u.last_sign_in_at).length;
      const recentUsers = authUsers.users.filter(u => 
        u.created_at && new Date(u.created_at) > thirtyDaysAgo
      ).length;

      setStats({
        total_users: totalUsers,
        active_users: activeUsers,
        users_last_30_days: recentUsers,
      });
    } catch (err) {
      console.error('Error loading stats:', err);
    }
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedUsers.map(user => (
              <tr key={user.id} className="hover:bg-gray-50">
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setSelectedUser(user)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      View
                    </button>
                  </div>
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
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedUser.full_name || 'Unnamed User'}
                  </h3>
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
                onClick={() => setSelectedUser(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

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
                        <div>
                          <span className="font-medium">{membership.circles.name}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(membership.role)}`}>
                            {membership.role.replace('_', ' ')}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(membership.status)}`}>
                            {membership.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};