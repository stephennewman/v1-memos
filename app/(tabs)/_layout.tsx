import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { CreateProvider } from '@/lib/create-context';
import { SettingsProvider } from '@/lib/settings-context';

function TabsContent() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/(auth)/login');
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' }}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <CreateProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' }, // Hide bottom tab bar - using toggle instead
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused }) => (
              <Ionicons name="home" size={22} color={focused ? '#f472b6' : '#666'} />
            ),
          }}
        />
        
        {/* Voice tab hidden - consolidated into Home view */}
        <Tabs.Screen name="voice" options={{ href: null }} />
        
        {/* Settings hidden from tab bar - accessible via profile icon */}
        <Tabs.Screen name="settings" options={{ href: null }} />
        
        {/* Hidden screens - not in tab bar */}
        <Tabs.Screen name="tasks" options={{ href: null }} />
        <Tabs.Screen name="notes" options={{ href: null }} />
        <Tabs.Screen name="topics" options={{ href: null }} />
        <Tabs.Screen name="forms" options={{ href: null }} />
        <Tabs.Screen name="insights" options={{ href: null }} />
        <Tabs.Screen name="inbox" options={{ href: null }} />
      </Tabs>
    </CreateProvider>
  );
}

export default function TabLayout() {
  return (
    <SettingsProvider>
      <TabsContent />
    </SettingsProvider>
  );
}
