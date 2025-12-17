import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth, MAX_FREE_TOPICS } from '@/lib/auth-context';
import { generateMemos } from '@/lib/api';
import type { MemoTopic } from '@/lib/types';

export default function LibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading, topicCount, canCreateTopic, refreshTopicCount } = useAuth();
  
  const [topics, setTopics] = useState<MemoTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [creatingStatus, setCreatingStatus] = useState<string | null>(null);

  // Load topics function - takes userId to avoid closure issues
  const loadTopics = useCallback(async (userId: string) => {
    console.log('[Library] loadTopics called for user:', userId);
    
    try {
      const { data, error } = await supabase
        .from('memo_topics')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      console.log('[Library] Topics loaded:', data?.length || 0, 'error:', error?.message || 'none');
      
      if (error) throw error;
      setTopics(data || []);
      await refreshTopicCount();
    } catch (error) {
      console.error('[Library] Error loading topics:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [refreshTopicCount]);

  // Reload topics whenever this screen comes into focus AND user is available
  useFocusEffect(
    useCallback(() => {
      if (user && !authLoading) {
        loadTopics(user.id);
      } else if (!authLoading && !user) {
        setIsLoading(false);
      }
    }, [user, authLoading, loadTopics])
  );

  const onRefresh = useCallback(() => {
    if (!user) return;
    setIsRefreshing(true);
    loadTopics(user.id);
  }, [user, loadTopics]);

  const createTopic = async () => {
    if (!newTopicTitle.trim() || isCreating || !user) return;

    if (!canCreateTopic) {
      Alert.alert(
        'Topic Limit Reached',
        `You've reached the free limit of ${MAX_FREE_TOPICS} topics. More coming soon!`,
        [{ text: 'OK' }]
      );
      return;
    }

    setIsCreating(true);
    setCreatingStatus('Creating topic...');

    try {
      const { data: topic, error } = await supabase
        .from('memo_topics')
        .insert({ user_id: user.id, title: newTopicTitle.trim() })
        .select()
        .single();

      if (error) throw error;

      setCreatingStatus('Generating memos...');
      
      // Try to generate memos, but don't fail if it doesn't work
      try {
        await generateMemos(topic.id, 10);
      } catch (genError) {
        console.log('Initial memo generation failed, user can retry:', genError);
        // Continue anyway - user can generate from the topic screen
      }

      setNewTopicTitle('');
      setShowCreate(false);
      await refreshTopicCount();
      
      // Navigate to the new topic
      router.push(`/topic/${topic.id}`);
    } catch (error: any) {
      console.error('Error creating topic:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      Alert.alert('Error', `Failed to create topic: ${errorMessage}`);
    } finally {
      setIsCreating(false);
      setCreatingStatus(null);
    }
  };

  const deleteTopic = async (topicId: string) => {
    Alert.alert(
      'Delete Topic',
      'Delete this topic and all its memos?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('memo_topics').delete().eq('id', topicId);
              setTopics(topics.filter(t => t.id !== topicId));
              await refreshTopicCount();
            } catch (error) {
              console.error('Error deleting topic:', error);
            }
          },
        },
      ]
    );
  };

  const renderTopic = ({ item }: { item: MemoTopic }) => (
    <TouchableOpacity
      style={styles.topicCard}
      onPress={() => router.push(`/topic/${item.id}`)}
      onLongPress={() => deleteTopic(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.topicIcon}>
        <Ionicons name="bookmark" size={20} color="#c4dfc4" />
      </View>
      <View style={styles.topicContent}>
        <Text style={styles.topicTitle}>{item.title}</Text>
        <Text style={styles.topicMeta}>
          {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#666" />
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Creating Overlay */}
      {creatingStatus && (
        <View style={styles.creatingOverlay}>
          <ActivityIndicator size="large" color="#c4dfc4" />
          <Text style={styles.creatingText}>{creatingStatus}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Topics</Text>
          <Text style={styles.headerSubtitle}>
            {topicCount}/{MAX_FREE_TOPICS} topics
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.profileButton}
          onPress={() => router.push('/(tabs)/settings')}
        >
          <Ionicons name="person-circle-outline" size={28} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Create Topic Input */}
      {showCreate && (
        <View style={styles.createContainer}>
          <TextInput
            style={styles.createInput}
            placeholder="Topic name (e.g., Golf, Cooking)"
            placeholderTextColor="#666"
            value={newTopicTitle}
            onChangeText={setNewTopicTitle}
            autoFocus
            onSubmitEditing={createTopic}
          />
          <View style={styles.createActions}>
            <TouchableOpacity
              onPress={() => { setShowCreate(false); setNewTopicTitle(''); }}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={createTopic}
              disabled={!newTopicTitle.trim() || isCreating}
              style={[styles.createButton, (!newTopicTitle.trim() || isCreating) && styles.createButtonDisabled]}
            >
              <Text style={styles.createButtonText}>
                {isCreating ? 'Creating...' : 'Create'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Topics List */}
      {topics.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bookmark-outline" size={64} color="#333" />
          <Text style={styles.emptyTitle}>No topics yet</Text>
          <Text style={styles.emptySubtitle}>
            Create your first topic to start learning
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => setShowCreate(true)}
          >
            <Text style={styles.emptyButtonText}>Create Topic</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={topics}
          renderItem={renderTopic}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#c4dfc4"
            />
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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#c4dfc4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#333',
  },
  createContainer: {
    padding: 16,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  createInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 12,
  },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 15,
  },
  createButton: {
    backgroundColor: '#c4dfc4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: '#0a0a0a',
    fontSize: 15,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  topicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  topicIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(196, 223, 196, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  topicContent: {
    flex: 1,
  },
  topicTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  topicMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  emptyButton: {
    backgroundColor: 'rgba(196, 223, 196, 0.1)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 24,
  },
  emptyButtonText: {
    color: '#c4dfc4',
    fontSize: 15,
    fontWeight: '600',
  },
  creatingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 10, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  creatingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
});

