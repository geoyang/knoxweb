import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  isSuperAdmin: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      // Add timeout to profile fetch to prevent hanging
      const { data: profile, error } = await Promise.race([
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', userId)
          .single(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
        )
      ]) as any;

      if (error) {
        console.warn('Error fetching user profile:', error);
        // Return default profile if we can't fetch it - don't treat as fatal error
        return {
          id: userId,
          full_name: null,
          email: null,
        };
      }

      return profile;
    } catch (err) {
      console.warn('Profile fetch timeout or error (using defaults):', err);
      // Return default profile on timeouts - don't block auth flow
      return {
        id: userId,
        full_name: null,
        email: null,
      };
    }
  };

  const fetchSuperAdminStatus = async (userId: string): Promise<boolean> => {
    try {
      // Try to fetch from auth.users table using admin API or RPC
      // For now, we'll check if the user object has the field
      const currentUser = user || session?.user;
      if (currentUser) {
        console.log('Checking super admin status for user:', currentUser);
        const superAdminField = (currentUser as any).is_super_admin;
        console.log('is_super_admin field from user object:', superAdminField);
        
        if (superAdminField !== undefined) {
          return superAdminField === true;
        }
      }
      
      // If not available in user object, try alternative approach
      // This might require an RPC function or Edge Function
      console.log('is_super_admin not available in user object, defaulting to false');
      return false;
    } catch (err) {
      console.error('Error fetching super admin status:', err);
      return false;
    }
  };

  useEffect(() => {
    // Add a timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      console.warn('Auth loading timeout reached, setting loading to false');
      console.warn('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
      console.warn('Supabase Key:', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Present' : 'Missing');
      setUser(null);
      setUserProfile(null);
      setSession(null);
      setIsSuperAdmin(false);
      setLoading(false);
    }, 5000); // Reduced to 5 seconds for faster debugging

    console.log('Starting auth session check...');
    console.log('Supabase client:', !!supabase);
    
    // Add immediate fallback if supabase client is not available
    if (!supabase) {
      console.error('Supabase client not initialized');
      clearTimeout(loadingTimeout);
      setLoading(false);
      return;
    }
    
    // Try to get session with graceful fallback
    const initializeAuth = async () => {
      try {
        const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getSession timeout')), 8000)
        )
      ]) as any;
      
      const { data: { session }, error } = sessionResult;
      console.log('getSession result:', { session: !!session, error });
      
      if (error) {
        console.error('getSession error:', error);
        // Don't throw, just treat as no session
        console.warn('Treating getSession error as no session');
        clearTimeout(loadingTimeout);
        setSession(null);
        setUser(null);
        setUserProfile(null);
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }
      
      clearTimeout(loadingTimeout);
      console.log('Auth session loaded:', !!session);
      setSession(session);
      setUser(session?.user || null);
    
      if (session?.user) {
        console.log('Fetching profile for user:', session.user.id);
        console.log('User object:', session.user);
        
        try {
          const [profile, superAdminStatus] = await Promise.all([
            fetchUserProfile(session.user.id),
            fetchSuperAdminStatus(session.user.id)
          ]);
          
          console.log('Profile fetched:', profile);
          console.log('Super admin status:', superAdminStatus);
          
          setUserProfile(profile);
          setIsSuperAdmin(superAdminStatus);
        } catch (profileErr) {
          console.warn('Error fetching profile, using defaults:', profileErr);
          setUserProfile(null);
          setIsSuperAdmin(false);
        }
      } else {
        console.log('No session user, setting profile to null');
        setUserProfile(null);
        setIsSuperAdmin(false);
      }
      
      console.log('Setting loading to false');
      setLoading(false);
      
    } catch (err) {
      clearTimeout(loadingTimeout);
      console.error('Error loading initial session:', err);
      console.warn('Falling back to no session state');
      setSession(null);
      setUser(null);
      setUserProfile(null);
      setIsSuperAdmin(false);
      setLoading(false);
    }
    };
    
    // Initialize auth
    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          console.log('Auth state change:', event, !!session);
          setSession(session);
          setUser(session?.user || null);
          
          if (session?.user) {
            console.log('Fetching profile for user on auth change:', session.user.id);
            
            const [profile, superAdminStatus] = await Promise.all([
              fetchUserProfile(session.user.id),
              fetchSuperAdminStatus(session.user.id)
            ]);
            
            console.log('Profile fetched on auth change:', profile);
            console.log('Super admin status on auth change:', superAdminStatus);
            
            setUserProfile(profile);
            setIsSuperAdmin(superAdminStatus);
          } else {
            console.log('No session user on auth change, setting profile to null');
            setUserProfile(null);
            setIsSuperAdmin(false);
          }
          
          setLoading(false);
        } catch (err) {
          console.error('Error in auth state change handler:', err);
          setUser(null);
          setUserProfile(null);
          setIsSuperAdmin(false);
          setLoading(false);
        }
      }
    );

    return () => {
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signInWithMagicLink = async (email: string) => {
    try {
      console.log('Sending magic link to email:', email);
      console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
      
      const { data, error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      
      if (error) {
        console.error('Supabase magic link error:', error);
        return { error };
      }
      
      console.log('Magic link sent successfully:', data);
      return { error: null };
    } catch (err) {
      console.error('Unexpected magic link error:', err);
      return { error: err };
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value: AuthContextType = {
    user,
    userProfile,
    session,
    loading,
    isSuperAdmin,
    signInWithMagicLink,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};