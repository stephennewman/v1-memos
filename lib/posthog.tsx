/**
 * PostHog Analytics for MemoTalk iOS
 * Tracks user behavior for cross-product analytics
 */

import { useEffect } from 'react';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-react-native';
import { useAuth } from './auth-context';

// PostHog configuration - same project as web app for unified analytics
const POSTHOG_KEY = 'phc_8vRoWfsC9xKRi9RRj7Clx5FvnhU4fFVUHbV3Iir1965';
const POSTHOG_HOST = 'https://us.i.posthog.com';

// TEMPORARILY DISABLED - debugging crash
const isPostHogEnabled = false; // POSTHOG_KEY && POSTHOG_KEY.startsWith('phc_');

/**
 * PostHog Provider wrapper for MemoTalk
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!isPostHogEnabled) {
    return <>{children}</>;
  }

  return (
    <PHProvider
      apiKey={POSTHOG_KEY}
      options={{
        host: POSTHOG_HOST,
        enableSessionReplay: false,
      }}
    >
      <PostHogIdentifier />
      {children}
    </PHProvider>
  );
}

/**
 * Component that identifies the user in PostHog when they log in
 */
function PostHogIdentifier() {
  const posthog = usePostHog();
  const { user } = useAuth();

  useEffect(() => {
    if (!posthog) return;

    if (user) {
      // Identify user with their ID
      posthog.identify(user.id, {
        email: user.email,
        signup_source: 'memotalk',
      });
      
      // Track app opened
      posthog.capture('app_opened', {
        platform: 'memotalk',
      });
    } else {
      // Reset on logout
      posthog.reset();
    }
  }, [user, posthog]);

  return null;
}

/**
 * Hook to track events (use inside components)
 */
export function useAnalytics() {
  const posthog = usePostHog();

  const track = (eventName: string, properties?: Record<string, unknown>) => {
    if (posthog) {
      posthog.capture(eventName, {
        ...properties,
        platform: 'memotalk',
      });
    }
  };

  return { track };
}
