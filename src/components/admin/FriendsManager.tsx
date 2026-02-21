import React, { useState, useEffect } from 'react';
import { friendsApi, Friend, FriendRequest } from '../../services/friendsApi';
import { moderationApi, BlockedUser } from '../../services/moderationApi';
import { isPlaceholderEmail } from '../../utils/phoneDisplayUtils';

interface FriendsManagerProps {
  userId: string;
  userName?: string;
  onClose?: () => void;
}

type Tab = 'friends' | 'requests' | 'blocked';

export const FriendsManager: React.FC<FriendsManagerProps> = ({ userId, userName, onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [userId, activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'friends') {
        const result = await friendsApi.getUserFriends(userId);
        if (result.success && result.data) {
          setFriends(result.data.friends || []);
        }
      } else if (activeTab === 'requests') {
        const result = await friendsApi.getUserRequests(userId);
        if (result.success && result.data) {
          setRequests(result.data.requests || []);
        }
      } else if (activeTab === 'blocked') {
        const result = await moderationApi.getUserBlocks(userId);
        if (result.success && result.data) {
          setBlockedUsers(result.data.blocks || []);
        }
      }
    } catch (err) {
      setError('Failed to load data');
    }

    setLoading(false);
  };

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (error) {
      return <div className="p-4 text-center text-red-500">{error}</div>;
    }

    if (activeTab === 'friends') {
      return friends.length === 0 ? (
        <div className="p-6 text-center text-gray-500">No friends yet</div>
      ) : (
        <div className="divide-y">
          {friends.map(friend => (
            <div key={friend.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                {friend.avatarUrl ? (
                  <img src={friend.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-blue-600 font-medium text-sm">{getInitials(friend.fullName)}</span>
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{friend.fullName}</p>
                {!isPlaceholderEmail(friend.email) && <p className="text-sm text-gray-500">{friend.email}</p>}
              </div>
              <div className="text-right text-sm text-gray-400">
                <p>Friends since</p>
                <p>{formatDate(friend.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'requests') {
      return requests.length === 0 ? (
        <div className="p-6 text-center text-gray-500">No pending requests</div>
      ) : (
        <div className="divide-y">
          {requests.map(request => {
            const isSent = request.requesterId === userId;
            const otherUser = isSent ? request.recipient : request.requester;
            return (
              <div key={request.id} className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <span className="text-yellow-600 font-medium text-sm">
                    {getInitials(otherUser?.fullName)}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{otherUser?.fullName}</p>
                  {!isPlaceholderEmail(otherUser?.email) && <p className="text-sm text-gray-500">{otherUser?.email}</p>}
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    isSent ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {isSent ? 'Sent' : 'Received'}
                  </span>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(request.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (activeTab === 'blocked') {
      return blockedUsers.length === 0 ? (
        <div className="p-6 text-center text-gray-500">No blocked users</div>
      ) : (
        <div className="divide-y">
          {blockedUsers.map(block => (
            <div key={block.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <span className="text-red-600 font-medium text-sm">
                  {getInitials(block.blocked_user?.full_name)}
                </span>
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{block.blocked_user?.full_name}</p>
                {!isPlaceholderEmail(block.blocked_user?.email) && <p className="text-sm text-gray-500">{block.blocked_user?.email}</p>}
              </div>
              <div className="text-sm text-gray-400">
                Blocked {formatDate(block.created_at)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Friends & Connections</h3>
          {userName && <p className="text-sm text-gray-500">{userName}</p>}
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b flex">
        {(['friends', 'requests', 'blocked'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'friends' && `Friends (${friends.length})`}
            {tab === 'requests' && `Requests (${requests.length})`}
            {tab === 'blocked' && `Blocked (${blockedUsers.length})`}
          </button>
        ))}
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  );
};
