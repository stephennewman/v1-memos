import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { VoiceEntry, VoiceTodo, VoiceNote as VoiceNoteType } from '@/lib/types';

export default function PersonDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { name } = useLocalSearchParams<{ name: string }>();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Related content
  const [voiceEntries, setVoiceEntries] = useState<VoiceEntry[]>([]);
  const [tasks, setTasks] = useState<VoiceTodo[]>([]);
  const [notes, setNotes] = useState<VoiceNoteType[]>([]);

  const decodedName = name ? decodeURIComponent(name) : '';

  const loadData = useCallback(async () => {
    if (!user || !decodedName) return;

    setError(null);
    
    try {
      // Find all voice entries that mention this person
      const { data: entries, error: entriesError } = await supabase
        .from('voice_entries')
        .select('*')
        .eq('user_id', user.id)
        .contains('extracted_people', [decodedName])
        .order('created_at', { ascending: false });

      if (entriesError) throw entriesError;
      
      setVoiceEntries(entries || []);

      // Get entry IDs
      const entryIds = (entries || []).map(e => e.id);

      if (entryIds.length > 0) {
        // Get tasks from those entries
        const { data: tasksData } = await supabase
          .from('voice_todos')
          .select('*')
          .eq('user_id', user.id)
          .in('entry_id', entryIds)
          .order('created_at', { ascending: false });

        setTasks(tasksData || []);

        // Get notes from those entries
        const { data: notesData } = await supabase
          .from('voice_notes')
          .select('*')
          .eq('user_id', user.id)
          .in('entry_id', entryIds)
          .eq('is_archived', false)
          .order('created_at', { ascending: false });

        setNotes(notesData || []);
      }
    } catch (err: any) {
      console.error('Error loading person data:', err);
      setError(err?.message || 'Failed to load data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [user, decodedName]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const toggleTaskStatus = async (task: VoiceTodo) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    
    try {
      await supabase
        .from('voice_todos')
        .update({ 
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', task.id);
      
      setTasks(tasks.map(t => 
        t.id === task.id ? { ...t, status: newStatus } : t
      ));
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Ionicons name="person" size={20} color="#c4dfc4" />
            <Text style={styles.headerTitle}>{decodedName}</Text>
          </View>
          <View style={styles.headerRight} />
        </View>
        <View style={[styles.content, styles.centered]}>
          <Ionicons name="cloud-offline-outline" size={48} color="#666" />
          <Text style={styles.errorTitle}>Connection Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => {
              setIsLoading(true);
              loadData();
            }}
          >
            <Ionicons name="refresh" size={18} color="#0a0a0a" />
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const totalItems = voiceEntries.length + tasks.length + notes.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="person" size={20} color="#c4dfc4" />
          <Text style={styles.headerTitle}>{decodedName}</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#666"
          />
        }
      >
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{voiceEntries.length}</Text>
            <Text style={styles.statLabel}>Voice Notes</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{tasks.length}</Text>
            <Text style={styles.statLabel}>Tasks</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{notes.length}</Text>
            <Text style={styles.statLabel}>Notes</Text>
          </View>
        </View>

        {/* Voice Entries Section */}
        {voiceEntries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>VOICE NOTES ({voiceEntries.length})</Text>
            {voiceEntries.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={styles.entryItem}
                onPress={() => router.push(`/entry/${entry.id}`)}
              >
                <Ionicons name="play" size={16} color="#22c55e" />
                <View style={styles.entryContent}>
                  <Text style={styles.entryTitle} numberOfLines={1}>
                    {entry.summary || 'Voice Note'}
                  </Text>
                  <Text style={styles.entryDate}>
                    {new Date(entry.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#444" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Tasks Section */}
        {tasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TASKS ({tasks.length})</Text>
            {tasks.map((task) => (
              <TouchableOpacity
                key={task.id}
                style={styles.taskItem}
                onPress={() => router.push(`/task/${task.id}`)}
              >
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); toggleTaskStatus(task); }}
                  style={styles.checkbox}
                >
                  <Ionicons 
                    name={task.status === 'completed' ? "checkbox" : "square-outline"} 
                    size={22} 
                    color={task.status === 'completed' ? '#3b82f6' : '#666'} 
                  />
                </TouchableOpacity>
                <View style={styles.taskContent}>
                  <Text 
                    style={[
                      styles.taskText,
                      task.status === 'completed' && styles.taskTextCompleted
                    ]} 
                    numberOfLines={2}
                  >
                    {task.text}
                  </Text>
                  {task.due_date && (
                    <Text style={styles.taskDue}>
                      Due: {new Date(task.due_date).toLocaleDateString('en-US', { 
                        month: 'short', day: 'numeric' 
                      })}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color="#444" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Notes Section */}
        {notes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NOTES ({notes.length})</Text>
            {notes.map((note) => (
              <TouchableOpacity
                key={note.id}
                style={styles.noteItem}
                onPress={() => router.push(`/note/${note.id}`)}
              >
                <Ionicons name="ellipse" size={10} color="#a78bfa" style={{ marginHorizontal: 4 }} />
                <Text style={styles.noteText} numberOfLines={2}>{note.text}</Text>
                <Ionicons name="chevron-forward" size={16} color="#444" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Empty State */}
        {totalItems === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="person-outline" size={48} color="#333" />
            <Text style={styles.emptyTitle}>No content found</Text>
            <Text style={styles.emptyText}>
              No voice notes, tasks, or notes mention {decodedName} yet.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  headerRight: {
    width: 44,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#c4dfc4',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 1,
    marginBottom: 12,
  },
  entryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    gap: 12,
  },
  entryContent: {
    flex: 1,
  },
  entryTitle: {
    fontSize: 15,
    color: '#fff',
    marginBottom: 2,
  },
  entryDate: {
    fontSize: 12,
    color: '#666',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    gap: 10,
  },
  checkbox: {
    padding: 2,
  },
  taskContent: {
    flex: 1,
  },
  taskText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 20,
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  taskDue: {
    fontSize: 12,
    color: '#c4dfc4',
    marginTop: 4,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    gap: 12,
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 32,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#c4dfc4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0a0a0a',
  },
});

