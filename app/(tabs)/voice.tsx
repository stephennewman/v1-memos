import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import EmptyState from '@/components/EmptyState';
import type { VoiceEntry } from '@/lib/types';
import { ENTRY_TYPE_CONFIG } from '@/lib/types';
import { formatRelativeDate, formatDateTime } from '@/lib/format-date';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://www.outcomeview.com';

export default function VoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();

  // Entries state
  const [entries, setEntries] = useState<VoiceEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  // Sort entries
  const filteredEntries = React.useMemo(() => {
    return [...entries].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sort === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [entries, sort]);

  const loadEntries = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('voice_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        // Table might not exist yet - that's OK
        console.log('Could not load entries (table may not exist):', error.message);
        setEntries([]);
      } else {
        setEntries(data || []);
      }
    } catch (error) {
      console.error('Error loading voice entries:', error);
      setEntries([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (user && !authLoading) {
        loadEntries(user.id);
      } else if (!authLoading && !user) {
        setIsLoading(false);
      }
    }, [user, authLoading, loadEntries])
  );


  const renderEntry = ({ item }: { item: VoiceEntry }) => {
    const config = ENTRY_TYPE_CONFIG[item.entry_type] || ENTRY_TYPE_CONFIG.freeform;
    const isProcessing = !item.is_processed;
    const taskCount = item.extracted_todos?.length || 0;
    const noteCount = item.extracted_notes?.length || 0;
    const hasItems = taskCount > 0 || noteCount > 0;

    // Title: AI summary > transcript snippet > date/time fallback
    const getTitle = () => {
      if (isProcessing) return null;
      if (item.summary) return item.summary;
      if (item.transcript) return item.transcript.slice(0, 80) + (item.transcript.length > 80 ? '...' : '');
      return formatDateTime(item.created_at);
    };

    const title = getTitle();

    return (
      <TouchableOpacity
        style={styles.entryCard}
        onPress={() => router.push(`/entry/${item.id}`)}
        activeOpacity={0.7}
      >
        {/* Header with icon, title, date */}
        <View style={styles.entryHeader}>
          <View style={[styles.entryIcon, { backgroundColor: `${config.color}20` }]}>
            <Ionicons name={config.icon as any} size={16} color={config.color} />
          </View>
          <View style={styles.entryHeaderContent}>
            {isProcessing ? (
              <View style={styles.skeletonTitle} />
            ) : (
              <Text style={styles.entryText} numberOfLines={2}>{title}</Text>
            )}
            <Text style={styles.entryDate}>{formatRelativeDate(item.created_at)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#333" />
        </View>

        {/* Always show extracted items if present */}
        {hasItems && (
          <View style={styles.extractedItems}>
            {item.extracted_todos?.map((todo, idx) => (
              <View key={`task-${idx}`} style={styles.extractedItem}>
                <Ionicons name="checkbox-outline" size={14} color="#3b82f6" />
                <Text style={styles.extractedItemText} numberOfLines={1}>{todo.text}</Text>
              </View>
            ))}
            {item.extracted_notes?.map((note, idx) => (
              <View key={`note-${idx}`} style={styles.extractedItem}>
                <Ionicons name="document-text-outline" size={14} color="#a78bfa" />
                <Text style={styles.extractedItemText} numberOfLines={1}>{note}</Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (isLoading || authLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Memos</Text>
          <Text style={styles.headerSubtitle}>
            {entries.length} memo{entries.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push('/search')}
        >
          <Ionicons name="search" size={22} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push('/(tabs)/settings')}
        >
          <Ionicons name="person-circle-outline" size={26} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Sort Row */}
      <View style={styles.filterSortRow}>
        <View style={styles.sortGroup}>
          <TouchableOpacity
            style={[styles.sortBtn, sort === 'newest' && styles.sortBtnActive]}
            onPress={() => setSort('newest')}
          >
            <Text style={[styles.sortBtnText, sort === 'newest' && styles.sortBtnTextActive]}>Newest</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortBtn, sort === 'oldest' && styles.sortBtnActive]}
            onPress={() => setSort('oldest')}
          >
            <Text style={[styles.sortBtnText, sort === 'oldest' && styles.sortBtnTextActive]}>Oldest</Text>
          </TouchableOpacity>
        </View>
      </View>


      {/* Entries List */}
      <View style={styles.listSection}>
        {filteredEntries.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Add Memo below</Text>
          </View>
        ) : (
          <FlatList
            data={filteredEntries}
            renderItem={renderEntry}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => {
                  if (user) {
                    setIsRefreshing(true);
                    loadEntries(user.id);
                  }
                }}
                tintColor="#c4dfc4"
              />
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  tabCenter: {
    flex: 1.2,
  },
  tabActive: {
    backgroundColor: '#1a3a1a',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  filterSortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  sortGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#111',
  },
  sortBtnActive: {
    backgroundColor: '#1a3a1a',
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  sortBtnTextActive: {
    color: '#fff',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    padding: 0,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#22c55e',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  listSection: {
    flex: 1,
  },
  listHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  entryCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  entryIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  entryHeaderContent: {
    flex: 1,
  },
  entryText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 19,
    marginBottom: 4,
  },
  entryDate: {
    fontSize: 11,
    color: '#555',
  },
  skeletonTitle: {
    height: 16,
    width: '80%',
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    marginBottom: 4,
  },
  extractedItems: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    gap: 8,
  },
  extractedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  extractedItemText: {
    flex: 1,
    fontSize: 13,
    color: '#aaa',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#555',
  },
});
