import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider, useTheme } from '@/lib/theme-context';
import { TimezoneProvider } from '@/lib/timezone-context';
import { OnboardingProvider } from '@/lib/onboarding-context';
import { PostHogProvider } from '@/lib/posthog';

function RootStack() {
  const { colors, isDark } = useTheme();
  
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {/* Entry point - handles auth routing */}
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="topic" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <PostHogProvider>
        <TimezoneProvider>
          <ThemeProvider>
            <OnboardingProvider>
              <RootStack />
            </OnboardingProvider>
          </ThemeProvider>
        </TimezoneProvider>
      </PostHogProvider>
    </AuthProvider>
  );
}
