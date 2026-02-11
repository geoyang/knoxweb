import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { linksApi, Link } from '../../services/linksApi';
import { moderationApi, BlockedUser } from '../../services/moderationApi';
import { chatApi } from '../../services/chatApi';

interface LinksManagerProps {
  userId: string;
  userName?: string;
  onClose?: () => void;
}

type Tab = 'links' | 'requests' | 'blocked';

export const LinksManager: React.FC<LinksManagerProps> = ({ userId, userName, onClose }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('links');
  const [links, setLinks] = useState<Link[]>([]);
  const [pendingLinks, setPendingLinks] = useState<Link[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dmLoading, setDmLoading] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [userId, activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      if (activeTab === 'links') {
        const result = await linksApi.getLinks('active');
        if (result.success && result.data) {
          setLinks(result.data.links || []);
        }
      } else if (activeTab === 'requests') {
        const result = await linksApi.getLinks('pending');
        if (result.success && result.data) {
          setPendingLinks(result.data.links || []);
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

  const handleAccept = async (linkId: string) => {
    setActionLoading(linkId);
    try {
      const result = await linksApi.accept(linkId);
      if (result.success) {
        loadData();
      } else {
        alert(result.error || 'Failed to accept');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (linkId: string) => {
    setActionLoading(linkId);
    try {
      const result = await linksApi.decline(linkId);
      if (result.success) {
        setPendingLinks(prev => prev.filter(l => l.id !== linkId));
      } else {
        alert(result.error || 'Failed to decline');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (linkId: string) => {
    setActionLoading(linkId);
    try {
      const result = await linksApi.cancel(linkId);
      if (result.success) {
        setPendingLinks(prev => prev.filter(l => l.id !== linkId));
      } else {
        alert(result.error || 'Failed to cancel');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (link: Link) => {
    if (!confirm(`Remove your link with ${link.other_user?.display_name || 'this user'}?`)) return;
    setActionLoading(link.id);
    try {
      const result = await linksApi.remove(link.id);
      if (result.success) {
        setLinks(prev => prev.filter(l => l.id !== link.id));
      } else {
        alert(result.error || 'Failed to remove');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartDM = async (link: Link) => {
    if (!link.conversation_id) return;
    setDmLoading(link.id);
    try {
      navigate(`/admin/chat?conversationId=${link.conversation_id}`);
    } finally {
      setDmLoading(null);
    }
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (error) {
      return <div className="p-4 text-center text-error">{error}</div>;
    }

    if (activeTab === 'links') {
      return links.length === 0 ? (
        <div className="p-8 text-center text-theme-muted">
          <i className="fi fi-sr-link-alt text-4xl mb-3 block"></i>
          <p>No links yet</p>
          <p className="text-sm mt-1">Connect with other Kizu users to start sharing</p>
        </div>
      ) : (
        <div className="divide-y divide-default">
          {links.map(link => (
            <div key={link.id} className="p-4 flex items-center gap-3 hover:bg-surface-hover transition-colors">
              <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0">
                {link.other_user?.avatar_url ? (
                  <img src={link.other_user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-theme-accent font-medium text-sm">{getInitials(link.other_user?.display_name || link.other_user?.email)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-theme-primary truncate">{link.other_user?.display_name || link.other_user?.email || 'Unknown'}</p>
                <div className="flex items-center gap-2 text-sm text-theme-secondary">
                  <span>{link.other_user?.email}</span>
                  {link.unread_count > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                      {link.unread_count}
                    </span>
                  )}
                  {link.is_muted && (
                    <span className="text-theme-muted text-xs">Muted</span>
                  )}
                </div>
                {link.last_message && (
                  <p className="text-xs text-theme-muted truncate mt-0.5">
                    {link.last_message.content}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {link.conversation_id && (
                  <button
                    onClick={() => handleStartDM(link)}
                    disabled={dmLoading === link.id}
                    className="p-2 text-theme-accent hover:bg-primary-light rounded-full transition-colors disabled:opacity-50"
                    title="Open chat"
                  >
                    <i className="fi fi-sr-messages text-sm"></i>
                  </button>
                )}
                <button
                  onClick={() => handleRemove(link)}
                  disabled={actionLoading === link.id}
                  className="p-2 text-theme-muted hover:text-error rounded-full transition-colors disabled:opacity-50"
                  title="Remove link"
                >
                  <i className="fi fi-sr-cross-small text-sm"></i>
                </button>
                <div className="text-right text-xs text-theme-muted">
                  <p>{formatDate(link.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'requests') {
      return pendingLinks.length === 0 ? (
        <div className="p-8 text-center text-theme-muted">
          <i className="fi fi-sr-time-forward text-4xl mb-3 block"></i>
          <p>No pending requests</p>
        </div>
      ) : (
        <div className="divide-y divide-default">
          {pendingLinks.map(link => (
            <div key={link.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                {link.other_user?.avatar_url ? (
                  <img src={link.other_user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="text-yellow-600 font-medium text-sm">
                    {getInitials(link.other_user?.display_name || link.other_user?.email)}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-theme-primary truncate">{link.other_user?.display_name || link.other_user?.email || 'Unknown'}</p>
                <p className="text-sm text-theme-secondary">{link.other_user?.email}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {actionLoading === link.id ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                ) : link.is_requester ? (
                  <button
                    onClick={() => handleCancel(link.id)}
                    className="px-3 py-1.5 text-sm font-medium text-theme-secondary bg-surface-elevated hover:bg-surface-hover rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleAccept(link.id)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleDecline(link.id)}
                      className="px-3 py-1.5 text-sm font-medium text-theme-secondary bg-surface-elevated hover:bg-surface-hover rounded-lg transition-colors"
                    >
                      Decline
                    </button>
                  </>
                )}
                <div className="text-right text-xs text-theme-muted ml-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    link.is_requester ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                  }`}>
                    {link.is_requester ? 'Sent' : 'Received'}
                  </span>
                  <p className="mt-1">{formatDate(link.created_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'blocked') {
      return blockedUsers.length === 0 ? (
        <div className="p-8 text-center text-theme-muted">
          <i className="fi fi-sr-ban text-4xl mb-3 block"></i>
          <p>No blocked users</p>
        </div>
      ) : (
        <div className="divide-y divide-default">
          {blockedUsers.map(block => (
            <div key={block.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <span className="text-red-600 font-medium text-sm">
                  {getInitials(block.blocked_user?.full_name)}
                </span>
              </div>
              <div className="flex-1">
                <p className="font-medium text-theme-primary">{block.blocked_user?.full_name}</p>
                <p className="text-sm text-theme-secondary">{block.blocked_user?.email}</p>
              </div>
              <div className="text-sm text-theme-muted">
                Blocked {formatDate(block.created_at)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  // Standalone page layout (no onClose = full page mode)
  if (!onClose) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-theme-primary">Links</h2>
            <p className="text-theme-secondary">Your 1-on-1 connections</p>
          </div>
        </div>

        <div className="bg-surface rounded-lg shadow">
          {/* Tabs */}
          <div className="border-b border-default">
            <div className="flex space-x-8 px-6">
              {(['links', 'requests', 'blocked'] as Tab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab
                      ? 'border-primary text-theme-accent'
                      : 'border-transparent text-theme-secondary hover:text-theme-primary'
                  }`}
                >
                  {tab === 'links' && `Active (${links.length})`}
                  {tab === 'requests' && `Requests (${pendingLinks.length})`}
                  {tab === 'blocked' && `Blocked (${blockedUsers.length})`}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[600px] overflow-y-auto">
            {renderContent()}
          </div>
        </div>
      </div>
    );
  }

  // Modal/embedded layout (with onClose)
  return (
    <div className="bg-surface rounded-lg shadow">
      <div className="p-6 border-b border-default flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-theme-primary">Links & Connections</h3>
          {userName && <p className="text-sm text-theme-secondary">{userName}</p>}
        </div>
        <button onClick={onClose} className="text-theme-muted hover:text-theme-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="border-b border-default flex">
        {(['links', 'requests', 'blocked'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-theme-accent border-b-2 border-primary'
                : 'text-theme-secondary hover:text-theme-primary'
            }`}
          >
            {tab === 'links' && `Links (${links.length})`}
            {tab === 'requests' && `Requests (${pendingLinks.length})`}
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
