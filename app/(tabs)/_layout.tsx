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
          tabBarStyle: {
            backgroundColor: '#0a0a0a',
            borderTopWidth: 0,
            paddingTop: 6,
            paddingBottom: 30,
            height: 85,
          },
          tabBarActiveTintColor: '#fff',
          tabBarInactiveTintColor: '#666',
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: 2,
          },
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
        <Tabs.Screen
          name="voice"
          options={{
            title: 'Memos',
            tabBarIcon: ({ focused }) => (
              <Ionicons name="mic" size={22} color={focused ? '#22c55e' : '#666'} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ focused }) => (
              <Ionicons name="settings" size={22} color={focused ? '#888' : '#666'} />
            ),
          }}
        />
        
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
