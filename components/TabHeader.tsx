import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface TabHeaderProps {
  title: string;
  subtitle?: string;
  showProfile?: boolean;
  showSearch?: boolean;
  titleColor?: string;
}

export function TabHeader({ title, subtitle, showProfile = true, showSearch = true, titleColor = '#fff' }: TabHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {showSearch && (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/search')}
          >
            <Ionicons name="search" size={22} color="#666" />
          </TouchableOpacity>
        )}

        {showProfile && (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(tabs)/settings')}
          >
            <Ionicons name="person-circle-outline" size={26} color="#666" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

