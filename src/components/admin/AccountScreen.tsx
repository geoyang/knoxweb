import React from 'react';
import { useAuth } from '../../context/AuthContext';

interface AccountScreenProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountScreen: React.FC<AccountScreenProps> = ({ isOpen, onClose }) => {
  const { user, signOut, isSuperAdmin } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      onClose();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Account Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Profile Section */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-blue-600">
                {user?.email?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {user?.email || 'Unknown User'}
            </h3>
            {isSuperAdmin && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                Super Admin
              </span>
            )}
          </div>

          {/* Account Information */}
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Account Information</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                  <span className="text-sm text-gray-600">Email</span>
                  <span className="text-sm font-medium text-gray-900">{user?.email}</span>
                </div>
                <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                  <span className="text-sm text-gray-600">User ID</span>
                  <span className="text-xs font-mono text-gray-500">{user?.id}</span>
                </div>
                <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                  <span className="text-sm text-gray-600">Account Type</span>
                  <span className="text-sm font-medium text-gray-900">
                    {isSuperAdmin ? 'Super Admin' : 'User'}
                  </span>
                </div>
                {user?.user_metadata?.last_sign_in_at && (
                  <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                    <span className="text-sm text-gray-600">Last Sign In</span>
                    <span className="text-sm text-gray-500">
                      {new Date(user.user_metadata.last_sign_in_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Knox Statistics */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Knox Statistics</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center py-3 px-2 bg-blue-50 rounded-md">
                  <div className="text-lg font-semibold text-blue-600">--</div>
                  <div className="text-xs text-gray-600">Albums</div>
                </div>
                <div className="text-center py-3 px-2 bg-green-50 rounded-md">
                  <div className="text-lg font-semibold text-green-600">--</div>
                  <div className="text-xs text-gray-600">Photos</div>
                </div>
                <div className="text-center py-3 px-2 bg-purple-50 rounded-md">
                  <div className="text-lg font-semibold text-purple-600">--</div>
                  <div className="text-xs text-gray-600">Circles</div>
                </div>
                <div className="text-center py-3 px-2 bg-orange-50 rounded-md">
                  <div className="text-lg font-semibold text-orange-600">--</div>
                  <div className="text-xs text-gray-600">Shared</div>
                </div>
              </div>
            </div>

            {/* App Information */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Application</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                  <span className="text-sm text-gray-600">Version</span>
                  <span className="text-sm text-gray-500">Knox Web v1.0.0</span>
                </div>
                <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                  <span className="text-sm text-gray-600">Environment</span>
                  <span className="text-sm text-gray-500">
                    {import.meta.env.MODE === 'development' ? 'Development' : 'Production'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex flex-col gap-3">
          <button
            onClick={() => {
              // TODO: Implement account settings
              alert('Account settings coming soon!');
            }}
            className="w-full px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-sm font-medium"
          >
            Account Settings
          </button>
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-sm font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};