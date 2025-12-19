import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
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
            borderTopWidth: 0,
            paddingTop: 6,
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
        {/* Home - the all things view (default route) */}
        <Tabs.Screen
          name="index"
          options={{
            href: tabs.home ? '/' : null,
            title: 'Home',
            tabBarIcon: ({ focused }) => (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="home" size={22} color={focused ? '#fff' : '#666'} />
                {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff', marginTop: 2 }} />}
              </View>
            ),
          }}
        />

        {/* Topics (Memos) */}
        <Tabs.Screen
          name="topics"
          options={{
            href: tabs.topics ? '/topics' : null,
            title: 'Topics',
            tabBarIcon: ({ focused }) => (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="bookmark" size={22} color={focused ? '#f59e0b' : '#666'} />
                {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#f59e0b', marginTop: 2 }} />}
              </View>
            ),
          }}
        />

        {/* Voice Notes */}
        <Tabs.Screen
          name="voice"
          options={{
            href: tabs.voice ? '/voice' : null,
            title: 'Voice',
            tabBarIcon: ({ focused }) => (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="mic" size={22} color={focused ? '#22c55e' : '#666'} />
                {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#22c55e', marginTop: 2 }} />}
              </View>
            ),
          }}
        />

        {/* Tasks */}
        <Tabs.Screen
          name="tasks"
          options={{
            href: tabs.tasks ? '/tasks' : null,
            title: 'Tasks',
            tabBarIcon: ({ focused }) => (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="checkbox" size={22} color={focused ? '#3b82f6' : '#666'} />
                {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#3b82f6', marginTop: 2 }} />}
              </View>
            ),
          }}
        />

        {/* Notes (bullet points) */}
        <Tabs.Screen
          name="notes"
          options={{
            href: tabs.notes ? '/notes' : null,
            title: 'Notes',
            tabBarIcon: ({ focused }) => (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="document-text" size={22} color={focused ? '#a78bfa' : '#666'} />
                {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#a78bfa', marginTop: 2 }} />}
              </View>
            ),
          }}
        />

        {/* Forms - between Notes and Insights */}
        <Tabs.Screen
          name="forms"
          options={{
            href: tabs.forms ? '/forms' : null,
            title: 'Forms',
            tabBarIcon: ({ focused }) => (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="clipboard" size={22} color={focused ? '#f97316' : '#666'} />
                {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#f97316', marginTop: 2 }} />}
              </View>
            ),
          }}
        />

        {/* Insights / Analytics */}
        <Tabs.Screen
          name="insights"
          options={{
            href: tabs.insights ? '/insights' : null,
            title: 'Insights',
            tabBarIcon: ({ focused }) => (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="analytics" size={22} color={focused ? '#ec4899' : '#666'} />
                {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#ec4899', marginTop: 2 }} />}
              </View>
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
