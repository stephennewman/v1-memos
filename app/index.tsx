import { View, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { ModernLoader } from '@/components/ModernLoader';

/**
 * Root entry point - handles auth-based routing
 * This ensures Apple reviewers see the login screen immediately
 */
export default function Index() {
  const { user, isLoading } = useAuth();

  // Show loading while checking auth
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ModernLoader size="large" color="#c4dfc4" />
      </View>
    );
  }

  // Not authenticated - redirect to login
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // Authenticated - redirect to main tabs
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
});

