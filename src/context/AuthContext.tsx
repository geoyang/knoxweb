import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { TokenManager } from '../utils/tokenManager';

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url?: string | null;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  isSuperAdmin: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error: any }>;
  signInWithCode: (email: string) => Promise<{ error: any; code?: string }>;
  verifyCode: (email: string, code: string, fullName?: string) => Promise<{ error: any; success?: boolean; profile?: UserProfile | null }>;
  checkUserExists: (email: string) => Promise<{ exists: boolean; error?: any }>;
  signUp: (email: string, fullName?: string) => Promise<{ error: any }>;
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

  // Ref to track current profile ID for closure access in callbacks
  const userProfileRef = useRef<string | null>(null);

  const fetchUserProfile = async (userId: string): Promise<{ profile: UserProfile | null; isSuperAdmin: boolean }> => {
    try {
      // Get auth headers for API call
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        console.warn('No session for profile fetch');
        return { profile: { id: userId, full_name: null, email: null, avatar_url: null }, isSuperAdmin: false };
      }

      // Fetch profile via API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profiles-api`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      const data = await response.json();
      if (!response.ok || !data.success) {
        console.warn('Error fetching user profile via API:', data.error);
        return { profile: { id: userId, full_name: null, email: null, avatar_url: null }, isSuperAdmin: false };
      }

      return { profile: data.profile, isSuperAdmin: data.isSuperAdmin === true };
    } catch (err) {
      console.warn('Profile fetch timeout or error (using defaults):', err);
      return { profile: { id: userId, full_name: null, email: null, avatar_url: null }, isSuperAdmin: false };
    }
  };

  useEffect(() => {
    // Skip auth initialization on /subscription page - it handles its own auth from URL tokens
    // This prevents the slow getSession() from blocking/interfering with SubscriptionPage
    if (window.location.pathname === '/subscription') {
      console.log('Skipping AuthContext initialization on subscription page');
      setLoading(false);
      return;
    }

    // Track if we've received a valid session to prevent timeout from clearing it
    let hasReceivedSession = false;

    // Add a timeout to prevent infinite loading - but don't clear session if we have one
    const loadingTimeout = setTimeout(() => {
      console.warn('Auth loading timeout reached');
      if (!hasReceivedSession) {
        console.warn('No session received, clearing auth state');
        setUser(null);
        setUserProfile(null);
        setSession(null);
        setIsSuperAdmin(false);
      } else {
        console.warn('Session exists, keeping auth state');
      }
      setLoading(false);
    }, 5000);

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
      if (session) {
        hasReceivedSession = true;
      }
      setSession(session);
      setUser(session?.user || null);
    
      if (session?.user) {
        console.log('Fetching profile for user:', session.user.id);
        console.log('User object:', session.user);

        try {
          const { profile, isSuperAdmin: superAdminStatus } = await fetchUserProfile(session.user.id);

          console.log('Profile fetched:', profile);
          console.log('Super admin status:', superAdminStatus);

          setUserProfile(profile);
          userProfileRef.current = profile?.id || null;
          setIsSuperAdmin(superAdminStatus);
        } catch (profileErr) {
          console.warn('Error fetching profile, using defaults:', profileErr);
          setUserProfile(null);
          userProfileRef.current = null;
          setIsSuperAdmin(false);
        }
      } else {
        console.log('No session user, setting profile to null');
        setUserProfile(null);
        userProfileRef.current = null;
        setIsSuperAdmin(false);
      }
      
      console.log('Setting loading to false');
      setLoading(false);
      
    } catch (err) {
      clearTimeout(loadingTimeout);
      console.error('Error loading initial session:', err);
      // Only clear state if we haven't received a valid session from onAuthStateChange
      if (!hasReceivedSession) {
        console.warn('Falling back to no session state');
        setSession(null);
        setUser(null);
        setUserProfile(null);
        userProfileRef.current = null;
        setIsSuperAdmin(false);
      } else {
        console.warn('Session already received via onAuthStateChange, keeping state');
      }
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

          // Clear the loading timeout when we receive a valid session
          if (session) {
            hasReceivedSession = true;
            clearTimeout(loadingTimeout);
          }

          setSession(session);
          setUser(session?.user || null);

          if (session?.user) {
            // Skip profile fetch if we already have the profile for this user
            // (e.g., from edge function during code verification)
            const currentProfileId = userProfileRef.current;
            const shouldSkipProfileFetch = currentProfileId === session.user.id;

            if (shouldSkipProfileFetch) {
              console.log('Profile already loaded for user, skipping fetch:', session.user.id);
              // Fetch profile anyway to get super admin status (it's included in the response now)
              const { isSuperAdmin: superAdminStatus } = await fetchUserProfile(session.user.id);
              setIsSuperAdmin(superAdminStatus);
            } else {
              console.log('Fetching profile for user on auth change:', session.user.id);

              const { profile, isSuperAdmin: superAdminStatus } = await fetchUserProfile(session.user.id);

              console.log('Profile fetched on auth change:', profile);
              console.log('Super admin status on auth change:', superAdminStatus);

              setUserProfile(profile);
              userProfileRef.current = profile?.id || null;
              setIsSuperAdmin(superAdminStatus);
            }
          } else {
            console.log('No session user on auth change, setting profile to null');
            setUserProfile(null);
            userProfileRef.current = null;
            setIsSuperAdmin(false);
          }

          setLoading(false);
        } catch (err) {
          console.error('Error in auth state change handler:', err);
          setUser(null);
          setUserProfile(null);
          userProfileRef.current = null;
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

  const signInWithCode = async (email: string) => {
    try {
      console.log('Requesting verification code for email:', email);

      // Request verification code from server (code is generated server-side)
      const { data, error } = await supabase.functions.invoke('send-verification-code', {
        body: {
          email: email.toLowerCase().trim(),
          type: '4-digit'
        }
      });

      if (error) {
        console.error('Edge function failed', error);
        throw new Error('Failed to send verification code via Edge Function');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to send verification code');
      }

      console.log('Verification code sent successfully');

      // In development, return the code if provided for testing
      if (import.meta.env.DEV && data?.dev_code) {
        return { error: null, code: data.dev_code };
      }

      return { error: null };
    } catch (err) {
      console.error('Verification code error', err);
      return { error: err };
    }
  };

  const verifyCode = async (email: string, code: string, fullName?: string) => {
    try {
      console.log('🔐 VERIFY CODE: Starting server-side verification');
      console.log('Verifying code:', { email, code });

      // Verify code with server (server checks against stored code in user_metadata)
      const { data: authResponse, error: authError } = await supabase.functions.invoke('verify-code-auth', {
        body: {
          email: email.toLowerCase().trim(),
          code: code.toUpperCase()
        }
      });

      if (authError) {
        console.error('Server verification failed', authError);
        return { error: new Error('Verification failed. Please try again.') };
      }

      // Handle specific error responses
      if (!authResponse?.success) {
        const errorMsg = authResponse?.error || 'Verification failed';
        console.log('Server returned error:', { error: errorMsg, attemptsRemaining: authResponse?.attemptsRemaining });

        if (errorMsg.includes('expired')) {
          return { error: new Error('Verification code has expired. Please request a new one.') };
        } else if (errorMsg.includes('Too many')) {
          return { error: new Error('Too many failed attempts. Please request a new code.') };
        } else if (authResponse?.attemptsRemaining !== undefined) {
          return { error: new Error(`Incorrect code. ${authResponse.attemptsRemaining} attempts remaining.`) };
        } else {
          return { error: new Error(errorMsg) };
        }
      }

      console.log('Server verification succeeded', authResponse);

      // Extract profile from response if available
      const profileFromServer = authResponse.profile || null;
      if (profileFromServer) {
        console.log('Profile received from server:', profileFromServer);
        setUserProfile(profileFromServer);
        userProfileRef.current = profileFromServer.id;
      }

      // Handle the response - get session from magic link verification
      if (authResponse.session?.properties?.hashed_token) {
        const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: authResponse.session.properties.hashed_token,
          type: 'magiclink',
        });

        if (verifyError) {
          console.error('Magic link verification failed', verifyError);
          return { error: new Error('Failed to complete authentication.') };
        }

        if (verifyData.session && verifyData.user) {
          console.log('Successfully authenticated via magic link verification');
          return { error: null, success: true, profile: profileFromServer };
        }
      }

      // Alternative: server may return direct session tokens
      if (authResponse.session?.access_token && authResponse.session?.refresh_token) {
        console.log('Received session tokens from server');

        const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
          access_token: authResponse.session.access_token,
          refresh_token: authResponse.session.refresh_token
        });

        if (setSessionError) {
          console.error('Error setting session from tokens', setSessionError);
          return { error: new Error('Failed to establish session.') };
        }

        if (sessionData.session && sessionData.user) {
          console.log('Successfully authenticated with session tokens');
          return { error: null, success: true, profile: profileFromServer };
        } else {
          return { error: new Error('Token setting succeeded but no session established.') };
        }
      }

      return { error: new Error('Server error: No authentication credentials received.'), profile: profileFromServer };

    } catch (error) {
      console.error('Code verification exception', error);
      return { error: new Error('Verification failed. Please try again.') };
    }
  };

  const checkUserExists = async (email: string) => {
    try {
      // Use the Edge Function to check if user exists
      const { data: response, error } = await supabase.functions.invoke('check-user-exists', {
        body: { email: email.toLowerCase().trim() }
      });

      if (error) {
        console.error('Error checking user existence', error);
        return { exists: false, error };
      }

      return { exists: response?.exists || false };
    } catch (error) {
      console.error('Exception checking user existence', error);
      return { exists: false, error };
    }
  };

  const signUp = async (email: string, fullName?: string) => {
    try {
      console.log('Creating account for:', email, 'with name:', fullName);

      // Use Edge Function to create user account
      const { data: response, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: email.toLowerCase().trim(),
          full_name: fullName?.trim() || null
        }
      });

      if (error) {
        console.error('Error creating user account', error);
        return { error };
      }

      if (!response?.success) {
        return { error: new Error(response?.error || 'Failed to create account') };
      }

      console.log('Account created successfully');
      return { error: null };
    } catch (error) {
      console.error('Exception creating user account', error);
      return { error };
    }
  };

  const signOut = async () => {
    console.log('🔒 SIGN OUT: Starting sign out process...');
    console.log('🔒 SIGN OUT: Current session before sign out:', !!session);
    console.log('🔒 SIGN OUT: Current user before sign out:', user?.email);

    // Call signOut FIRST while we still have auth tokens
    // Use 'local' scope to only invalidate this device's session, not all devices
    console.log('🔒 SIGN OUT: Calling supabase.auth.signOut with scope: local...');
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });

      if (error) {
        console.error('🔒 SIGN OUT ERROR:', error);
      } else {
        console.log('🔒 SIGN OUT: Server signOut successful - this device only');
      }
    } catch (err) {
      console.error('🔒 SIGN OUT EXCEPTION:', err);
    }

    // Clear local state AFTER the API call
    setUser(null);
    setUserProfile(null);
    setSession(null);
    setIsSuperAdmin(false);
    userProfileRef.current = null;
    console.log('🔒 SIGN OUT: Local state cleared');

    // Force clear any Supabase session from localStorage as backup
    const storageKey = `sb-${import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`;
    console.log('🔒 SIGN OUT: Clearing localStorage key:', storageKey);
    localStorage.removeItem(storageKey);

    console.log('🔒 SIGN OUT: Complete');
  };

  const value: AuthContextType = {
    user,
    userProfile,
    session,
    loading,
    isSuperAdmin,
    signInWithMagicLink,
    signInWithCode,
    verifyCode,
    checkUserExists,
    signUp,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};