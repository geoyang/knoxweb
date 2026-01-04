import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CirclesManager } from './admin/CirclesManager';
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
        <span className="ml-1 inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin"></span>
      );
    }
    return <span className="ml-1 text-gray-400 text-sm">({count})</span>;
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
  
  console.log('AdminDashboard render:', { 
    loading, 
    hasUser: !!user, 
    isSuperAdmin, 
    currentPath: location.pathname 
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-2xl mr-3">📸</span>
              <h1 className="text-xl font-bold text-gray-900">Knox Admin</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Welcome, {userProfile?.full_name || user.email}
                {isSuperAdmin && (
                  <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">
                    Super Admin
                  </span>
                )}
              </span>
              <button
                onClick={() => setShowAccountScreen(true)}
                className="w-10 h-10 bg-blue-100 hover:bg-blue-200 rounded-full flex items-center justify-center transition-colors group overflow-hidden"
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
                  <span className="text-lg text-blue-600 group-hover:text-blue-700">
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
        <nav className="bg-white w-64 min-h-screen border-r shadow-sm">
          <div className="p-4">
            <ul className="space-y-2">
              <li>
                <Link
                  to="/admin/chat"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/chat')
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  <span className="mr-3">💬</span>
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
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  <span className="mr-3">📷</span>
                  Albums
                  {renderCount(counts.albums)}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/images"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/images')
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  <span className="mr-3">🖼️</span>
                  Media
                  {renderCount(counts.media)}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/folders"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/folders')
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  <span className="mr-3">📂</span>
                  Folders
                  {renderCount(counts.folders)}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/circles"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/circles')
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  <span className="mr-3">👥</span>
                  Circles
                  {renderCount(counts.circles)}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/contacts"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/contacts')
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  <span className="mr-3">📇</span>
                  Contacts
                  {renderCount(counts.contacts)}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin/invites"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/invites')
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  <span className="mr-3">📧</span>
                  Invitations
                  {renderCount(counts.invitations)}
                </Link>
              </li>
              {isSuperAdmin && (
                <>
                  <li>
                    <Link
                      to="/admin/users"
                      className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                        location.pathname.includes('/admin/users')
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      <span className="mr-3">👤</span>
                      Users
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/admin/push-test"
                      className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                        location.pathname.includes('/admin/push-test')
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      <span className="mr-3">🔔</span>
                      Push Test
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/admin/promo-codes"
                      className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                        location.pathname.includes('/admin/promo-codes')
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      <span className="mr-3">🎟️</span>
                      Promo Codes
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/admin/exports"
                      className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                        location.pathname.includes('/admin/exports')
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      <span className="mr-3">📦</span>
                      Exports
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-8">
          <Routes>
            <Route index element={<Navigate to="/admin/chat" replace />} />
            <Route path="folders" element={<FoldersManager />} />
            <Route path="albums" element={<AlbumsManager />} />
            <Route path="albums/:albumId" element={<AdminAlbumDetail />} />
            <Route path="images" element={<ImagesManager />} />
            <Route path="circles" element={<CirclesManager />} />
            <Route path="invites" element={<InvitesManager />} />
            <Route path="contacts" element={<ContactsManager />} />
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