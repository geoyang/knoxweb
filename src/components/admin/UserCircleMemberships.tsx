import React, { useState } from 'react';
import { adminApi } from '../../services/adminApi';

interface Membership {
  id: string;
  role: string;
  status: string;
  circles: {
    id: string;
    name: string;
  };
}

interface Props {
  memberships: Membership[];
  userId: string;
  onMembershipChanged: () => void;
  getRoleColor: (role: string) => string;
  getStatusColor: (status: string) => string;
}

const ROLES = ['read_only', 'contributor', 'editor', 'admin'] as const;

export const UserCircleMemberships: React.FC<Props> = ({
  memberships,
  userId,
  onMembershipChanged,
  getRoleColor,
  getStatusColor,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStartEdit = (membership: Membership) => {
    setEditingId(membership.id);
    setEditRole(membership.role);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditRole('');
    setError(null);
  };

  const handleSaveRole = async (membershipId: string) => {
    setLoadingId(membershipId);
    setError(null);
    try {
      const result = await adminApi.updateMemberRole(membershipId, editRole);
      if (!result.success) {
        setError(result.error || 'Failed to update role');
        return;
      }
      setEditingId(null);
      onMembershipChanged();
    } catch {
      setError('Failed to update role');
    } finally {
      setLoadingId(null);
    }
  };

  const handleRemove = async (membershipId: string) => {
    setLoadingId(membershipId);
    setError(null);
    try {
      const result = await adminApi.removeMember(membershipId);
      if (!result.success) {
        setError(result.error || 'Failed to remove member');
        return;
      }
      setConfirmRemoveId(null);
      onMembershipChanged();
    } catch {
      setError('Failed to remove member');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div>
      <h4 className="font-semibold text-gray-900 mb-3">Circle Memberships</h4>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded mb-3">{error}</div>
      )}
      <div className="space-y-2">
        {memberships.map(membership => (
          <div key={membership.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex-1 min-w-0">
              <span className="font-medium">{membership.circles.name}</span>
            </div>
            <div className="flex items-center space-x-2">
              {editingId === membership.id ? (
                <>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="text-xs border border-gray-300 rounded px-2 py-1"
                    disabled={loadingId === membership.id}
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>{r.replace('_', ' ')}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleSaveRole(membership.id)}
                    disabled={loadingId === membership.id || editRole === membership.role}
                    className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loadingId === membership.id ? '...' : 'Save'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={loadingId === membership.id}
                    className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </>
              ) : confirmRemoveId === membership.id ? (
                <>
                  <span className="text-xs text-red-600">Remove?</span>
                  <button
                    onClick={() => handleRemove(membership.id)}
                    disabled={loadingId === membership.id}
                    className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    {loadingId === membership.id ? '...' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setConfirmRemoveId(null)}
                    disabled={loadingId === membership.id}
                    className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800"
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
                    onClick={() => handleStartEdit(membership)}
                    className="text-xs text-blue-600 hover:text-blue-800 ml-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmRemoveId(membership.id)}
                    className="text-xs text-red-600 hover:text-red-800"
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
  );
};
