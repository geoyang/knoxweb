import React, { useState } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CirclesManager } from './admin/CirclesManager';
import { AlbumsManager } from './admin/AlbumsManager';
import { AdminAlbumDetail } from './admin/AdminAlbumDetail';
import { ImagesManager } from './admin/ImagesManager';
import { UsersManager } from './admin/UsersManager';
import { InvitesManager } from './admin/InvitesManager';
import { ContactsManager } from './admin/ContactsManager';
import { AccountScreen } from './admin/AccountScreen';
import PushNotificationTest from './admin/PushNotificationTest';

export const AdminDashboard: React.FC = () => {
  const { user, userProfile, signOut, loading, isSuperAdmin } = useAuth();
  const location = useLocation();
  const [showAccountScreen, setShowAccountScreen] = useState(false);
  
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
                  to="/admin/albums"
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    location.pathname.includes('/admin/albums')
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  <span className="mr-3">📁</span>
                  Albums
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
                  My Images and Videos
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
                </>
              )}
            </ul>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-8">
          <Routes>
            <Route index element={<Navigate to="/admin/albums" replace />} />
            <Route path="albums" element={<AlbumsManager />} />
            <Route path="albums/:albumId" element={<AdminAlbumDetail />} />
            <Route path="images" element={<ImagesManager />} />
            <Route path="circles" element={<CirclesManager />} />
            <Route path="invites" element={<InvitesManager />} />
            <Route path="contacts" element={<ContactsManager />} />
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