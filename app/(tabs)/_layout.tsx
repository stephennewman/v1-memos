import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { CreateProvider } from '@/lib/create-context';

export default function TabLayout() {
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
            borderTopColor: '#1a1a1a',
            borderTopWidth: 1,
            paddingTop: 6,
            height: 85,
          },
          tabBarActiveTintColor: '#c4dfc4',
          tabBarInactiveTintColor: '#555',
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '500',
            marginTop: 2,
          },
        }}
      >
        {/* Home tab - will be the day feed */}
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => (
              <Ionicons name="home" size={22} color={color} />
            ),
          }}
        />
        
        {/* Voice Notes */}
        <Tabs.Screen
          name="voice"
          options={{
            title: 'Voice',
            tabBarIcon: ({ color }) => (
              <Ionicons name="mic" size={22} color={color} />
            ),
          }}
        />
        
        {/* Tasks */}
        <Tabs.Screen
          name="tasks"
          options={{
            title: 'Tasks',
            tabBarIcon: ({ color }) => (
              <Ionicons name="checkbox" size={22} color={color} />
            ),
          }}
        />
        
        {/* Topics (Memos) */}
        <Tabs.Screen
          name="index"
          options={{
            title: 'Topics',
            tabBarIcon: ({ color }) => (
              <Ionicons name="bookmark" size={22} color={color} />
            ),
          }}
        />
        
        {/* Insights / Analytics */}
        <Tabs.Screen
          name="insights"
          options={{
            title: 'Insights',
            tabBarIcon: ({ color }) => (
              <Ionicons name="analytics" size={22} color={color} />
            ),
          }}
        />
        
        {/* Hidden tabs */}
        <Tabs.Screen
          name="inbox"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            href: null, // Hidden from tab bar, accessed via profile icon
          }}
        />
      </Tabs>
    </CreateProvider>
  );
}
