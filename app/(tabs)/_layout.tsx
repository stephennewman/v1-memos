import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { CreateProvider } from '@/lib/create-context';
import { SettingsProvider, useSettings, TabKey } from '@/lib/settings-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// Tab configuration for custom tab bar
const tabConfig: Record<TabKey, { name: string; title: string; icon: string; color: string; route: string }> = {
  home: { name: 'index', title: 'Home', icon: 'home', color: '#fff', route: '/' },
  voice: { name: 'voice', title: 'Voice', icon: 'mic', color: '#22c55e', route: '/voice' },
  tasks: { name: 'tasks', title: 'Tasks', icon: 'checkbox', color: '#3b82f6', route: '/tasks' },
  notes: { name: 'notes', title: 'Notes', icon: 'document-text', color: '#a78bfa', route: '/notes' },
  topics: { name: 'topics', title: 'Topics', icon: 'bookmark', color: '#f59e0b', route: '/topics' },
  insights: { name: 'insights', title: 'Insights', icon: 'analytics', color: '#ec4899', route: '/insights' },
  forms: { name: 'forms', title: 'Forms', icon: 'clipboard', color: '#f97316', route: '/forms' },
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { tabs, tabOrder } = useSettings();
  
  // Get visible tabs in custom order
  const visibleTabs = tabOrder.filter(key => tabs[key]);
  
  // Map route names to tab keys
  const routeToTabKey: Record<string, TabKey> = {
    index: 'home',
    voice: 'voice',
    tasks: 'tasks',
    notes: 'notes',
    topics: 'topics',
    insights: 'insights',
    forms: 'forms',
  };
  
  const currentRouteName = state.routes[state.index]?.name;
  const currentTabKey = routeToTabKey[currentRouteName];
  
  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: '#0a0a0a',
      borderTopColor: '#1a1a1a',
      borderTopWidth: 0,
      paddingTop: 6,
      paddingBottom: 30,
      height: 85,
    }}>
      {visibleTabs.map((tabKey) => {
        const config = tabConfig[tabKey];
        const isFocused = currentTabKey === tabKey;
        
        const onPress = () => {
          if (!isFocused) {
            navigation.navigate(config.name);
          }
        };
        
        return (
          <TouchableOpacity
            key={tabKey}
            onPress={onPress}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ alignItems: 'center' }}>
              <Ionicons
                name={config.icon as any}
                size={22}
                color={isFocused ? config.color : '#666'}
              />
              {isFocused && (
                <View style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: config.color,
                  marginTop: 2
                }} />
              )}
            </View>
            <Text style={{
              fontSize: 10,
              fontWeight: '600',
              marginTop: 2,
              color: isFocused ? '#fff' : '#666',
            }}>
              {config.title}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TabsContent() {
  const { user, isLoading } = useAuth();
  const { tabs, tabOrder, isLoading: settingsLoading } = useSettings();
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
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        {/* All tab screens - visibility and order handled by CustomTabBar */}
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="topics" options={{ title: 'Topics' }} />
        <Tabs.Screen name="voice" options={{ title: 'Voice' }} />
        <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
        <Tabs.Screen name="notes" options={{ title: 'Notes' }} />
        <Tabs.Screen name="forms" options={{ title: 'Forms' }} />
        <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
        
        {/* Hidden tabs - not in tab bar */}
        <Tabs.Screen name="inbox" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
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
