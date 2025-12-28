import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { VoiceEntry } from '@/lib/types';
import { formatDateTime } from '@/lib/format-date';
import { getTagColor } from '@/lib/auto-tags';

interface DayData {
  dateKey: string;
  label: string;
  entries: VoiceEntry[];
}

export default function VoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();

  // Entries state
  const [entries, setEntries] = useState<VoiceEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  // Get all unique tags from entries, sorted by frequency (most to least),
  // then alphabetically for tags with the same count
  const allTags = React.useMemo(() => {
    const tagCounts = new Map<string, number>();
    entries.forEach(entry => {
      entry.tags?.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });
    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [entries]);

  // Get day label for a date
  const getDayLabel = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((today.getTime() - itemDate.getTime()) / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  // Get date key for grouping
  const getDateKey = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  // Generate all days and group entries
  const groupedDays = React.useMemo(() => {
    // Filter entries by tag first
    let filtered = [...entries];
    if (selectedTag) {
      filtered = filtered.filter(entry => entry.tags?.includes(selectedTag));
    }

    // Build days array for last 30 days
    const daysArray: DayData[] = [];
    const dayMap = new Map<string, DayData>();

    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateKey = getDateKey(date);
      const day: DayData = {
        dateKey,
        label: getDayLabel(date.toISOString()),
        entries: [],
      };
      daysArray.push(day);
      dayMap.set(dateKey, day);
    }

    // Place entries into their respective days
    filtered.forEach(entry => {
      const dateKey = getDateKey(entry.created_at);
      const day = dayMap.get(dateKey);
      if (day) {
        day.entries.push(entry);
      }
    });

    // Sort entries within each day (newest first)
    daysArray.forEach(day => {
      day.entries.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return daysArray;
  }, [entries, selectedTag]);

  const toggleDayExpanded = useCallback((dateKey: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }, []);

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

  const renderEntry = (item: VoiceEntry) => {
    const isProcessing = !item.is_processed;
    const taskCount = item.extracted_todos?.length || 0;
    const noteCount = item.extracted_notes?.length || 0;
    const hasItems = taskCount > 0 || noteCount > 0;

    const getTitle = () => {
      if (isProcessing) return null;
      if (item.summary) return item.summary;
      if (item.transcript) return item.transcript.slice(0, 80) + (item.transcript.length > 80 ? '...' : '');
      return formatDateTime(item.created_at);
    };

    const title = getTitle();

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.entryCard}
        onPress={() => router.push(`/entry/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.entryHeader}>
          <View style={styles.entryHeaderContent}>
            {isProcessing ? (
              <View style={styles.skeletonTitle} />
            ) : (
              <Text style={styles.entryText} numberOfLines={2}>{title}</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color="#333" />
        </View>

        {hasItems && (
          <View style={styles.extractedItems}>
            {item.extracted_todos?.map((todo, idx) => (
              <View key={`task-${idx}`} style={styles.extractedItem}>
                <Ionicons name="checkbox-outline" size={14} color="#3b82f6" />
                <Text style={styles.extractedItemText} numberOfLines={1}>{todo.text}</Text>
                {item.tags && item.tags.length > 0 && (
                  <View style={styles.itemTagsRow}>
                    {item.tags.slice(0, 2).map(tag => (
                      <TouchableOpacity 
                        key={tag}
                        style={[styles.itemTag, { backgroundColor: `${getTagColor(tag)}20` }]}
                        onPress={(e) => {
                          e.stopPropagation();
                          setSelectedTag(tag);
                        }}
                      >
                        <Text style={[styles.itemTagText, { color: getTagColor(tag) }]}>#{tag}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}
            {item.extracted_notes?.map((note, idx) => (
              <View key={`note-${idx}`} style={styles.extractedItem}>
                <Ionicons name="document-text-outline" size={14} color="#a78bfa" />
                <Text style={styles.extractedItemText} numberOfLines={1}>{note}</Text>
                {item.tags && item.tags.length > 0 && (
                  <View style={styles.itemTagsRow}>
                    {item.tags.slice(0, 2).map(tag => (
                      <TouchableOpacity 
                        key={tag}
                        style={[styles.itemTag, { backgroundColor: `${getTagColor(tag)}20` }]}
                        onPress={(e) => {
                          e.stopPropagation();
                          setSelectedTag(tag);
                        }}
                      >
                        <Text style={[styles.itemTagText, { color: getTagColor(tag) }]}>#{tag}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderDaySection = (day: DayData) => {
    // Empty days collapsed by default, days with entries expanded by default
    const hasEntries = day.entries.length > 0;
    const isExpanded = hasEntries ? !collapsedDays.has(day.dateKey) : collapsedDays.has(day.dateKey);

    return (
      <View key={day.dateKey} style={styles.daySection}>
        <TouchableOpacity 
          style={[styles.dayHeader, !hasEntries && styles.dayHeaderEmpty]}
          onPress={() => toggleDayExpanded(day.dateKey)}
          activeOpacity={0.7}
        >
          <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={18} color={hasEntries ? '#0a0a0a' : '#666'} />
          <Text style={[styles.dayLabel, !hasEntries && styles.dayLabelEmpty]}>{day.label}</Text>
          {hasEntries && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{day.entries.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        {isExpanded && hasEntries && (
          <View style={styles.dayContent}>
            {day.entries.map(entry => renderEntry(entry))}
          </View>
        )}
      </View>
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

      {/* Tag Filter Row */}
      {allTags.length > 0 && (
        <View style={styles.tagFilterRow}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tagFilterContent}
            style={{ flex: 1 }}
          >
            {(selectedTag ? [selectedTag] : allTags).map(tag => (
              <TouchableOpacity
                key={tag}
                style={[
                  styles.tagChip, 
                  selectedTag === tag && styles.tagChipActive,
                  { borderColor: getTagColor(tag) }
                ]}
                onPress={() => setSelectedTag(selectedTag === tag ? null : tag)}
              >
                <Text style={[
                  styles.tagChipText, 
                  selectedTag === tag && styles.tagChipTextActive,
                  { color: selectedTag === tag ? '#fff' : getTagColor(tag) }
                ]}>
                  #{tag}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {selectedTag && (
            <TouchableOpacity
              style={styles.clearFilterBtn}
              onPress={() => setSelectedTag(null)}
            >
              <Text style={styles.clearFilterText}>Clear</Text>
              <Ionicons name="close-circle" size={14} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Entries List */}
      <ScrollView
        style={styles.scrollView}
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
      >
        {groupedDays.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Add Memo below</Text>
          </View>
        ) : (
          groupedDays.map(day => renderDaySection(day))
        )}
        <View style={{ height: 120 }} />
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  daySection: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
    backgroundColor: '#06b6d4',
  },
  dayLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  dayHeaderEmpty: {
    backgroundColor: '#1a1a1a',
  },
  dayLabelEmpty: {
    color: '#666',
  },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  dayContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  entryHeaderContent: {
    flex: 1,
  },
  entryText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 19,
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
  itemTagsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  itemTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  tagFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    maxHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  tagFilterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 12,
    gap: 4,
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
  },
  tagChipActive: {
    backgroundColor: '#06b6d4',
    borderColor: '#06b6d4',
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  tagChipTextActive: {
    color: '#fff',
  },
});
