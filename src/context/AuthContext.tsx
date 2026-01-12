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
  verifyCode: (email: string, code: string) => Promise<{ error: any; success?: boolean; profile?: UserProfile | null }>;
  checkUserExists: (email: string) => Promise<{ exists: boolean; error?: any }>;
  signUp: (email: string) => Promise<{ error: any }>;
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

  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      // Add timeout to profile fetch to prevent hanging
      const { data: profile, error } = await Promise.race([
        supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url')
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
          avatar_url: null,
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
        avatar_url: null,
      };
    }
  };

  const fetchSuperAdminStatus = async (userId: string): Promise<boolean> => {
    try {
      console.log('Fetching super admin status for user:', userId);
      // Call the RPC function with timeout to prevent hanging
      const result = await Promise.race([
        supabase.rpc('is_current_user_superadmin'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Super admin check timeout')), 5000)
        )
      ]) as any;

      const { data, error } = result;

      if (error) {
        console.error('Error checking super admin status:', error);
        return false;
      }

      console.log('Super admin status from RPC:', data);
      return data === true;
    } catch (err) {
      console.error('Error fetching super admin status:', err);
      return false;
    }
  };

  useEffect(() => {
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
          const [profile, superAdminStatus] = await Promise.all([
            fetchUserProfile(session.user.id),
            fetchSuperAdminStatus(session.user.id)
          ]);

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
              // Still fetch super admin status
              const superAdminStatus = await fetchSuperAdminStatus(session.user.id);
              setIsSuperAdmin(superAdminStatus);
            } else {
              console.log('Fetching profile for user on auth change:', session.user.id);

              const [profile, superAdminStatus] = await Promise.all([
                fetchUserProfile(session.user.id),
                fetchSuperAdminStatus(session.user.id)
              ]);

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
      console.log('Sending verification code to email:', email);
      
      // Generate 4-digit code
      const code = TokenManager.generateVerificationCode();
      console.log('Generated verification code:', code);

      // Store the code temporarily (in production, this would be server-side)
      const codeData = {
        email: email.toLowerCase().trim(),
        code: code,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).getTime(), // 10 minutes
        attempts: 0,
      };
      
      // Store in sessionStorage for web
      sessionStorage.setItem('pendingVerification', JSON.stringify(codeData));
      
      // Send custom email with 4-digit code using Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('send-verification-code', {
        body: {
          email: email.toLowerCase().trim(),
          code: code,
          type: '4-digit'
        }
      });

      if (error) {
        console.error('Edge function failed', error);
        throw new Error('Failed to send verification code via Edge Function');
      }
      
      console.log('Verification code sent successfully');
      
      // In development, return the code for testing
      if (import.meta.env.DEV) {
        return { error: null, code };
      }
      
      return { error: null };
    } catch (err) {
      console.error('Verification code error', err);
      return { error: err };
    }
  };

  const verifyCode = async (email: string, code: string) => {
    try {
      console.log('Verifying code:', { email, code });
      
      // Verify against local storage
      const pendingData = sessionStorage.getItem('pendingVerification');
      
      if (!pendingData) {
        return { error: new Error('No verification code found. Please request a new code.') };
      }

      const localCode = JSON.parse(pendingData);
      
      // Check if code has expired
      if (Date.now() > localCode.expiresAt) {
        sessionStorage.removeItem('pendingVerification');
        return { error: new Error('Verification code has expired. Please request a new one.') };
      }

      // Check if email matches
      if (localCode.email !== email.toLowerCase().trim()) {
        return { error: new Error('Email mismatch. Please try again.') };
      }

      // Check if code matches
      if (localCode.code !== code.toUpperCase()) {
        localCode.attempts = (localCode.attempts || 0) + 1;
        
        if (localCode.attempts >= 3) {
          sessionStorage.removeItem('pendingVerification');
          return { error: new Error('Too many failed attempts. Please request a new code.') };
        }
        
        sessionStorage.setItem('pendingVerification', JSON.stringify(localCode));
        return { error: new Error(`Incorrect code. ${3 - localCode.attempts} attempts remaining.`) };
      }

      // Code is valid! Create session using Edge Function
      console.log('Code verification successful, creating session via Edge Function');
      
      // Clear the verification data
      sessionStorage.removeItem('pendingVerification');
      
      const { data: authResponse, error: authError } = await supabase.functions.invoke('create-session-with-code', {
        body: {
          email: email.toLowerCase().trim(),
          code: code.toUpperCase()
        }
      });

      if (authError || !authResponse?.success) {
        console.error('Auth via Edge Function failed', { authError, authResponse });
        return { error: new Error('Failed to create session. Please try again.') };
      }

      console.log('Auth Edge Function succeeded', authResponse);

      // Extract profile from edge function response
      const profileFromServer = authResponse.profile || null;
      if (profileFromServer) {
        console.log('Profile received from server:', profileFromServer);
        setUserProfile(profileFromServer);
        userProfileRef.current = profileFromServer.id;
      }

      // Handle the response from Edge Function - temp password approach (same as mobile app)
      if (authResponse.temp_auth?.temp_password) {
        // Got temporary password - sign in client-side to create proper session
        console.log('Received temporary credentials from Edge Function');

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: authResponse.temp_auth.email,
          password: authResponse.temp_auth.temp_password
        });

        if (signInError) {
          console.error('Error signing in with temporary password', signInError);
          return { error: new Error('Failed to sign in: ' + signInError.message) };
        }

        if (signInData.session && signInData.user) {
          console.log('Successfully authenticated');
          return { error: null, success: true, profile: profileFromServer };
        } else {
          return { error: new Error('Sign in succeeded but no session established.') };
        }

      } else if (authResponse.session?.access_token && authResponse.session?.refresh_token) {
        // Got direct session tokens - use them immediately
        console.log('Received session tokens from Edge Function');

        const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
          access_token: authResponse.session.access_token,
          refresh_token: authResponse.session.refresh_token
        });

        if (setSessionError) {
          console.error('Error setting session from Edge Function tokens', setSessionError);
          return { error: new Error('Failed to establish session with provided tokens.') };
        }

        if (sessionData.session && sessionData.user) {
          console.log('Successfully authenticated with direct session tokens');
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

  const signUp = async (email: string) => {
    try {
      console.log('Creating account for:', email);

      // Use Edge Function to create user account
      const { data: response, error } = await supabase.functions.invoke('create-user', {
        body: { email: email.toLowerCase().trim() }
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
    // Clear state immediately to prevent redirect loops
    setUser(null);
    setUserProfile(null);
    setSession(null);
    setIsSuperAdmin(false);
    userProfileRef.current = null;

    // Use global scope to invalidate tokens on all devices
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) throw error;
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