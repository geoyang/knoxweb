import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/adminApi';

interface PendingMember {
  circle_user_id: string;
  user_id: string | null;
  email: string;
  role: string;
  date_invited: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface CircleGroup {
  circle_id: string;
  circle_name: string;
  pending_with_accounts: PendingMember[];
  count: number;
}

const getRoleColor = (role: string) => {
  switch (role) {
    case 'admin': return 'bg-red-100 text-red-800';
    case 'editor': return 'bg-orange-100 text-orange-800';
    case 'contributor': return 'bg-green-100 text-green-800';
    case 'read_only': return 'bg-gray-100 text-gray-800';
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

export const PendingMembersManager: React.FC = () => {
  const [circles, setCircles] = useState<CircleGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null); // circle_id or 'all'
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await adminApi.getPendingWithAccounts();
      if (result.success && result.data) {
        setCircles(result.data.circles || []);
        setTotal(result.data.total || 0);
      } else {
        setError(result.error || 'Failed to load pending members');
      }
    } catch (err) {
      setError('Failed to load pending members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAccept = async (circleId?: string) => {
    const key = circleId || 'all';
    setAccepting(key);
    setSuccessMessage(null);
    try {
      const result = await adminApi.autoAcceptPending(circleId);
      if (result.success && result.data) {
        const count = result.data.accepted;
        setSuccessMessage(`Accepted ${count} member${count !== 1 ? 's' : ''}.`);
        await fetchData();
      } else {
        setError(result.error || 'Failed to accept members');
      }
    } catch {
      setError('Failed to accept members');
    } finally {
      setAccepting(null);
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
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Pending Members</h2>
        {circles.length > 0 && (
          <button
            onClick={() => handleAccept()}
            disabled={accepting !== null}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md font-medium transition-colors"
          >
            {accepting === 'all' ? 'Accepting...' : 'Accept All'}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
          {successMessage}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Pending with Accounts</p>
          <p className="text-2xl font-bold text-yellow-600">{total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Circles Affected</p>
          <p className="text-2xl font-bold text-gray-900">{circles.length}</p>
        </div>
      </div>

      {/* Grouped by circle */}
      {circles.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No pending members with accounts.
        </div>
      ) : (
        circles.map((group) => (
          <div key={group.circle_id} className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                {group.circle_name}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({group.count} pending)
                </span>
              </h3>
              <button
                onClick={() => handleAccept(group.circle_id)}
                disabled={accepting !== null}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition-colors disabled:opacity-50"
              >
                {accepting === group.circle_id ? 'Accepting...' : 'Accept'}
              </button>
            </div>
            <div className="divide-y">
              {group.pending_with_accounts.map((member) => (
                <div key={member.circle_user_id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                        {(member.full_name?.[0] || member.email[0]).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900 truncate">
                          {member.full_name || member.email}
                        </p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoleColor(member.role)}`}>
                          {formatRoleLabel(member.role)}
                        </span>
                      </div>
                      {member.full_name && (
                        <p className="text-sm text-gray-500 truncate">{member.email}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      Invited {formatDate(member.date_invited)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
