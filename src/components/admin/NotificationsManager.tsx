import React, { useState, useEffect, useCallback } from 'react';
import { notificationsApi, Notification } from '../../services/notificationsApi';

type Tab = 'all' | 'unread' | 'friend_requests';

// Helper to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

// Get icon and color for notification type
function getNotificationStyle(type: string): { icon: string; bgColor: string; iconColor: string } {
  switch (type) {
    case 'new_comments':
      return { icon: 'fi-sr-comment', bgColor: 'bg-blue-100 dark:bg-blue-900/30', iconColor: 'text-blue-600 dark:text-blue-400' };
    case 'new_photos':
      return { icon: 'fi-sr-picture', bgColor: 'bg-green-100 dark:bg-green-900/30', iconColor: 'text-green-600 dark:text-green-400' };
    case 'new_members':
      return { icon: 'fi-sr-user-add', bgColor: 'bg-purple-100 dark:bg-purple-900/30', iconColor: 'text-purple-600 dark:text-purple-400' };
    case 'album_shared':
      return { icon: 'fi-sr-share', bgColor: 'bg-orange-100 dark:bg-orange-900/30', iconColor: 'text-orange-600 dark:text-orange-400' };
    case 'new_messages':
    case 'chat_message':
      return { icon: 'fi-sr-messages', bgColor: 'bg-pink-100 dark:bg-pink-900/30', iconColor: 'text-pink-600 dark:text-pink-400' };
    case 'friend_requests':
      return { icon: 'fi-sr-user-add', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30', iconColor: 'text-emerald-600 dark:text-emerald-400' };
    case 'contact_activity':
      return { icon: 'fi-sr-address-book', bgColor: 'bg-violet-100 dark:bg-violet-900/30', iconColor: 'text-violet-600 dark:text-violet-400' };
    default:
      return { icon: 'fi-sr-bell', bgColor: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-600 dark:text-slate-400' };
  }
}

// Check if notification is an actionable friend request
function isFriendRequestNotification(notification: Notification): boolean {
  return notification.notification_type === 'friend_requests' &&
    notification.title?.toLowerCase().includes('friend request') &&
    !notification.title?.toLowerCase().includes('accepted');
}

export const NotificationsManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [notifResult, countResult, requestsResult] = await Promise.all([
        notificationsApi.getNotifications(1, 50),
        notificationsApi.getUnreadCount(),
        notificationsApi.getPendingFriendRequests(),
      ]);

      if (notifResult.success && notifResult.data) {
        setNotifications(notifResult.data.notifications || []);
      }

      setUnreadCount(countResult);

      if (requestsResult.success && requestsResult.data) {
        setPendingRequests(requestsResult.data.requests || []);
      }
    } catch (err) {
      setError('Failed to load notifications');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotifications();
    // Refresh every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const handleMarkAsRead = async (id: string) => {
    await notificationsApi.markAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllAsRead = async () => {
    await notificationsApi.markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleDelete = async (id: string) => {
    await notificationsApi.deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleAcceptRequest = async (requestId: string, notificationId?: string) => {
    setProcessingId(requestId);
    try {
      const result = await notificationsApi.acceptFriendRequest(requestId);
      if (result.success) {
        setPendingRequests(prev => prev.filter(r => r.id !== requestId));
        if (notificationId) {
          handleMarkAsRead(notificationId);
        }
        loadNotifications();
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineRequest = async (requestId: string, notificationId?: string) => {
    setProcessingId(requestId);
    try {
      const result = await notificationsApi.declineFriendRequest(requestId);
      if (result.success) {
        setPendingRequests(prev => prev.filter(r => r.id !== requestId));
        if (notificationId) {
          handleDelete(notificationId);
        }
        loadNotifications();
      }
    } finally {
      setProcessingId(null);
    }
  };

  // Find pending request for a notification's actor
  const findPendingRequest = (actorId?: string) => {
    if (!actorId) return null;
    return pendingRequests.find(r => r.requester?.id === actorId || r.requester_id === actorId);
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'unread') return !n.is_read;
    if (activeTab === 'friend_requests') return n.notification_type === 'friend_requests';
    return true;
  });

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Notifications</h2>
          <p className="text-slate-500 dark:text-slate-400">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="flex space-x-8">
          {(['all', 'unread', 'friend_requests'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              {tab === 'all' && 'All'}
              {tab === 'unread' && `Unread (${unreadCount})`}
              {tab === 'friend_requests' && `Friend Requests (${pendingRequests.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400"></div>
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">{error}</div>
      ) : filteredNotifications.length === 0 ? (
        <div className="text-center py-12">
          <i className="fi fi-sr-bell text-4xl text-slate-300 dark:text-slate-600 mb-4 block"></i>
          <p className="text-slate-500 dark:text-slate-400">No notifications</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-800">
          {filteredNotifications.map(notification => {
            const style = getNotificationStyle(notification.notification_type);
            const isFriendRequest = isFriendRequestNotification(notification);
            const pendingRequest = isFriendRequest ? findPendingRequest(notification.actor?.id) : null;

            return (
              <div
                key={notification.id}
                className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                  !notification.is_read ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-full ${style.bgColor} flex items-center justify-center flex-shrink-0`}>
                    {notification.actor?.avatar_url ? (
                      <img
                        src={notification.actor.avatar_url}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <i className={`fi ${style.icon} ${style.iconColor}`}></i>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`text-sm font-medium text-slate-900 dark:text-slate-100 ${
                          !notification.is_read ? 'font-semibold' : ''
                        }`}>
                          {notification.title}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                          {notification.body}
                        </p>
                        {notification.actor && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            From {notification.actor.full_name}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
                        {formatRelativeTime(notification.created_at)}
                      </span>
                    </div>

                    {/* Friend Request Actions */}
                    {isFriendRequest && pendingRequest && (
                      <div className="flex items-center gap-2 mt-3">
                        {processingId === pendingRequest.id ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600"></div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleAcceptRequest(pendingRequest.id, notification.id)}
                              className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1"
                            >
                              <i className="fi fi-sr-check text-xs"></i>
                              Accept
                            </button>
                            <button
                              onClick={() => handleDeclineRequest(pendingRequest.id, notification.id)}
                              className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                              Decline
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Regular notification actions */}
                    {!isFriendRequest && (
                      <div className="flex items-center gap-3 mt-2">
                        {!notification.is_read && (
                          <button
                            onClick={() => handleMarkAsRead(notification.id)}
                            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                          >
                            Mark as read
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(notification.id)}
                          className="text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Unread indicator */}
                  {!notification.is_read && (
                    <div className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 flex-shrink-0 mt-2"></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
