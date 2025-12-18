import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { CreateProvider } from '@/lib/create-context';
import { SettingsProvider, useSettings } from '@/lib/settings-context';

function TabsContent() {
  const { user, isLoading } = useAuth();
  const { tabs, isLoading: settingsLoading } = useSettings();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/(auth)/login');
    }
  }, [user, isLoading]);

  if (isLoading || settingsLoading) {
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
        {/* Home tab - will be the day feed (default route) */}
        <Tabs.Screen
          name="index"
          options={{
            href: tabs.home ? '/' : null,
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
            href: tabs.voice ? '/voice' : null,
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
            href: tabs.tasks ? '/tasks' : null,
            title: 'Tasks',
            tabBarIcon: ({ color }) => (
              <Ionicons name="checkbox" size={22} color={color} />
            ),
          }}
        />
        
        {/* Notes (bullet points) */}
        <Tabs.Screen
          name="notes"
          options={{
            href: tabs.notes ? '/notes' : null,
            title: 'Notes',
            tabBarIcon: ({ color }) => (
              <Ionicons name="document-text" size={22} color={color} />
            ),
          }}
        />
        
        {/* Topics (Memos) */}
        <Tabs.Screen
          name="topics"
          options={{
            href: tabs.topics ? '/topics' : null,
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
            href: tabs.insights ? '/insights' : null,
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

export default function TabLayout() {
  return (
    <SettingsProvider>
      <TabsContent />
    </SettingsProvider>
  );
}
