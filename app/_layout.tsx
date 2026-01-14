import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider, useTheme } from '@/lib/theme-context';
import { TimezoneProvider } from '@/lib/timezone-context';
import { OnboardingProvider } from '@/lib/onboarding-context';

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <TimezoneProvider>
          <ThemeProvider>
            <OnboardingProvider>
              <RootStack />
            </OnboardingProvider>
          </ThemeProvider>
        </TimezoneProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

