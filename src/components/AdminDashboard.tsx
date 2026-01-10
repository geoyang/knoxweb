import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CirclesManager } from './admin/CirclesManager';
import { CircleMemberEdit } from './admin/CircleMemberEdit';
import { AlbumsManager } from './admin/AlbumsManager';
import { AdminAlbumDetail } from './admin/AdminAlbumDetail';
import { ImagesManager } from './admin/ImagesManager';
import { UsersManager } from './admin/UsersManager';
import { InvitesManager } from './admin/InvitesManager';
import { ContactsManager } from './admin/ContactsManager';
import { ChatManager } from './admin/ChatManager';
import { AccountScreen } from './admin/AccountScreen';
import { FoldersManager } from './admin/FoldersManager';
import PushNotificationTest from './admin/PushNotificationTest';
import { PromoCodesManager } from './admin/PromoCodesManager';
import { ExportManager } from './admin/ExportManager';
import { ImportManager } from './admin/ImportManager';
import { NotificationsManager } from './admin/NotificationsManager';
import { notificationsApi } from '../services/notificationsApi';
import { AIProcessingManager } from './admin/ai';
import { ThemeToggle } from './ui/ThemeToggle';
import { chatApi } from '../services/chatApi';
import { adminApi } from '../services/adminApi';
import { getFolders } from '../services/foldersApi';
import { contactsApi } from '../services/contactsApi';

export const AdminDashboard: React.FC = () => {
  const { user, userProfile, signOut, loading, isSuperAdmin } = useAuth();
  const location = useLocation();
  const [showAccountScreen, setShowAccountScreen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [totalChatCount, setTotalChatCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  // Tab counts
  const [countsLoading, setCountsLoading] = useState(true);
  const [counts, setCounts] = useState({
    albums: 0,
    media: 0,
    folders: 0,
    circles: 0,
    contacts: 0,
    invitations: 0,
  });

  // Fetch all counts
  useEffect(() => {
    const fetchCounts = async () => {
      if (!user) return;

      setCountsLoading(true);
      try {
        // Fetch all counts in parallel
        const [albumsRes, imagesRes, circlesRes, invitationsRes, foldersRes, contactsRes, chatRes] = await Promise.all([
          adminApi.getAlbums(),
          adminApi.getImages(),
          adminApi.getCircles(),
          adminApi.getInvitations(),
          getFolders(),
          contactsApi.getContacts(),
          chatApi.getConversations(),
        ]);

        setCounts({
          albums: albumsRes.success && albumsRes.data ? albumsRes.data.count || albumsRes.data.albums?.length || 0 : 0,
          media: imagesRes.success && imagesRes.data ? imagesRes.data.count || imagesRes.data.assets?.length || 0 : 0,
          folders: foldersRes.count || foldersRes.folders?.length || 0,
          circles: circlesRes.success && circlesRes.data ? circlesRes.data.count || circlesRes.data.circles?.length || 0 : 0,
          contacts: contactsRes.pagination?.total || contactsRes.contacts?.length || 0,
          invitations: invitationsRes.success && invitationsRes.data ? invitationsRes.data.count || invitationsRes.data.invitations?.length || 0 : 0,
        });

        // Set chat count
        if (chatRes.success && chatRes.data) {
          setTotalChatCount(chatRes.data.conversations?.length || 0);
        }
      } catch (error) {
        console.error('Error fetching counts:', error);
      } finally {
        setCountsLoading(false);
      }
    };

    fetchCounts();
  }, [user]);

  // Helper to render count or loading spinner
  const renderCount = (count: number) => {
    if (countsLoading) {
      return (
        <span className="ml-1 inline-block w-4 h-4 border-2 loading-spinner rounded-full animate-spin"></span>
      );
    }
    return <span className="ml-1 text-theme-muted text-sm">({count})</span>;
  };

  // Fetch unread chat count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      if (user) {
        const count = await chatApi.getTotalUnreadCount();
        setUnreadChatCount(count);
      }
    };

    fetchUnreadCount();
    // Refresh every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Fetch unread notification count
  useEffect(() => {
    const fetchNotificationCount = async () => {
      if (user) {
        const count = await notificationsApi.getUnreadCount();
        setUnreadNotificationCount(count);
      }
    };

    fetchNotificationCount();
    // Refresh every 30 seconds
    const interval = setInterval(fetchNotificationCount, 30000);
    return () => clearInterval(interval);
  }, [user]);
  
  console.log('AdminDashboard render:', { 
    loading, 
    hasUser: !!user, 
    isSuperAdmin, 
    currentPath: location.pathname 
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-theme-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-app">
      {/* Header */}
      <header className="bg-surface shadow-sm border-b border-default">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-2xl mr-3">📸</span>
              <h1 className="text-xl font-bold text-theme-primary">Knox Admin</h1>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-theme-secondary">
                Welcome, {userProfile?.full_name || user.email}
                {isSuperAdmin && (
                  <span className="ml-2 px-2 py-1 badge-admin text-xs rounded-full font-medium">
                    Super Admin
                  </span>
                )}
              </span>
              <ThemeToggle size="sm" />
              <button
                onClick={() => setShowAccountScreen(true)}
                className="w-10 h-10 avatar-btn"
                title="Account Settings"
              >
                {userProfile?.avatar_url ? (
                  <img
                    src={userProfile.avatar_url}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Hide image on error and show fallback
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="text-lg text-theme-accent">
                    {userProfile?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <nav className="bg-surface w-64 min-h-screen border-r border-default shadow-sm">
          <div className="p-4">
            <ul className="space-y-2">
              <li>
                <Link
                  to="/admin/notifications"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/notifications')
                      ? 'bg-primary-light text-theme-accent font-medium'
                      : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                  }`}
                >
                  <i className="fi fi-sr-bell mr-3 text-lg"></i>
                  Notifications
                  {unreadNotificationCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </span>
                  )}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/chat"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/chat')
                      ? 'bg-primary-light text-theme-accent font-medium'
                      : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                  }`}
                >
                  <i className="fi fi-sr-messages mr-3 text-lg"></i>
                  Chats
                  {renderCount(totalChatCount)}
                  {unreadChatCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {unreadChatCount > 99 ? '99+' : unreadChatCount}
                    </span>
                  )}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/albums"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/albums')
                      ? 'bg-primary-light text-theme-accent font-medium'
                      : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                  }`}
                >
                  <i className="fi fi-sr-picture mr-3 text-lg"></i>
                  Albums
                  {renderCount(counts.albums)}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/images"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/images')
                      ? 'bg-primary-light text-theme-accent font-medium'
                      : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                  }`}
                >
                  <i className="fi fi-sr-gallery mr-3 text-lg"></i>
                  Media
                  {renderCount(counts.media)}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/folders"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/folders')
                      ? 'bg-primary-light text-theme-accent font-medium'
                      : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                  }`}
                >
                  <i className="fi fi-sr-folder mr-3 text-lg"></i>
                  Folders
                  {renderCount(counts.folders)}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/circles"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/circles')
                      ? 'bg-primary-light text-theme-accent font-medium'
                      : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                  }`}
                >
                  <i className="fi fi-sr-users mr-3 text-lg"></i>
                  Circles
                  {renderCount(counts.circles)}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/contacts"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/contacts')
                      ? 'bg-primary-light text-theme-accent font-medium'
                      : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                  }`}
                >
                  <i className="fi fi-sr-address-book mr-3 text-lg"></i>
                  Contacts
                  {renderCount(counts.contacts)}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/invites"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/invites')
                      ? 'bg-primary-light text-theme-accent font-medium'
                      : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                  }`}
                >
                  <i className="fi fi-sr-envelope mr-3 text-lg"></i>
                  Invitations
                  {renderCount(counts.invitations)}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/import"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/import')
                      ? 'bg-primary-light text-theme-accent font-medium'
                      : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                  }`}
                >
                  <i className="fi fi-sr-inbox-in mr-3 text-lg"></i>
                  Import
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/ai-processing"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/ai-processing')
                      ? 'bg-primary-light text-theme-accent font-medium'
                      : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                  }`}
                >
                  <i className="fi fi-sr-microchip-ai mr-3 text-lg"></i>
                  AI Processing
                </Link>
              </li>
              {isSuperAdmin && (
                <>
                  <li>
                    <Link
                      to="/admin/users"
                      className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                        location.pathname.includes('/admin/users')
                          ? 'bg-primary-light text-theme-accent font-medium'
                          : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                      }`}
                    >
                      <i className="fi fi-sr-user mr-3 text-lg"></i>
                      Users
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/admin/push-test"
                      className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                        location.pathname.includes('/admin/push-test')
                          ? 'bg-primary-light text-theme-accent font-medium'
                          : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                      }`}
                    >
                      <i className="fi fi-sr-bell mr-3 text-lg"></i>
                      Push Test
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/admin/promo-codes"
                      className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                        location.pathname.includes('/admin/promo-codes')
                          ? 'bg-primary-light text-theme-accent font-medium'
                          : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                      }`}
                    >
                      <i className="fi fi-sr-ticket mr-3 text-lg"></i>
                      Promo Codes
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/admin/exports"
                      className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                        location.pathname.includes('/admin/exports')
                          ? 'bg-primary-light text-theme-accent font-medium'
                          : 'text-theme-secondary hover:bg-primary-light hover:text-theme-accent'
                      }`}
                    >
                      <i className="fi fi-sr-box mr-3 text-lg"></i>
                      Exports
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-8 bg-app">
          <Routes>
            <Route index element={<Navigate to="/admin/notifications" replace />} />
            <Route path="notifications" element={<NotificationsManager />} />
            <Route path="folders" element={<FoldersManager />} />
            <Route path="albums" element={<AlbumsManager />} />
            <Route path="albums/:albumId" element={<AdminAlbumDetail />} />
            <Route path="images" element={<ImagesManager />} />
            <Route path="circles" element={<CirclesManager />} />
            <Route path="circles/:circleId/members/:memberId" element={<CircleMemberEdit />} />
            <Route path="invites" element={<InvitesManager />} />
            <Route path="contacts" element={<ContactsManager />} />
            <Route path="import" element={<ImportManager />} />
            <Route path="ai-processing" element={<AIProcessingManager />} />
            <Route path="chat" element={<ChatManager />} />
            <Route
              path="users"
              element={
                isSuperAdmin ? (
                  <UsersManager />
                ) : (
                  <Navigate to="/admin/albums" replace />
                )
              }
            />
            <Route
              path="push-test"
              element={
                isSuperAdmin ? (
                  <PushNotificationTest />
                ) : (
                  <Navigate to="/admin/albums" replace />
                )
              }
            />
            <Route
              path="promo-codes"
              element={
                isSuperAdmin ? (
                  <PromoCodesManager />
                ) : (
                  <Navigate to="/admin/albums" replace />
                )
              }
            />
            <Route
              path="exports"
              element={
                isSuperAdmin ? (
                  <ExportManager />
                ) : (
                  <Navigate to="/admin/albums" replace />
                )
              }
            />
          </Routes>
        </main>
      </div>

      {/* Account Screen Modal */}
      <AccountScreen 
        isOpen={showAccountScreen} 
        onClose={() => setShowAccountScreen(false)} 
      />
    </div>
  );
};