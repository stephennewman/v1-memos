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

interface TaskItem {
  id: string;
  text: string;
  status: 'pending' | 'completed';
  created_at: string;
  entry_id?: string;
}

interface VoiceItem {
  id: string;
  summary: string;
  created_at: string;
}

interface NoteItem {
  id: string;
  text: string;
  created_at: string;
  entry_id?: string;
}

interface DayData {
  date: string;
  label: string;
  voice: VoiceItem[];
  tasks: TaskItem[];
  notes: NoteItem[];
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { openCreateMenu } = useCreate();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dayData, setDayData] = useState<DayData[]>([]);
  const [todayStats, setTodayStats] = useState({ tasks: 0, completed: 0, voiceNotes: 0 });

  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - itemDate.getTime()) / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDateKey = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      // Get items from last 14 days
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const fourteenDaysAgoISO = fourteenDaysAgo.toISOString();

      // Get tasks
      const { data: tasks } = await supabase
        .from('voice_todos')
        .select('id, text, status, created_at, entry_id')
        .eq('user_id', user.id)
        .gte('created_at', fourteenDaysAgoISO)
        .order('created_at', { ascending: false })
        .limit(50);

      // Get voice notes
      const { data: voiceNotes } = await supabase
        .from('voice_entries')
        .select('id, summary, created_at')
        .eq('user_id', user.id)
        .gte('created_at', fourteenDaysAgoISO)
        .order('created_at', { ascending: false })
        .limit(30);

      // Get notes (bullet points)
      const { data: notes } = await supabase
        .from('voice_notes')
        .select('id, text, created_at, entry_id')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .gte('created_at', fourteenDaysAgoISO)
        .order('created_at', { ascending: false })
        .limit(30);

      // Group by date
      const dayMap = new Map<string, DayData>();

      // Add voice notes
      (voiceNotes || []).forEach(v => {
        const key = getDateKey(v.created_at);
        if (!dayMap.has(key)) {
          dayMap.set(key, { 
            date: key, 
            label: getDateLabel(v.created_at), 
            voice: [], 
            tasks: [], 
            notes: [] 
          });
        }
        dayMap.get(key)!.voice.push(v);
      });

      // Add tasks
      (tasks || []).forEach(t => {
        const key = getDateKey(t.created_at);
        if (!dayMap.has(key)) {
          dayMap.set(key, { 
            date: key, 
            label: getDateLabel(t.created_at), 
            voice: [], 
            tasks: [], 
            notes: [] 
          });
        }
        dayMap.get(key)!.tasks.push(t);
      });

      // Add notes
      (notes || []).forEach(n => {
        const key = getDateKey(n.created_at);
        if (!dayMap.has(key)) {
          dayMap.set(key, { 
            date: key, 
            label: getDateLabel(n.created_at), 
            voice: [], 
            tasks: [], 
            notes: [] 
          });
        }
        dayMap.get(key)!.notes.push(n);
      });

      // Sort days descending
      const sortedDays = Array.from(dayMap.values()).sort((a, b) => 
        b.date.localeCompare(a.date)
      );

      setDayData(sortedDays);

      // Stats for today
      const { count: pendingCount } = await supabase
        .from('voice_todos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending');

      const { count: completedToday } = await supabase
        .from('voice_todos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .gte('completed_at', todayISO);

      const todayVoiceCount = (voiceNotes || []).filter(v => 
        new Date(v.created_at) >= today
      ).length;

      setTodayStats({
        tasks: pendingCount || 0,
        completed: completedToday || 0,
        voiceNotes: todayVoiceCount,
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
    setDayData(prev => prev.map(day => ({
      ...day,
      tasks: day.tasks.map(t => 
        t.id === task.id ? { ...t, status: newStatus } : t
      ),
    })));
    
    try {
      await supabase
        .from('voice_todos')
        .update({ 
          status: newStatus, 
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null 
        })
        .eq('id', task.id);
      
      if (newStatus === 'completed') {
        setTodayStats(prev => ({ ...prev, tasks: prev.tasks - 1, completed: prev.completed + 1 }));
      } else {
        setTodayStats(prev => ({ ...prev, tasks: prev.tasks + 1, completed: prev.completed - 1 }));
      }
    } catch (error) {
      // Revert on error
      setDayData(prev => prev.map(day => ({
        ...day,
        tasks: day.tasks.map(t => 
          t.id === task.id ? { ...t, status: task.status } : t
        ),
      })));
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

  const hasContent = dayData.some(d => d.voice.length > 0 || d.tasks.length > 0 || d.notes.length > 0);

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

        {/* Day Sections */}
        {dayData.map((day) => {
          const hasVoice = day.voice.length > 0;
          const hasTasks = day.tasks.length > 0;
          const hasNotes = day.notes.length > 0;
          
          if (!hasVoice && !hasTasks && !hasNotes) return null;

          return (
            <View key={day.date} style={styles.daySection}>
              <Text style={styles.dayLabel}>{day.label}</Text>
              
              {/* Voice Notes */}
              {hasVoice && (
                <View style={styles.typeSection}>
                  <View style={styles.typeLabelRow}>
                    <Ionicons name="mic" size={14} color="#c4dfc4" />
                    <Text style={styles.typeLabel}>Voice Notes</Text>
                  </View>
                  {day.voice.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.feedItem}
                      onPress={() => router.push(`/entry/${item.id}`)}
                    >
                      <Ionicons name="mic" size={18} color="#c4dfc4" style={styles.itemIcon} />
                      <Text style={styles.itemText} numberOfLines={1}>
                        {item.summary || 'Voice Note'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Tasks */}
              {hasTasks && (
                <View style={styles.typeSection}>
                  <View style={styles.typeLabelRow}>
                    <Ionicons name="checkbox-outline" size={14} color="#888" />
                    <Text style={styles.typeLabel}>Tasks</Text>
                  </View>
                  {day.tasks.map((task) => (
                    <View key={task.id} style={styles.feedItem}>
                      <TouchableOpacity
                        style={styles.taskCheckArea}
                        onPress={() => toggleTask(task)}
                      >
                        <Ionicons
                          name={task.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
                          size={18}
                          color={task.status === 'completed' ? '#4ade80' : '#555'}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.taskTextArea}
                        onPress={() => router.push(`/task/${task.id}`)}
                      >
                        <Text 
                          style={[
                            styles.itemText,
                            task.status === 'completed' && styles.itemTextCompleted
                          ]} 
                          numberOfLines={1}
                        >
                          {task.text}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Notes */}
              {hasNotes && (
                <View style={styles.typeSection}>
                  <View style={styles.typeLabelRow}>
                    <Ionicons name="document-text-outline" size={14} color="#93c5fd" />
                    <Text style={styles.typeLabel}>Notes</Text>
                  </View>
                  {day.notes.map((note) => (
                    <TouchableOpacity
                      key={note.id}
                      style={styles.feedItem}
                      onPress={() => router.push(`/note/${note.id}`)}
                    >
                      <Ionicons name="document-text-outline" size={18} color="#93c5fd" style={styles.itemIcon} />
                      <Text style={styles.itemText} numberOfLines={1}>{note.text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Empty State */}
        {!hasContent && (
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

const ITEM_HEIGHT = 44;

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
    marginBottom: 24,
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
  daySection: {
    marginBottom: 24,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  typeSection: {
    marginBottom: 12,
  },
  typeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    paddingLeft: 2,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  feedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ITEM_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  itemIcon: {
    width: 28,
    marginRight: 8,
  },
  taskCheckArea: {
    width: 28,
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    marginRight: 8,
  },
  taskTextArea: {
    flex: 1,
    height: ITEM_HEIGHT,
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 15,
    color: '#ddd',
    flex: 1,
  },
  itemTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#555',
  },
});
