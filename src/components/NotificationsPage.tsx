import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSupabaseUrl, getSupabaseAnonKey } from '../lib/environments';
import { NotificationsManager } from './admin/NotificationsManager';
import { getDisplayIdentifier } from '../utils/phoneDisplayUtils';

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
}

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { signOut, session, loading: authLoading } = useAuth();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!session) {
        navigate('/login');
        return;
      }
      loadProfile();
    }
  }, [authLoading, session]);

  const loadProfile = async () => {
    if (!session) return;

    try {
      const res = await fetch(
        `${getSupabaseUrl()}/functions/v1/profiles-api`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': getSupabaseAnonKey(),
          },
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.profile);
      } else {
        setUser({
          id: session.user.id,
          full_name: session.user.user_metadata?.full_name || 'User',
          email: session.user.email || '',
        });
      }
    } catch {
      setUser({
        id: session.user.id,
        full_name: session.user.user_metadata?.full_name || 'User',
        email: session.user.email || '',
      });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch {
      navigate('/login');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📸</span>
            <h1 className="text-xl font-bold text-gray-800">Kizu</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium text-gray-800">{user?.full_name}</p>
              <p className="text-sm text-gray-500">{getDisplayIdentifier(user?.email)}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <NotificationsManager />
      </main>
    </div>
  );
};
