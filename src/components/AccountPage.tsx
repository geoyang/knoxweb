import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';

interface SubscriptionInfo {
  plan_name: string;
  status: string;
}

export const AccountPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, userProfile, signOut } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);

  useEffect(() => {
    const fetchSubscription = async () => {
      if (!user) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const response = await fetch(
          `${getSupabaseUrl()}/functions/v1/subscription-api?action=get_subscription`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          }
        );

        const data = await response.json();
        if (data.subscription) {
          setSubscription({
            plan_name: data.subscription.plan?.name || 'Unknown',
            status: data.subscription.status || 'unknown',
          });
        }
      } catch (error) {
        console.error('Failed to fetch subscription:', error);
      } finally {
        setLoadingSubscription(false);
      }
    };

    fetchSubscription();
  }, [user]);

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${getSupabaseUrl()}/functions/v1/delete-account`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete account');
      }

      alert('Your account and all data have been permanently deleted.');
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Delete account error:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete account. Please try again.');
    } finally {
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <h2 className="text-xl font-semibold mb-4">Please sign in</h2>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-gray-50 px-6 py-4 border-b">
            <h1 className="text-xl font-semibold text-gray-900">Account Settings</h1>
          </div>

          {/* User Info */}
          <div className="p-6 border-b">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                {userProfile?.avatar_url ? (
                  <img
                    src={userProfile.avatar_url}
                    alt="Avatar"
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <span className="text-2xl text-blue-600">
                    {userProfile?.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                  </span>
                )}
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">
                  {userProfile?.full_name || 'User'}
                </h2>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
            </div>
          </div>

          {/* Subscription Status */}
          <div className="p-6 border-b">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Subscription
            </h3>
            {loadingSubscription ? (
              <div className="flex items-center gap-2 text-gray-500">
                <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                Loading...
              </div>
            ) : subscription ? (
              <Link
                to="/subscription"
                className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group"
              >
                <div>
                  <p className="font-semibold text-gray-900 capitalize">
                    {subscription.plan_name} Plan
                  </p>
                  <p className="text-sm text-gray-500 capitalize">
                    Status: {subscription.status}
                  </p>
                </div>
                <span className="text-blue-600 group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </Link>
            ) : (
              <Link
                to="/subscription"
                className="flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group"
              >
                <div>
                  <p className="font-semibold text-blue-900">Choose a Plan</p>
                  <p className="text-sm text-blue-600">View available plans</p>
                </div>
                <span className="text-blue-600 group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </Link>
            )}
          </div>

          {/* Actions */}
          <div className="p-6 space-y-4">
            <button
              onClick={() => navigate('/admin')}
              className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors text-left flex items-center gap-3"
            >
              <span>←</span> Back to Dashboard
            </button>
          </div>

          {/* Danger Zone */}
          <div className="p-6 bg-red-50 border-t border-red-100">
            <h3 className="text-sm font-semibold text-red-800 mb-2">Danger Zone</h3>
            <p className="text-xs text-red-600 mb-4">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deletingAccount}
              className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition-colors"
            >
              {deletingAccount ? 'Deleting...' : 'Delete My Account'}
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full overflow-hidden">
            <div className="p-6">
              <div className="text-center mb-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Account</h3>
                <p className="text-sm text-gray-600 mb-4">
                  This action <span className="font-semibold text-red-600">CANNOT be undone</span>. All your data will be permanently deleted, including:
                </p>
              </div>

              <ul className="text-sm text-gray-700 space-y-2 mb-6 bg-red-50 p-4 rounded-lg">
                <li className="flex items-center gap-2">
                  <span className="text-red-500">•</span> All photos and videos
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-red-500">•</span> All albums and folders
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-red-500">•</span> All circles and shared content
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-red-500">•</span> Your profile and settings
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-red-500">•</span> Connected import sources
                </li>
              </ul>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deletingAccount}
                  className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {deletingAccount ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Yes, Delete Everything'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
