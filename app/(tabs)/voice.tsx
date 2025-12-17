import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import EmptyState from '@/components/EmptyState';
import type { VoiceEntry } from '@/lib/types';
import { ENTRY_TYPE_CONFIG } from '@/lib/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://www.outcomeview.com';

export default function VoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();
  
  // Entries state
  const [entries, setEntries] = useState<VoiceEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VoiceEntry[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Get unique people from all entries
  const allPeople = React.useMemo(() => {
    const peopleSet = new Set<string>();
    entries.forEach(entry => {
      (entry.extracted_people || []).forEach(person => peopleSet.add(person));
    });
    return Array.from(peopleSet).sort();
  }, [entries]);

  // Filter entries by selected person and search
  const filteredEntries = React.useMemo(() => {
    // If we have search results, use those instead
    if (searchResults !== null) return searchResults;
    
    let filtered = entries;
    
    // Filter by person
    if (selectedPerson) {
      filtered = filtered.filter(entry => 
        (entry.extracted_people || []).includes(selectedPerson)
      );
    }
    
    // Local search if query is short (< 3 chars)
    if (searchQuery && searchQuery.length < 3) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(entry => 
        (entry.summary || '').toLowerCase().includes(q) ||
        (entry.transcript || '').toLowerCase().includes(q)
      );
    }
    
    return filtered;
  }, [entries, selectedPerson, searchQuery, searchResults]);

  // Search function
  const performSearch = useCallback(async (query: string) => {
    if (!user || query.length < 3) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `${API_URL}/api/voice/search?q=${encodeURIComponent(query)}&user_id=${user.id}&limit=50`
      );
      
      if (response.ok) {
        const data = await response.json();
        // Map search results to VoiceEntry format (partial)
        const results = data.results.map((r: any) => ({
          id: r.id,
          summary: r.title,
          created_at: r.created_at,
          extracted_people: r.people,
          // Other fields will be null/undefined
        }));
        setSearchResults(results);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [user]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 3) {
        performSearch(searchQuery);
      } else {
        setSearchResults(null);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const renderEntry = ({ item }: { item: VoiceEntry }) => {
    const config = ENTRY_TYPE_CONFIG[item.entry_type] || ENTRY_TYPE_CONFIG.freeform;
    const isProcessing = !item.is_processed;
    const taskCount = item.extracted_todos?.length || 0;
    const peopleList = item.extracted_people || [];

    // Title: AI summary > transcript snippet > date/time fallback
    const getTitle = () => {
      if (isProcessing) return null; // Show skeleton
      if (item.summary) return item.summary;
      if (item.transcript) return item.transcript.slice(0, 60) + (item.transcript.length > 60 ? '...' : '');
      return formatDateTime(item.created_at);
    };

    const title = getTitle();

    return (
      <TouchableOpacity
        style={styles.entryCard}
        onPress={() => router.push(`/entry/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={[styles.entryIcon, { backgroundColor: `${config.color}20` }]}>
          <Ionicons name={config.icon as any} size={18} color={config.color} />
        </View>
        <View style={styles.entryContent}>
          {/* Title or Skeleton */}
          {isProcessing ? (
            <View style={styles.skeletonTitle} />
          ) : (
            <Text style={styles.entryText} numberOfLines={2}>
              {title}
            </Text>
          )}

          {/* Meta row: date, tasks, people */}
          <View style={styles.entryMeta}>
            <Text style={styles.entryDate}>{formatDate(item.created_at)}</Text>
            
            {/* Tasks count */}
            <View style={styles.tasksBadge}>
              {isProcessing ? (
                <View style={styles.skeletonBadge} />
              ) : (
                <>
                  <Ionicons name="checkbox-outline" size={12} color={taskCount > 0 ? '#c4dfc4' : '#444'} />
                  <Text style={[styles.tasksBadgeText, taskCount > 0 && styles.tasksBadgeTextActive]}>
                    {taskCount}
                  </Text>
                </>
              )}
            </View>

            {/* People badges */}
            {isProcessing ? (
              <View style={styles.skeletonBadge} />
            ) : peopleList.length > 0 ? (
              <View style={styles.peopleBadges}>
                {peopleList.slice(0, 2).map((person, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={styles.personBadge}
                    onPress={(e) => {
                      e.stopPropagation();
                      router.push(`/person/${encodeURIComponent(person)}`);
                    }}
                  >
                    <Text style={styles.personBadgeText}>{person}</Text>
                  </TouchableOpacity>
                ))}
                {peopleList.length > 2 && (
                  <Text style={styles.morepeople}>+{peopleList.length - 2}</Text>
                )}
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#444" />
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
          <Text style={styles.headerTitle}>Voice</Text>
          <Text style={styles.headerSubtitle}>
            {entries.length} recording{entries.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.profileButton}
          onPress={() => router.push('/(tabs)/settings')}
        >
          <Ionicons name="person-circle-outline" size={28} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#555" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transcripts..."
            placeholderTextColor="#555"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#555" />
            </TouchableOpacity>
          )}
          {isSearching && (
            <ActivityIndicator size="small" color="#c4dfc4" style={{ marginLeft: 8 }} />
          )}
        </View>
      </View>

      {/* People Filter */}
      {allPeople.length > 0 && (
        <View style={styles.filterSection}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            <TouchableOpacity
              style={[styles.filterChip, !selectedPerson && styles.filterChipActive]}
              onPress={() => setSelectedPerson(null)}
            >
              <Text style={[styles.filterChipText, !selectedPerson && styles.filterChipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {allPeople.map(person => (
              <TouchableOpacity
                key={person}
                style={[styles.filterChip, selectedPerson === person && styles.filterChipActive]}
                onPress={() => setSelectedPerson(selectedPerson === person ? null : person)}
              >
                <Ionicons 
                  name="person" 
                  size={12} 
                  color={selectedPerson === person ? '#0a0a0a' : '#888'} 
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.filterChipText, selectedPerson === person && styles.filterChipTextActive]}>
                  {person}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Entries List */}
      <View style={styles.listSection}>
        <Text style={styles.listHeader}>
          {selectedPerson ? `${selectedPerson}'s mentions` : 'Recent'}
        </Text>
        
        {filteredEntries.length === 0 ? (
          <EmptyState
            icon={selectedPerson ? 'person-outline' : 'mic-outline'}
            title={selectedPerson ? `No recordings with ${selectedPerson}` : 'Start your voice journal'}
            description={
              selectedPerson 
                ? `Record a note mentioning ${selectedPerson} and it will appear here`
                : 'Capture your thoughts, ideas, and tasks with voice. AI will transcribe and extract key information.'
            }
            actionLabel={!selectedPerson ? 'Record First Note' : undefined}
            onAction={!selectedPerson ? () => router.push('/record') : undefined}
          />
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
  profileButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
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
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  filterSection: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    paddingVertical: 12,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#c4dfc4',
    borderColor: '#c4dfc4',
  },
  filterChipText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#0a0a0a',
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  entryIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  entryContent: {
    flex: 1,
  },
  entryText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 18,
  },
  entryDate: {
    fontSize: 11,
    color: '#555',
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 10,
  },
  tasksBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tasksBadgeText: {
    fontSize: 11,
    color: '#444',
  },
  tasksBadgeTextActive: {
    color: '#c4dfc4',
  },
  peopleBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  personBadge: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  personBadgeText: {
    fontSize: 10,
    color: '#888',
  },
  morepeople: {
    fontSize: 10,
    color: '#555',
  },
  skeletonTitle: {
    height: 16,
    width: '80%',
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    marginBottom: 4,
  },
  skeletonBadge: {
    height: 14,
    width: 30,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
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
