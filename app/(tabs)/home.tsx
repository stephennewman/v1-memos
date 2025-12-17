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

// Unified item type for the feed
interface FeedItem {
  id: string;
  type: 'task' | 'voice' | 'note';
  text: string;
  status?: 'pending' | 'completed';
  created_at: string;
  entry_id?: string;
}

interface DayGroup {
  date: string;
  label: string;
  items: FeedItem[];
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { openCreateMenu } = useCreate();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
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
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  };

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      // Get all items from last 14 days
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

      // Get notes
      const { data: notes } = await supabase
        .from('voice_notes')
        .select('id, text, created_at, entry_id')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .gte('created_at', fourteenDaysAgoISO)
        .order('created_at', { ascending: false })
        .limit(30);

      // Combine all items into a unified feed
      const allItems: FeedItem[] = [
        ...(tasks || []).map(t => ({
          id: t.id,
          type: 'task' as const,
          text: t.text,
          status: t.status,
          created_at: t.created_at,
          entry_id: t.entry_id,
        })),
        ...(voiceNotes || []).map(v => ({
          id: v.id,
          type: 'voice' as const,
          text: v.summary || 'Voice Note',
          created_at: v.created_at,
        })),
        ...(notes || []).map(n => ({
          id: n.id,
          type: 'note' as const,
          text: n.text,
          created_at: n.created_at,
          entry_id: n.entry_id,
        })),
      ];

      // Sort by created_at descending
      allItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Group by date
      const groupMap = new Map<string, FeedItem[]>();
      allItems.forEach(item => {
        const key = getDateKey(item.created_at);
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
        }
        groupMap.get(key)!.push(item);
      });

      // Convert to array of day groups
      const groups: DayGroup[] = [];
      groupMap.forEach((items, dateKey) => {
        if (items.length > 0) {
          groups.push({
            date: dateKey,
            label: getDateLabel(items[0].created_at),
            items,
          });
        }
      });

      setDayGroups(groups);

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

  const toggleTask = useCallback(async (item: FeedItem) => {
    if (item.type !== 'task') return;
    
    const newStatus = item.status === 'pending' ? 'completed' : 'pending';
    
    // Optimistic update
    setDayGroups(prev => prev.map(group => ({
      ...group,
      items: group.items.map(i => 
        i.id === item.id ? { ...i, status: newStatus } : i
      ),
    })));
    
    try {
      await supabase
        .from('voice_todos')
        .update({ 
          status: newStatus, 
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null 
        })
        .eq('id', item.id);
      
      // Update stats
      if (newStatus === 'completed') {
        setTodayStats(prev => ({ ...prev, tasks: prev.tasks - 1, completed: prev.completed + 1 }));
      } else {
        setTodayStats(prev => ({ ...prev, tasks: prev.tasks + 1, completed: prev.completed - 1 }));
      }
    } catch (error) {
      // Revert on error
      setDayGroups(prev => prev.map(group => ({
        ...group,
        items: group.items.map(i => 
          i.id === item.id ? { ...i, status: item.status } : i
        ),
      })));
      console.error('Error toggling task:', error);
    }
  }, []);

  const navigateToItem = (item: FeedItem) => {
    switch (item.type) {
      case 'task':
        router.push(`/task/${item.id}`);
        break;
      case 'voice':
        router.push(`/entry/${item.id}`);
        break;
      case 'note':
        router.push(`/note/${item.id}`);
        break;
    }
  };

  const getItemIcon = (type: FeedItem['type'], status?: string) => {
    switch (type) {
      case 'task':
        return status === 'completed' ? 'checkmark-circle' : 'ellipse-outline';
      case 'voice':
        return 'mic';
      case 'note':
        return 'document-text-outline';
    }
  };

  const getItemColor = (type: FeedItem['type'], status?: string) => {
    switch (type) {
      case 'task':
        return status === 'completed' ? '#4ade80' : '#888';
      case 'voice':
        return '#c4dfc4';
      case 'note':
        return '#93c5fd';
    }
  };

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

  const hasContent = dayGroups.some(g => g.items.length > 0);

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

        {/* Day Groups */}
        {dayGroups.map((group) => (
          <View key={group.date} style={styles.dayGroup}>
            <Text style={styles.dayLabel}>{group.label}</Text>
            
            {group.items.map((item) => (
              <View key={`${item.type}-${item.id}`} style={styles.feedItem}>
                {/* Icon - left aligned, consistent size */}
                <TouchableOpacity
                  style={styles.itemIcon}
                  onPress={() => item.type === 'task' ? toggleTask(item) : navigateToItem(item)}
                >
                  <Ionicons
                    name={getItemIcon(item.type, item.status) as any}
                    size={18}
                    color={getItemColor(item.type, item.status)}
                  />
                </TouchableOpacity>
                
                {/* Content */}
                <TouchableOpacity
                  style={styles.itemContent}
                  onPress={() => navigateToItem(item)}
                >
                  <Text 
                    style={[
                      styles.itemText,
                      item.type === 'task' && item.status === 'completed' && styles.itemTextCompleted
                    ]} 
                    numberOfLines={1}
                  >
                    {item.text}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}

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
  dayGroup: {
    marginBottom: 20,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
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
    width: 36,
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  itemContent: {
    flex: 1,
    height: ITEM_HEIGHT,
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 15,
    color: '#ddd',
  },
  itemTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#555',
  },
});
