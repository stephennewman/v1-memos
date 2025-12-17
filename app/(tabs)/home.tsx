import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TabHeader } from '@/components/TabHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://www.outcomeview.com';

// Follow-up type
interface PendingFollowup {
  id: string;
  entry_id: string;
  text: string;
  timeframe?: string;
  days_ago: number;
  entry_title: string;
}

// Activity item types
type ActivityType = 'voice_note' | 'task_created' | 'task_completed';

interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  subtitle?: string;
  time: Date;
  data?: {
    entry_id?: string;
    task_id?: string;
    sentiment_label?: string;
    word_count?: number;
  };
}

interface DaySection {
  title: string;
  date: Date;
  data: ActivityItem[];
}

// Format date for section headers
function formatSectionTitle(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const itemDate = new Date(date);
  itemDate.setHours(0, 0, 0, 0);

  if (itemDate.getTime() === today.getTime()) {
    return 'TODAY';
  }
  if (itemDate.getTime() === yesterday.getTime()) {
    return 'YESTERDAY';
  }
  
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).toUpperCase();
}

// Format time for activity items
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Activity type config
const ACTIVITY_CONFIG: Record<ActivityType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  voice_note: { icon: 'mic', color: '#c4dfc4' },
  task_created: { icon: 'add-circle', color: '#a78bfa' },
  task_completed: { icon: 'checkmark-circle', color: '#4ade80' },
};

export default function HomeScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sections, setSections] = useState<DaySection[]>([]);
  const [todayStats, setTodayStats] = useState({
    voiceNotes: 0,
    tasksCreated: 0,
    tasksCompleted: 0,
  });
  const [followups, setFollowups] = useState<PendingFollowup[]>([]);

  const loadFollowups = useCallback(async () => {
    if (!user) return;
    
    try {
      const response = await fetch(
        `${API_URL}/api/voice/followups?user_id=${user.id}&min_days=3`
      );
      if (response.ok) {
        const data = await response.json();
        setFollowups(data.followups || []);
      }
    } catch (error) {
      console.error('Error loading followups:', error);
    }
  }, [user]);

  const loadActivity = useCallback(async () => {
    if (!user) return;

    try {
      // Get voice entries from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: voiceEntries } = await (supabase as any)
        .from('voice_entries')
        .select('id, summary, created_at, sentiment_label, word_count')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      // Get tasks from last 30 days
      const { data: tasks } = await (supabase as any)
        .from('voice_todos')
        .select('id, text, created_at, completed_at, status, entry_id')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      // Build activity items
      const activities: ActivityItem[] = [];

      // Add voice notes
      (voiceEntries || []).forEach((entry: any) => {
        activities.push({
          id: `voice_${entry.id}`,
          type: 'voice_note',
          title: entry.summary || 'Voice Note',
          subtitle: entry.word_count ? `${entry.word_count} words` : undefined,
          time: new Date(entry.created_at),
          data: {
            entry_id: entry.id,
            sentiment_label: entry.sentiment_label,
            word_count: entry.word_count,
          },
        });
      });

      // Add task creations
      (tasks || []).forEach((task: any) => {
        activities.push({
          id: `task_created_${task.id}`,
          type: 'task_created',
          title: task.text,
          time: new Date(task.created_at),
          data: { task_id: task.id, entry_id: task.entry_id },
        });

        // Add task completions if completed
        if (task.status === 'completed' && task.completed_at) {
          activities.push({
            id: `task_completed_${task.id}`,
            type: 'task_completed',
            title: task.text,
            time: new Date(task.completed_at),
            data: { task_id: task.id },
          });
        }
      });

      // Sort by time descending
      activities.sort((a, b) => b.time.getTime() - a.time.getTime());

      // Group by day
      const dayMap = new Map<string, ActivityItem[]>();
      activities.forEach((activity) => {
        const dateKey = activity.time.toISOString().split('T')[0];
        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, []);
        }
        dayMap.get(dateKey)!.push(activity);
      });

      // Convert to sections
      const newSections: DaySection[] = [];
      dayMap.forEach((items, dateKey) => {
        const date = new Date(dateKey);
        newSections.push({
          title: formatSectionTitle(date),
          date,
          data: items,
        });
      });

      // Sort sections by date descending
      newSections.sort((a, b) => b.date.getTime() - a.date.getTime());
      setSections(newSections);

      // Calculate today's stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayActivities = activities.filter(a => {
        const actDate = new Date(a.time);
        actDate.setHours(0, 0, 0, 0);
        return actDate.getTime() === today.getTime();
      });

      setTodayStats({
        voiceNotes: todayActivities.filter(a => a.type === 'voice_note').length,
        tasksCreated: todayActivities.filter(a => a.type === 'task_created').length,
        tasksCompleted: todayActivities.filter(a => a.type === 'task_completed').length,
      });

    } catch (error) {
      console.error('Error loading activity:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user && !authLoading) {
        loadActivity();
        loadFollowups();
      } else if (!authLoading && !user) {
        setIsLoading(false);
      }
    }, [user, authLoading, loadActivity, loadFollowups])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadActivity();
  }, [loadActivity]);

  const formatDate = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleActivityPress = (item: ActivityItem) => {
    if (item.type === 'voice_note' && item.data?.entry_id) {
      router.push(`/entry/${item.data.entry_id}`);
    } else if ((item.type === 'task_created' || item.type === 'task_completed') && item.data?.task_id) {
      router.push(`/task/${item.data.task_id}`);
    }
  };

  const renderActivity = ({ item }: { item: ActivityItem }) => {
    const config = ACTIVITY_CONFIG[item.type];
    
    return (
      <TouchableOpacity 
        style={styles.activityItem}
        onPress={() => handleActivityPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.activityIcon, { backgroundColor: `${config.color}15` }]}>
          <Ionicons name={config.icon} size={18} color={config.color} />
        </View>
        <View style={styles.activityContent}>
          <Text style={styles.activityTitle} numberOfLines={1}>
            {item.type === 'task_completed' ? '✓ ' : ''}{item.title}
          </Text>
          {item.subtitle && (
            <Text style={styles.activitySubtitle}>{item.subtitle}</Text>
          )}
        </View>
        <Text style={styles.activityTime}>{formatTime(item.time)}</Text>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: DaySection }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionCount}>{section.data.length} items</Text>
    </View>
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
      <TabHeader title="Home" subtitle={formatDate()} />
      
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderActivity}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#c4dfc4"
          />
        }
        ListHeaderComponent={() => (
          <>
            {/* Today's Stats */}
            <View style={styles.statsSection}>
              <Text style={styles.statsTitle}>TODAY'S ACTIVITY</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <View style={[styles.statIcon, { backgroundColor: '#c4dfc420' }]}>
                    <Ionicons name="mic" size={20} color="#c4dfc4" />
                  </View>
                  <Text style={styles.statNumber}>{todayStats.voiceNotes}</Text>
                  <Text style={styles.statLabel}>Notes</Text>
                </View>
                
                <View style={styles.statCard}>
                  <View style={[styles.statIcon, { backgroundColor: '#a78bfa20' }]}>
                    <Ionicons name="add-circle" size={20} color="#a78bfa" />
                  </View>
                  <Text style={styles.statNumber}>{todayStats.tasksCreated}</Text>
                  <Text style={styles.statLabel}>Created</Text>
                </View>
                
                <View style={styles.statCard}>
                  <View style={[styles.statIcon, { backgroundColor: '#4ade8020' }]}>
                    <Ionicons name="checkmark-circle" size={20} color="#4ade80" />
                  </View>
                  <Text style={styles.statNumber}>{todayStats.tasksCompleted}</Text>
                  <Text style={styles.statLabel}>Done</Text>
                </View>
              </View>
            </View>

            {/* Pending Follow-ups */}
            {followups.length > 0 && (
              <View style={styles.followupsSection}>
                <Text style={styles.statsTitle}>PENDING FOLLOW-UPS</Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.followupsScroll}
                >
                  {followups.slice(0, 5).map((followup) => (
                    <TouchableOpacity
                      key={followup.id}
                      style={styles.followupCard}
                      onPress={() => router.push(`/entry/${followup.entry_id}`)}
                    >
                      <View style={styles.followupHeader}>
                        <Ionicons name="alert-circle" size={16} color="#fb923c" />
                        <Text style={styles.followupDays}>{followup.days_ago}d ago</Text>
                      </View>
                      <Text style={styles.followupText} numberOfLines={2}>
                        {followup.text}
                      </Text>
                      {followup.timeframe && (
                        <Text style={styles.followupTimeframe}>
                          Original: "{followup.timeframe}"
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={48} color="#333" />
            <Text style={styles.emptyTitle}>No Activity Yet</Text>
            <Text style={styles.emptyText}>
              Record a voice note or create a task to get started
            </Text>
          </View>
        )}
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  statsSection: {
    marginTop: 16,
    marginBottom: 24,
  },
  statsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 1,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  followupsSection: {
    marginBottom: 24,
  },
  followupsScroll: {
    gap: 12,
  },
  followupCard: {
    width: 200,
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fb923c30',
  },
  followupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  followupDays: {
    fontSize: 12,
    color: '#fb923c',
    fontWeight: '600',
  },
  followupText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
  },
  followupTimeframe: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },
  statCard: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    backgroundColor: '#0a0a0a',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 1,
  },
  sectionCount: {
    fontSize: 11,
    color: '#444',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
    marginRight: 8,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  activitySubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  activityTime: {
    fontSize: 12,
    color: '#555',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#444',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#333',
    marginTop: 4,
    textAlign: 'center',
  },
});
