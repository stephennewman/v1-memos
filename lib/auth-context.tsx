import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { makeRedirectUri } from 'expo-auth-session';

// Free tier limit
const MAX_FREE_TOPICS = 5;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  topicCount: number;
  canCreateTopic: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshTopicCount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [topicCount, setTopicCount] = useState(0);

  const canCreateTopic = topicCount < MAX_FREE_TOPICS;

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[Auth] Initial session:', session ? 'found' : 'none');
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadTopicCount(session.user.id);
      }
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log('[Auth] Auth state changed:', _event);
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          loadTopicCount(session.user.id);
        } else {
          setTopicCount(0);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const loadTopicCount = async (userId: string) => {
    try {
      const { count, error } = await supabase
        .from('memo_topics')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (!error && count !== null) {
        setTopicCount(count);
        console.log('[Auth] Topic count:', count);
      }
    } catch (error) {
      console.error('[Auth] Error loading topic count:', error);
    }
  };

  const refreshTopicCount = async () => {
    if (user) {
      await loadTopicCount(user.id);
    }
  };

  const signIn = async (email: string, password: string) => {
    console.log('[Auth] Signing in:', email);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      console.error('[Auth] Sign in error:', error.message);
      throw error;
    }
    console.log('[Auth] Sign in successful');
  };

  const signInWithApple = async (): Promise<void> => {
    console.log('[Auth] Starting Apple Sign-In');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      console.log('[Auth] Apple credential received');

      if (!credential.identityToken) {
        throw new Error('No identity token received from Apple');
      }

      // Sign in to Supabase with the Apple token
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) {
        console.error('[Auth] Supabase Apple sign-in error:', error);
        throw error;
      }

      console.log('[Auth] Apple Sign-In successful');

      // Update user metadata with name if provided (Apple only sends name on first sign-in)
      if (credential.fullName?.givenName || credential.fullName?.familyName) {
        await supabase.auth.updateUser({
          data: {
            first_name: credential.fullName.givenName || '',
            last_name: credential.fullName.familyName || '',
            full_name: `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim(),
          }
        });
      }
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') {
        console.log('[Auth] Apple Sign-In cancelled by user');
        throw new Error('Sign-in was cancelled');
      }
      console.error('[Auth] Apple Sign-In error:', error);
      throw error;
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    console.log('[Auth] Starting Google Sign-In');
    
    try {
      // Create redirect URI that points back to the app
      // For Expo, this creates a URL like: exp://192.168.x.x:8081/--/auth/callback (dev)
      // or memotalk://auth/callback (production)
      const redirectUrl = makeRedirectUri({
        scheme: 'memotalk',
        path: 'auth/callback',
      });
      
      console.log('[Auth] Redirect URL:', redirectUrl);
      
      // Get the OAuth URL from Supabase
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true, // Don't automatically open browser
          queryParams: {
            // Ensure we get a refresh token
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      
      if (error) throw error;
      if (!data.url) throw new Error('No OAuth URL returned');
      
      console.log('[Auth] Opening browser for Google OAuth');
      console.log('[Auth] OAuth URL:', data.url);
      
      // Open the OAuth URL in a web browser
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl,
        {
          showInRecents: true,
          preferEphemeralSession: false,
        }
      );
      
      console.log('[Auth] Browser result:', result.type);
      
      if (result.type === 'success' && result.url) {
        console.log('[Auth] Callback URL:', result.url);
        
        // Parse the URL to get the session tokens
        const url = new URL(result.url);
        
        // Check for hash fragment (implicit flow) or query params (PKCE flow)
        const hashParams = new URLSearchParams(url.hash.substring(1));
        const queryParams = new URLSearchParams(url.search);
        
        const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
        const code = queryParams.get('code');
        
        console.log('[Auth] Tokens found - access:', !!accessToken, 'refresh:', !!refreshToken, 'code:', !!code);
        
        if (accessToken && refreshToken) {
          // Set the session directly
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          
          if (sessionError) throw sessionError;
          console.log('[Auth] Google Sign-In successful (token flow)');
        } else if (code) {
          // Exchange code for session (PKCE flow)
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          console.log('[Auth] Google Sign-In successful (PKCE flow)');
        } else {
          console.error('[Auth] URL params:', url.search, url.hash);
          throw new Error('No authentication tokens received');
        }
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        console.log('[Auth] Google Sign-In cancelled/dismissed by user');
        throw new Error('Sign-in was cancelled');
      } else {
        console.error('[Auth] Unexpected browser result:', result);
        throw new Error('Authentication failed');
      }
    } catch (error: any) {
      console.error('[Auth] Google Sign-In error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    console.log('[Auth] Signing out');
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    await AsyncStorage.clear();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        topicCount,
        canCreateTopic,
        signIn,
        signInWithApple,
        signInWithGoogle,
        signOut,
        refreshTopicCount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export { MAX_FREE_TOPICS };

