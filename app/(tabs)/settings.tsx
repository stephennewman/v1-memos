import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth, MAX_FREE_TOPICS } from '@/lib/auth-context';
import { useSettings, TabSettings } from '@/lib/settings-context';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, topicCount, signOut } = useAuth();
  const { tabs, toggleTab } = useSettings();

  const navigationItems: { icon: string; label: string; key: keyof TabSettings }[] = [
    { icon: 'home', label: 'Home', key: 'home' },
    { icon: 'mic', label: 'Voice Notes', key: 'voice' },
    { icon: 'checkbox-outline', label: 'Tasks', key: 'tasks' },
    { icon: 'document-text', label: 'Notes', key: 'notes' },
    { icon: 'analytics', label: 'Insights', key: 'insights' },
  ];

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: signOut,
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Navigation Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Navigation</Text>
          <Text style={styles.sectionHint}>Toggle tabs on/off in the bottom navigation</Text>
          <View style={styles.card}>
            {navigationItems.map((item, index) => (
              <View
                key={item.key}
                style={[
                  styles.navRow,
                  index < navigationItems.length - 1 && styles.navRowBorder,
                ]}
              >
                <Ionicons 
                  name={item.icon as any} 
                  size={20} 
                  color={tabs[item.key] ? '#c4dfc4' : '#444'} 
                />
                <Text style={[
                  styles.navLabel,
                  !tabs[item.key] && styles.navLabelDisabled
                ]}>
                  {item.label}
                </Text>
                <Switch
                  value={tabs[item.key]}
                  onValueChange={() => toggleTab(item.key)}
                  trackColor={{ false: '#333', true: '#4a6b4a' }}
                  thumbColor={tabs[item.key] ? '#c4dfc4' : '#666'}
                  ios_backgroundColor="#333"
                />
              </View>
            ))}
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="person-outline" size={20} color="#666" />
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{user?.email || 'Unknown'}</Text>
            </View>
          </View>
        </View>

        {/* Usage Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Usage</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="bookmark-outline" size={20} color="#666" />
              <Text style={styles.rowLabel}>Topics</Text>
              <Text style={styles.rowValue}>{topicCount} / {MAX_FREE_TOPICS}</Text>
            </View>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${(topicCount / MAX_FREE_TOPICS) * 100}%` }
                ]} 
              />
            </View>
            <Text style={styles.usageHint}>
              {topicCount >= MAX_FREE_TOPICS 
                ? 'Topic limit reached. More coming soon!'
                : `${MAX_FREE_TOPICS - topicCount} topics remaining`
              }
            </Text>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="information-circle-outline" size={20} color="#666" />
              <Text style={styles.rowLabel}>Version</Text>
              <Text style={styles.rowValue}>1.0.0</Text>
            </View>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#ff6b6b" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footer}>
          Memos by Outcome View
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginLeft: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: '#555',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  rowValue: {
    fontSize: 16,
    color: '#666',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  navRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  navLabel: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  navLabelDisabled: {
    color: '#555',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#c4dfc4',
    borderRadius: 2,
  },
  usageHint: {
    fontSize: 13,
    color: '#666',
    padding: 16,
    paddingTop: 12,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff6b6b',
  },
  footer: {
    textAlign: 'center',
    color: '#333',
    fontSize: 13,
    marginTop: 32,
    marginBottom: 16,
  },
});


