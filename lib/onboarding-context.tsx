import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, useSegments, useRootNavigationState } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './auth-context';

const ONBOARDING_KEY = 'memotalk_onboarding_complete';

interface OnboardingContextType {
  isOnboardingComplete: boolean;
  isCheckingOnboarding: boolean;
  completeOnboarding: () => void;
  recheckOnboarding: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType>({
  isOnboardingComplete: false,
  isCheckingOnboarding: true,
  completeOnboarding: () => {},
  recheckOnboarding: async () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);
  
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  const checkOnboarding = useCallback(async () => {
    try {
      const completed = await AsyncStorage.getItem(ONBOARDING_KEY);
      setIsOnboardingComplete(completed === 'true');
    } catch (error) {
      console.error('[Onboarding] Error checking status:', error);
      // If error reading, assume not complete to be safe
      setIsOnboardingComplete(false);
    } finally {
      setIsCheckingOnboarding(false);
    }
  }, []);

  // Check onboarding status when user changes
  useEffect(() => {
    if (!authLoading && user) {
      checkOnboarding();
    } else if (!authLoading && !user) {
      setIsCheckingOnboarding(false);
      setIsOnboardingComplete(false);
    }
  }, [user, authLoading, checkOnboarding]);

  // Handle navigation based on onboarding status
  useEffect(() => {
    if (!navigationState?.key) return; // Navigation not ready
    if (authLoading || isCheckingOnboarding) return; // Still loading

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!user) {
      // Not logged in - let auth handle it
      return;
    }

    if (!isOnboardingComplete && !inOnboarding && !inAuthGroup) {
      // User is logged in but hasn't completed onboarding - redirect
      router.replace('/onboarding');
    } else if (isOnboardingComplete && inOnboarding) {
      // User completed onboarding but is still on onboarding screen - redirect to main
      router.replace('/(tabs)');
    }
  }, [user, isOnboardingComplete, segments, navigationState?.key, authLoading, isCheckingOnboarding, router]);

  const completeOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      setIsOnboardingComplete(true);
    } catch (error) {
      console.error('[Onboarding] Error saving status:', error);
      // Still mark as complete in memory so user can proceed
      setIsOnboardingComplete(true);
    }
  }, []);

  const recheckOnboarding = useCallback(async () => {
    setIsCheckingOnboarding(true);
    await checkOnboarding();
  }, [checkOnboarding]);

  return (
    <OnboardingContext.Provider
      value={{
        isOnboardingComplete,
        isCheckingOnboarding,
        completeOnboarding,
        recheckOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
