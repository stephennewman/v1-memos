import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TabHeader } from '@/components/TabHeader';
import { useAuth } from '@/lib/auth-context';
import { useCreate } from '@/lib/create-context';
import EmptyState from '@/components/EmptyState';
import { supabase } from '@/lib/supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://www.outcomeview.com';

// Types
interface TaskItem {
  id: string;
  text: string;
  status: 'pending' | 'completed';
  due_date?: string;
  entry_id?: string;
}

interface VoiceNote {
  id: string;
  summary: string;
  created_at: string;
}

interface NoteItem {
  id: string;
  entry_id?: string;
  text: string;
}

interface PendingFollowup {
  id: string;
  entry_id: string;
  text: string;
  days_ago: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { openCreateMenu } = useCreate();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Data organized by type
  const [todayTasks, setTodayTasks] = useState<TaskItem[]>([]);
  const [recentVoiceNotes, setRecentVoiceNotes] = useState<VoiceNote[]>([]);
  const [recentNotes, setRecentNotes] = useState<NoteItem[]>([]);
  const [followups, setFollowups] = useState<PendingFollowup[]>([]);
  const [todayStats, setTodayStats] = useState({ tasks: 0, completed: 0, voiceNotes: 0 });

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      // Get tasks due today or pending
      const { data: tasks } = await (supabase as any)
        .from('voice_todos')
        .select('id, text, status, due_date, entry_id')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(10);

      setTodayTasks(tasks || []);

      // Get recent voice notes (today)
      const { data: voiceNotes } = await (supabase as any)
        .from('voice_entries')
        .select('id, summary, created_at')
        .eq('user_id', user.id)
        .gte('created_at', todayISO)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentVoiceNotes(voiceNotes || []);

      // Get recent notes from voice_notes table
      const { data: notesData } = await (supabase as any)
        .from('voice_notes')
        .select('id, text, entry_id')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentNotes(notesData || []);

      // Load follow-ups
      try {
        const response = await fetch(
          `${API_URL}/api/voice/followups?user_id=${user.id}&min_days=3`
        );
        if (response.ok) {
          const data = await response.json();
          setFollowups((data.followups || []).slice(0, 3));
        }
      } catch {}

      // Stats
      const { count: taskCount } = await (supabase as any)
        .from('voice_todos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending');

      const { count: completedToday } = await (supabase as any)
        .from('voice_todos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .gte('completed_at', todayISO);

      setTodayStats({
        tasks: taskCount || 0,
        completed: completedToday || 0,
        voiceNotes: (voiceNotes || []).length,
      });

    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user && !authLoading) {
        loadData();
      } else if (!authLoading && !user) {
        setIsLoading(false);
      }
    }, [user, authLoading, loadData])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  const toggleTask = useCallback(async (task: TaskItem) => {
    const newStatus = task.status === 'pending' ? 'completed' : 'pending';
    
    // Optimistic update
    setTodayTasks(prev => prev.filter(t => t.id !== task.id));
    
    try {
      await (supabase as any)
        .from('voice_todos')
        .update({ 
          status: newStatus, 
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null 
        })
        .eq('id', task.id);
      
      // Update stats
      if (newStatus === 'completed') {
        setTodayStats(prev => ({ ...prev, tasks: prev.tasks - 1, completed: prev.completed + 1 }));
      }
    } catch (error) {
      // Revert on error
      setTodayTasks(prev => [...prev, task]);
      console.error('Error toggling task:', error);
    }
  }, []);

  const formatDate = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading || authLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TabHeader title="Home" subtitle={formatDate()} />
      
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#c4dfc4"
          />
        }
      >
        {/* Quick Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Text style={styles.statPillNumber}>{todayStats.tasks}</Text>
            <Text style={styles.statPillLabel}>pending</Text>
          </View>
          <View style={styles.statPill}>
            <Text style={[styles.statPillNumber, { color: '#4ade80' }]}>{todayStats.completed}</Text>
            <Text style={styles.statPillLabel}>done today</Text>
          </View>
          <View style={styles.statPill}>
            <Text style={[styles.statPillNumber, { color: '#c4dfc4' }]}>{todayStats.voiceNotes}</Text>
            <Text style={styles.statPillLabel}>notes today</Text>
          </View>
        </View>

        {/* Pending Follow-ups */}
        {followups.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="alert-circle" size={12} color="#fb923c" /> FOLLOW UP
            </Text>
            {followups.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={styles.followupItem}
                onPress={() => router.push(`/entry/${f.entry_id}`)}
              >
                <Text style={styles.followupText} numberOfLines={1}>{f.text}</Text>
                <Text style={styles.followupAge}>{f.days_ago}d</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Tasks Section */}
        {todayTasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>TASKS</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/tasks')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {todayTasks.map((task) => (
              <View key={task.id} style={styles.taskItem}>
                <TouchableOpacity
                  style={styles.taskCheckbox}
                  onPress={() => toggleTask(task)}
                >
                  <Ionicons
                    name={task.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={task.status === 'completed' ? '#4ade80' : '#444'}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.taskContent}
                  onPress={() => router.push(`/task/${task.id}`)}
                >
                  <Text style={styles.taskText} numberOfLines={1}>{task.text}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Voice Notes Section */}
        {recentVoiceNotes.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>VOICE NOTES</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/voice')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {recentVoiceNotes.map((note) => (
              <TouchableOpacity
                key={note.id}
                style={styles.voiceItem}
                onPress={() => router.push(`/entry/${note.id}`)}
              >
                <Ionicons name="mic" size={14} color="#c4dfc4" />
                <Text style={styles.voiceText} numberOfLines={1}>
                  {note.summary || 'Voice Note'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Notes (Bullet Points) Section */}
        {recentNotes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>RECENT NOTES</Text>
            {recentNotes.map((note) => (
              <TouchableOpacity
                key={note.id}
                style={styles.noteItem}
                onPress={() => router.push(`/note/${note.id}`)}
              >
                <Text style={styles.noteBullet}>•</Text>
                <Text style={styles.noteText} numberOfLines={2}>{note.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Empty State */}
        {todayTasks.length === 0 && recentVoiceNotes.length === 0 && recentNotes.length === 0 && (
          <EmptyState
            icon="sunny-outline"
            title="Good morning!"
            description="Start your day by recording a voice note or adding a task"
            actionLabel="Record Voice Note"
            onAction={() => router.push('/record')}
            secondaryActionLabel="Add Task"
            onSecondaryAction={openCreateMenu}
          />
        )}

        <View style={{ height: 100 }} />
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  statPillNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  statPillLabel: {
    fontSize: 11,
    color: '#666',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  seeAll: {
    fontSize: 12,
    color: '#c4dfc4',
    fontWeight: '500',
  },
  // Follow-up items - compact
  followupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1511',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 4,
    borderLeftWidth: 2,
    borderLeftColor: '#fb923c',
  },
  followupText: {
    flex: 1,
    fontSize: 13,
    color: '#ccc',
  },
  followupAge: {
    fontSize: 11,
    color: '#fb923c',
    fontWeight: '600',
    marginLeft: 8,
  },
  // Task items - compact with checkbox
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#151515',
  },
  taskCheckbox: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskContent: {
    flex: 1,
  },
  taskText: {
    fontSize: 14,
    color: '#ddd',
  },
  // Voice items - compact
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#151515',
  },
  voiceText: {
    flex: 1,
    fontSize: 14,
    color: '#ddd',
  },
  // Note items - compact
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 5,
    gap: 8,
  },
  noteBullet: {
    fontSize: 14,
    color: '#93c5fd',
    marginTop: 1,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: '#aaa',
    lineHeight: 18,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#444',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: '#333',
    marginTop: 4,
  },
});
