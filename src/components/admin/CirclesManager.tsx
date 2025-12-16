import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Circle {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  date_created: string;
  date_modified: string;
  is_active: boolean;
  profiles?: {
    full_name: string | null;
    email: string | null;
  };
}

interface CircleUser {
  id: string;
  email: string | null;
  role: string;
  status: string;
  date_invited: string;
  user_id: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
  };
}

export const CirclesManager: React.FC = () => {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null);
  const [circleUsers, setCircleUsers] = useState<CircleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewCircleForm, setShowNewCircleForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      loadCircles();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  const loadCircles = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // First, ensure the user has a profile
      if (user) {
        try {
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
              id: user.id,
              email: user.email,
              full_name: user.user_metadata?.full_name || null,
            }, {
              onConflict: 'id'
            });

          if (profileError) {
            console.warn('Profile upsert warning:', profileError);
          }
        } catch (profileErr) {
          console.warn('Profile upsert failed, continuing anyway:', profileErr);
        }
      }

      // Load circles first
      const { data: circlesData, error: circlesError } = await supabase
        .from('circles')
        .select('*')
        .eq('is_active', true)
        .order('date_created', { ascending: false });

      if (circlesError) throw circlesError;

      // Then load profiles for the owners
      let enrichedCircles = circlesData || [];
      if (circlesData && circlesData.length > 0) {
        const ownerIds = circlesData.map(circle => circle.owner_id);
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', ownerIds);

        if (profilesError) {
          console.warn('Error loading profiles:', profilesError);
        }

        // Merge profile data with circles
        enrichedCircles = circlesData.map(circle => ({
          ...circle,
          profiles: profilesData?.find(profile => profile.id === circle.owner_id) || null
        }));
      }

      setCircles(enrichedCircles);
      setError(null); // Clear any previous errors on successful load
    } catch (err) {
      console.error('Error loading circles:', err);
      setError(err instanceof Error ? err.message : 'Failed to load circles');
    } finally {
      setLoading(false);
    }
  };

  const loadCircleUsers = async (circleId: string) => {
    try {
      const { data, error } = await supabase
        .from('circle_users')
        .select(`
          *,
          profiles:user_id(full_name, email)
        `)
        .eq('circle_id', circleId)
        .order('date_invited', { ascending: false });

      if (error) throw error;
      setCircleUsers(data || []);
    } catch (err) {
      console.error('Error loading circle users:', err);
      // Don't set error for circle users as it's not critical
      console.warn('Circle users could not be loaded');
    }
  };

  const handleCircleSelect = async (circle: Circle) => {
    setSelectedCircle(circle);
    await loadCircleUsers(circle.id);
  };

  const handleCreateCircle = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    try {
      const { data, error } = await supabase
        .from('circles')
        .insert([
          {
            name: formData.get('name') as string,
            description: formData.get('description') as string || null,
            owner_id: user!.id,
          }
        ])
        .select()
        .single();

      if (error) throw error;

      setShowNewCircleForm(false);
      form.reset();
      await loadCircles();
    } catch (err) {
      console.error('Error creating circle:', err);
      alert(`Failed to create circle: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCircle) return;

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    try {
      const { data, error } = await supabase
        .from('circle_users')
        .insert([
          {
            circle_id: selectedCircle.id,
            email: formData.get('email') as string,
            role: formData.get('role') as string,
            invited_by: user!.id,
          }
        ])
        .select()
        .single();

      if (error) throw error;

      setShowInviteForm(false);
      form.reset();
      await loadCircleUsers(selectedCircle.id);
    } catch (err) {
      console.error('Error inviting user:', err);
      alert(`Failed to invite user: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

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
      case 'removed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const copyInviteLink = (inviteId: string) => {
    const link = `${window.location.origin}/album/${inviteId}`;
    navigator.clipboard.writeText(link);
    alert('Invite link copied to clipboard!');
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
        <h2 className="text-2xl font-bold text-gray-900">Circles Management</h2>
        <button
          onClick={() => setShowNewCircleForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
        >
          Create New Circle
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Circles List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold">Your Circles</h3>
          </div>
          <div className="divide-y">
            {circles.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No circles found. Create your first circle!
              </div>
            ) : (
              circles.map(circle => (
                <div
                  key={circle.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedCircle?.id === circle.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                  onClick={() => handleCircleSelect(circle)}
                >
                  <h4 className="font-semibold text-gray-900">{circle.name}</h4>
                  {circle.description && (
                    <p className="text-sm text-gray-600 mt-1">{circle.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Created {new Date(circle.date_created).toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Circle Details */}
        <div className="bg-white rounded-lg shadow">
          {selectedCircle ? (
            <>
              <div className="p-6 border-b">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold">{selectedCircle.name}</h3>
                    {selectedCircle.description && (
                      <p className="text-gray-600 mt-1">{selectedCircle.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setShowInviteForm(true)}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                  >
                    Invite User
                  </button>
                </div>
              </div>
              
              <div className="p-6">
                <h4 className="font-medium text-gray-900 mb-4">Members & Invitations</h4>
                <div className="space-y-3">
                  {circleUsers.length === 0 ? (
                    <p className="text-gray-500 text-sm">No members or pending invitations</p>
                  ) : (
                    circleUsers.map(member => (
                      <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-sm">
                            {member.profiles?.full_name || member.email}
                          </p>
                          {member.profiles?.email && member.profiles.email !== member.email && (
                            <p className="text-xs text-gray-500">{member.profiles.email}</p>
                          )}
                          {!member.user_id && member.email && (
                            <p className="text-xs text-gray-500">{member.email} (invited)</p>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(member.role)}`}>
                            {member.role.replace('_', ' ')}
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(member.status)}`}>
                            {member.status}
                          </span>
                          {member.status === 'pending' && member.role === 'read_only' && (
                            <button
                              onClick={() => copyInviteLink(member.id)}
                              className="text-blue-600 hover:text-blue-800 text-xs"
                              title="Copy invite link"
                            >
                              📋
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-gray-500">
              Select a circle to view details and manage members
            </div>
          )}
        </div>
      </div>

      {/* New Circle Modal */}
      {showNewCircleForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create New Circle</h3>
            <form onSubmit={handleCreateCircle} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Circle Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Family, Friends, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  name="description"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe what this circle is for..."
                />
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md font-medium transition-colors"
                >
                  Create Circle
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewCircleForm(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-md font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {showInviteForm && selectedCircle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Invite User to {selectedCircle.name}</h3>
            <form onSubmit={handleInviteUser} className="space-y-4">
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
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md font-medium transition-colors"
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