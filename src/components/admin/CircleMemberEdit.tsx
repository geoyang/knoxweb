import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface CircleMember {
  id: string;
  email: string | null;
  role: string;
  status: string;
  date_invited: string;
  user_id: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

interface Circle {
  id: string;
  name: string;
  owner_id: string;
}

const ROLES = [
  { value: 'admin', label: 'Admin', description: 'Full management, invite members, edit albums', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'editor', label: 'Editor', description: 'Add/remove photos, set key photos, reorder', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'contributor', label: 'Contributor', description: 'Add photos and memories', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'read_only', label: 'Viewer', description: 'View only', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
];

export const CircleMemberEdit: React.FC = () => {
  const { circleId, memberId } = useParams<{ circleId: string; memberId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [circle, setCircle] = useState<Circle | null>(null);
  const [member, setMember] = useState<CircleMember | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');

  const action = searchParams.get('action');
  const requestedRole = searchParams.get('requested_role');

  useEffect(() => {
    loadData();
  }, [circleId, memberId]);

  const loadData = async () => {
    if (!circleId || !memberId) {
      setError('Invalid URL parameters');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }

      // Fetch member data via edge function
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-circles-api?circle_id=${circleId}&member_id=${memberId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to load member data');
        setLoading(false);
        return;
      }

      setCircle(data.circle);
      setMember(data.member);
      setSelectedRole(data.member.role);

    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load member data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRole = async () => {
    if (!member || !selectedRole) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Get session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }

      // Update role via edge function (PATCH method)
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-circles-api`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            member_id: member.id,
            role: selectedRole,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update role');
      }

      setSuccess(`Role updated to ${ROLES.find(r => r.value === selectedRole)?.label || selectedRole}`);
      setMember({ ...member, role: selectedRole });

      // Redirect after a short delay
      setTimeout(() => {
        navigate('/admin/circles');
      }, 2000);

    } catch (err) {
      console.error('Error updating role:', err);
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  const getRoleInfo = (role: string) => {
    return ROLES.find(r => r.value === role) || ROLES[3];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error && !member) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <div className="text-4xl mb-4">:(</div>
          <h2 className="text-xl font-semibold text-red-800 dark:text-red-400 mb-2">Error</h2>
          <p className="text-red-600 dark:text-red-300">{error}</p>
          <button
            onClick={() => navigate('/admin/circles')}
            className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-lg hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
          >
            Back to Circles
          </button>
        </div>
      </div>
    );
  }

  const memberName = member?.profiles?.full_name || member?.email || 'Unknown Member';
  const currentRoleInfo = getRoleInfo(member?.role || 'read_only');
  const requestedRoleInfo = requestedRole ? getRoleInfo(requestedRole) : null;

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/circles')}
          className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-2 mb-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Circles
        </button>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Change Member Role</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          {circle?.name}
        </p>
      </div>

      {/* Access Request Banner */}
      {action === 'change-role' && requestedRole && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="text-2xl">!</div>
            <div>
              <h3 className="font-semibold text-amber-800 dark:text-amber-400">Access Request</h3>
              <p className="text-amber-700 dark:text-amber-300 text-sm mt-1">
                <strong>{memberName}</strong> is requesting to upgrade their role from{' '}
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${currentRoleInfo.color}`}>
                  {currentRoleInfo.label}
                </span>
                {' '}to{' '}
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${requestedRoleInfo?.color}`}>
                  {requestedRoleInfo?.label}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Member Info Card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          {member?.profiles?.avatar_url ? (
            <img
              src={member.profiles.avatar_url}
              alt=""
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <span className="text-2xl font-semibold text-indigo-600 dark:text-indigo-400">
                {memberName[0].toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{memberName}</h2>
            {member?.profiles?.email && member.profiles.email !== member.email && (
              <p className="text-slate-500 dark:text-slate-400">{member.profiles.email}</p>
            )}
            {member?.email && (
              <p className="text-slate-500 dark:text-slate-400 text-sm">{member.email}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${currentRoleInfo.color}`}>
                Current: {currentRoleInfo.label}
              </span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                member?.status === 'accepted'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}>
                {member?.status}
              </span>
            </div>
          </div>
        </div>

        {/* Role Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Select New Role
          </label>
          <div className="space-y-2">
            {ROLES.map((role) => (
              <label
                key={role.value}
                className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedRole === role.value
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                } ${requestedRole === role.value ? 'ring-2 ring-amber-400' : ''}`}
              >
                <input
                  type="radio"
                  name="role"
                  value={role.value}
                  checked={selectedRole === role.value}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${role.color}`}>
                      {role.label}
                    </span>
                    {requestedRole === role.value && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        (Requested)
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{role.description}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  selectedRole === role.value
                    ? 'border-indigo-500 bg-indigo-500'
                    : 'border-slate-300 dark:border-slate-500'
                }`}>
                  {selectedRole === role.value && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
          <p className="text-green-600 dark:text-green-400">{success}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/admin/circles')}
          className="flex-1 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveRole}
          disabled={saving || selectedRole === member?.role}
          className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
            saving || selectedRole === member?.role
              ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </span>
          ) : selectedRole === member?.role ? (
            'No Changes'
          ) : (
            `Update to ${getRoleInfo(selectedRole).label}`
          )}
        </button>
      </div>
    </div>
  );
};

export default CircleMemberEdit;
