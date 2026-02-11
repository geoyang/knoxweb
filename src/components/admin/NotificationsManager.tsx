import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi, Notification } from '../../services/notificationsApi';
import { linksApi } from '../../services/linksApi';

type Tab = 'all' | 'unread' | 'link_requests';

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
      return { icon: 'fi-sr-comment', bgColor: 'notif-bg-blue', iconColor: 'notif-icon-blue' };
    case 'new_photos':
      return { icon: 'fi-sr-picture', bgColor: 'notif-bg-green', iconColor: 'notif-icon-green' };
    case 'new_members':
      return { icon: 'fi-sr-user-add', bgColor: 'notif-bg-purple', iconColor: 'notif-icon-purple' };
    case 'album_shared':
      return { icon: 'fi-sr-share', bgColor: 'notif-bg-orange', iconColor: 'notif-icon-orange' };
    case 'new_messages':
    case 'chat_message':
      return { icon: 'fi-sr-messages', bgColor: 'notif-bg-pink', iconColor: 'notif-icon-pink' };
    case 'friend_requests':
      return { icon: 'fi-sr-user-add', bgColor: 'notif-bg-emerald', iconColor: 'notif-icon-emerald' };
    case 'contact_activity':
      return { icon: 'fi-sr-address-book', bgColor: 'notif-bg-violet', iconColor: 'notif-icon-violet' };
    default:
      return { icon: 'fi-sr-bell', bgColor: 'bg-surface-elevated', iconColor: 'text-theme-secondary' };
  }
}

// Check if notification is an actionable link request
function isLinkRequestNotification(notification: Notification): boolean {
  return (notification.notification_type === 'friend_requests' || notification.notification_type === 'link_requests') &&
    (notification.title?.toLowerCase().includes('request') || notification.title?.toLowerCase().includes('connect')) &&
    !notification.title?.toLowerCase().includes('accepted');
}

export const NotificationsManager: React.FC = () => {
  const navigate = useNavigate();
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
      const [notifResult, countResult, linksResult] = await Promise.all([
        notificationsApi.getNotifications(1, 50),
        notificationsApi.getUnreadCount(),
        linksApi.getLinks('pending'),
      ]);

      if (notifResult.success && notifResult.data) {
        setNotifications(notifResult.data.notifications || []);
      }

      setUnreadCount(countResult);

      if (linksResult.success && linksResult.data) {
        // Only show incoming requests (not ones we sent)
        const incoming = (linksResult.data.links || []).filter(l => !l.is_requester);
        setPendingRequests(incoming);
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

  const handleAcceptRequest = async (linkId: string, notificationId?: string) => {
    setProcessingId(linkId);
    try {
      const result = await linksApi.accept(linkId);
      if (result.success) {
        setPendingRequests(prev => prev.filter(r => r.id !== linkId));
        if (notificationId) {
          handleMarkAsRead(notificationId);
        }
        loadNotifications();
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineRequest = async (linkId: string, notificationId?: string) => {
    setProcessingId(linkId);
    try {
      const result = await linksApi.decline(linkId);
      if (result.success) {
        setPendingRequests(prev => prev.filter(r => r.id !== linkId));
        if (notificationId) {
          handleDelete(notificationId);
        }
        loadNotifications();
      }
    } finally {
      setProcessingId(null);
    }
  };

  // Find pending link request for a notification's actor
  const findPendingRequest = (actorId?: string) => {
    if (!actorId) return null;
    return pendingRequests.find(r => r.other_user?.id === actorId);
  };

  const handleNotificationClick = (notification: Notification) => {
    if (isLinkRequestNotification(notification)) return;
    if (!notification.deep_link_type || !notification.deep_link_id) return;

    if (!notification.is_read) {
      handleMarkAsRead(notification.id);
    }

    const { deep_link_type, deep_link_id } = notification;
    const parts = deep_link_id.split(':');

    switch (deep_link_type) {
      case 'album': {
        const albumId = parts[0];
        const assetId = parts[1];
        const path = assetId
          ? `/admin/albums/${albumId}?assetId=${assetId}`
          : `/admin/albums/${albumId}`;
        navigate(path);
        break;
      }
      case 'conversation':
      case 'link_conversation': {
        const conversationId = parts[0];
        const messageId = parts[1];
        const params = new URLSearchParams({ conversationId });
        if (messageId) params.set('messageId', messageId);
        navigate(`/admin/chat?${params.toString()}`);
        break;
      }
      case 'memory':
      case 'asset': {
        const assetId = parts[0];
        navigate(`/admin/images?assetId=${assetId}`);
        break;
      }
      case 'circle':
        navigate('/admin/circles');
        break;
      default:
        break;
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'unread') return !n.is_read;
    if (activeTab === 'link_requests') return n.notification_type === 'friend_requests' || n.notification_type === 'link_requests';
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
          <h2 className="text-2xl font-bold text-theme-primary">Notifications</h2>
          <p className="text-theme-secondary">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="px-4 py-2 text-sm font-medium text-theme-accent hover:opacity-80"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-default">
        <div className="flex space-x-8">
          {(['all', 'unread', 'link_requests'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? 'border-primary text-theme-accent'
                  : 'border-transparent text-theme-secondary hover:text-theme-primary'
              }`}
            >
              {tab === 'all' && 'All'}
              {tab === 'unread' && `Unread (${unreadCount})`}
              {tab === 'link_requests' && `Link Requests (${pendingRequests.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="loading-spinner h-8 w-8"></div>
        </div>
      ) : error ? (
        <div className="text-center py-12 text-error">{error}</div>
      ) : filteredNotifications.length === 0 ? (
        <div className="text-center py-12">
          <i className="fi fi-sr-bell text-4xl text-theme-muted mb-4 block"></i>
          <p className="text-theme-secondary">No notifications</p>
        </div>
      ) : (
        <div className="bg-surface rounded-lg shadow divide-y divide-default">
          {filteredNotifications.map(notification => {
            const style = getNotificationStyle(notification.notification_type);
            const isLinkRequest = isLinkRequestNotification(notification);
            const pendingRequest = isLinkRequest ? findPendingRequest(notification.actor?.id) : null;

            const isClickable = !isLinkRequest && notification.deep_link_type && notification.deep_link_id;

            return (
              <div
                key={notification.id}
                className={`p-4 hover:bg-surface-hover transition-colors ${
                  !notification.is_read ? 'bg-primary-light' : ''
                } ${isClickable ? 'cursor-pointer' : ''}`}
                onClick={() => isClickable && handleNotificationClick(notification)}
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
                        <p className={`text-sm font-medium text-theme-primary ${
                          !notification.is_read ? 'font-semibold' : ''
                        }`}>
                          {notification.title}
                        </p>
                        <p className="text-sm text-theme-secondary mt-0.5">
                          {notification.body}
                        </p>
                        {notification.actor && (
                          <p className="text-xs text-theme-muted mt-1">
                            From {notification.actor.full_name}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-theme-muted flex-shrink-0">
                        {formatRelativeTime(notification.created_at)}
                      </span>
                    </div>

                    {/* Link Request Actions */}
                    {isLinkRequest && pendingRequest && (
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
                              className="px-3 py-1.5 text-sm font-medium text-theme-secondary bg-surface-elevated hover:bg-surface-hover rounded-lg transition-colors"
                            >
                              Decline
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Regular notification actions */}
                    {!isLinkRequest && (
                      <div className="flex items-center gap-3 mt-2" onClick={(e) => e.stopPropagation()}>
                        {!notification.is_read && (
                          <button
                            onClick={() => handleMarkAsRead(notification.id)}
                            className="text-xs text-theme-accent hover:opacity-80"
                          >
                            Mark as read
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(notification.id)}
                          className="text-xs text-theme-muted hover:text-error"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Unread indicator */}
                  {!notification.is_read && (
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2"></div>
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
