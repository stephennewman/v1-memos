import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatRelativeDate } from '@/lib/format-date';

interface SearchResult {
  id: string;
  type: 'task' | 'note' | 'voice' | 'topic';
  title: string;
  subtitle?: string;
  created_at: string;
}

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const search = useCallback(async (searchQuery: string) => {
    if (!user || !searchQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    const lowerQuery = searchQuery.toLowerCase().trim();

    try {
      // Search tasks
      const { data: tasks } = await supabase
        .from('voice_todos')
        .select('id, text, created_at')
        .eq('user_id', user.id)
        .ilike('text', `%${lowerQuery}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      // Search notes
      const { data: notes } = await supabase
        .from('voice_notes')
        .select('id, text, created_at')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .ilike('text', `%${lowerQuery}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      // Search voice entries
      const { data: voices } = await supabase
        .from('voice_entries')
        .select('id, summary, transcript, created_at')
        .eq('user_id', user.id)
        .or(`summary.ilike.%${lowerQuery}%,transcript.ilike.%${lowerQuery}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      // Search topics
      const { data: topics } = await supabase
        .from('topics')
        .select('id, title, created_at')
        .eq('user_id', user.id)
        .ilike('title', `%${lowerQuery}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      // Combine results
      const combined: SearchResult[] = [
        ...(tasks || []).map(t => ({
          id: t.id,
          type: 'task' as const,
          title: t.text,
          created_at: t.created_at,
        })),
        ...(notes || []).map(n => ({
          id: n.id,
          type: 'note' as const,
          title: n.text,
          created_at: n.created_at,
        })),
        ...(voices || []).map(v => ({
          id: v.id,
          type: 'voice' as const,
          title: v.summary || 'Voice Note',
          subtitle: v.transcript?.substring(0, 100),
          created_at: v.created_at,
        })),
        ...(topics || []).map(t => ({
          id: t.id,
          type: 'topic' as const,
          title: t.title,
          created_at: t.created_at,
        })),
      ];

      // Sort by created_at
      combined.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setResults(combined);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) {
        search(query);
      } else {
        setResults([]);
        setHasSearched(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, search]);

  const handleResultPress = (item: SearchResult) => {
    Keyboard.dismiss();
    switch (item.type) {
      case 'task':
        router.push(`/task/${item.id}`);
        break;
      case 'note':
        router.push(`/note/${item.id}`);
        break;
      case 'voice':
        router.push(`/entry/${item.id}`);
        break;
      case 'topic':
        router.push(`/topic/${item.id}`);
        break;
    }
  };

  const getIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'task': return { name: 'checkbox', color: '#3b82f6' };
      case 'note': return { name: 'ellipse', color: '#a78bfa' };
      case 'voice': return { name: 'mic', color: '#22c55e' };
      case 'topic': return { name: 'bookmark', color: '#f59e0b' };
    }
  };

  const renderResult = ({ item }: { item: SearchResult }) => {
    const icon = getIcon(item.type);
    return (
      <TouchableOpacity 
        style={styles.resultItem}
        onPress={() => handleResultPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: `${icon.color}20` }]}>
          <Ionicons name={icon.name as any} size={18} color={icon.color} />
        </View>
        <View style={styles.resultContent}>
          <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
          {item.subtitle && (
            <Text style={styles.resultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
          )}
          <Text style={styles.resultMeta}>
            {item.type.charAt(0).toUpperCase() + item.type.slice(1)} · {formatRelativeDate(item.created_at)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#333" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tasks, notes, voice, topics..."
            placeholderTextColor="#555"
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color="#555" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#c4dfc4" />
        </View>
      ) : hasSearched && results.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={48} color="#333" />
          <Text style={styles.emptyTitle}>No results found</Text>
          <Text style={styles.emptyText}>Try a different search term</Text>
        </View>
      ) : !hasSearched ? (
        <View style={styles.centered}>
          <Ionicons name="search" size={48} color="#333" />
          <Text style={styles.emptyTitle}>Search everything</Text>
          <Text style={styles.emptyText}>Find tasks, notes, voice memos, and topics</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={styles.resultsList}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={styles.resultsCount}>
              {results.length} result{results.length !== 1 ? 's' : ''}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInputContainer: {
    flex: 1,
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
    fontSize: 16,
    color: '#fff',
    padding: 0,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
  },
  resultsList: {
    padding: 16,
  },
  resultsCount: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultContent: {
    flex: 1,
    gap: 4,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  resultSubtitle: {
    fontSize: 13,
    color: '#888',
  },
  resultMeta: {
    fontSize: 12,
    color: '#555',
  },
});

