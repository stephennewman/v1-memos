import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

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

