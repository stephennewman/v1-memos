import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TabHeader } from '@/components/TabHeader';
import { useAuth } from '@/lib/auth-context';
import EmptyState from '@/components/EmptyState';
import { supabase } from '@/lib/supabase';
import type { VoiceNote } from '@/lib/types';
import { formatShortDate } from '@/lib/format-date';

type FilterType = 'all' | 'archived';

export default function NotesScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [timeTab, setTimeTab] = useState<'past' | 'today' | 'future'>('today');

  const loadNotes = useCallback(async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('voice_notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (filter === 'all') {
        query = query.eq('is_archived', false);
      } else {
        query = query.eq('is_archived', true);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, filter]);

  useFocusEffect(
    useCallback(() => {
      if (user && !authLoading) {
        loadNotes();
      } else if (!authLoading && !user) {
        setIsLoading(false);
      }
    }, [user, authLoading, loadNotes])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadNotes();
  }, [loadNotes]);

  const toggleArchive = async (note: VoiceNote) => {
    const newArchived = !note.is_archived;

    // Optimistic update
    setNotes(prev => prev.filter(n => n.id !== note.id));

    try {
      await supabase
        .from('voice_notes')
        .update({ is_archived: newArchived })
        .eq('id', note.id);
    } catch (error) {
      // Revert on error
      setNotes(prev => [...prev, note]);
      console.error('Error archiving note:', error);
    }
  };

  // Filter by time
  const displayNotes = React.useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    
    return notes.filter(note => {
      const created = new Date(note.created_at);
      if (timeTab === 'today') {
        return created >= todayStart && created < tomorrowStart;
      } else if (timeTab === 'past') {
        return created < todayStart;
      } else {
        return created >= tomorrowStart;
      }
    });
  }, [notes, timeTab]);

  const renderNote = ({ item }: { item: VoiceNote }) => (
    <TouchableOpacity
      style={styles.noteItem}
      onPress={() => router.push(`/note/${item.id}`)}
    >
      <Ionicons name="document-text-outline" size={18} color="#93c5fd" style={styles.noteIcon} />
      <View style={styles.noteContent}>
        <Text style={styles.noteText} numberOfLines={2}>{item.text}</Text>
        <Text style={styles.noteDate}>{formatShortDate(item.created_at)}</Text>
      </View>
      <TouchableOpacity
        style={styles.archiveBtn}
        onPress={() => toggleArchive(item)}
      >
        <Ionicons
          name={item.is_archived ? "archive" : "archive-outline"}
          size={18}
          color="#555"
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  if (isLoading || authLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TabHeader
        title="Notes"
        subtitle={`${displayNotes.length} note${displayNotes.length !== 1 ? 's' : ''}`}
        titleColor="#a78bfa"
      />

      {/* Time Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, timeTab === 'past' && styles.tabActive]}
          onPress={() => setTimeTab('past')}
        >
          <Ionicons name="arrow-back" size={14} color={timeTab === 'past' ? '#fff' : '#666'} />
          <Text style={[styles.tabText, timeTab === 'past' && styles.tabTextActive]}>Past</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, styles.tabCenter, timeTab === 'today' && styles.tabActive]}
          onPress={() => setTimeTab('today')}
        >
          <Ionicons name="today" size={14} color={timeTab === 'today' ? '#fff' : '#666'} />
          <Text style={[styles.tabText, timeTab === 'today' && styles.tabTextActive]}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, timeTab === 'future' && styles.tabActive]}
          onPress={() => setTimeTab('future')}
        >
          <Text style={[styles.tabText, timeTab === 'future' && styles.tabTextActive]}>Future</Text>
          <Ionicons name="arrow-forward" size={14} color={timeTab === 'future' ? '#fff' : '#666'} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'archived' && styles.filterTabActive]}
          onPress={() => setFilter('archived')}
        >
          <Text style={[styles.filterTabText, filter === 'archived' && styles.filterTabTextActive]}>
            Archived
          </Text>
        </TouchableOpacity>
      </View>

      {/* Notes List */}
      <FlatList
        data={displayNotes}
        renderItem={renderNote}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#c4dfc4"
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title={filter === 'archived' ? "No archived notes" : "No notes yet"}
            description={filter === 'archived'
              ? "Archived notes will appear here"
              : "Notes extracted from your voice recordings will appear here"
            }
          />
        }
      />
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  filterTabActive: {
    backgroundColor: '#1a2a1a',
  },
  filterTabText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#c4dfc4',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  noteIcon: {
    marginTop: 2,
    marginRight: 12,
  },
  noteContent: {
    flex: 1,
  },
  noteText: {
    fontSize: 15,
    color: '#ddd',
    lineHeight: 22,
    marginBottom: 4,
  },
  noteDate: {
    fontSize: 12,
    color: '#555',
  },
  archiveBtn: {
    padding: 4,
    marginLeft: 8,
  },
});

