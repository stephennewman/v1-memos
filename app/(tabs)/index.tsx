import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
  Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TabHeader } from '@/components/TabHeader';
import { useAuth } from '@/lib/auth-context';
import { useCreate } from '@/lib/create-context';
import EmptyState from '@/components/EmptyState';
import { supabase } from '@/lib/supabase';
import { TrackerRow } from '@/components/TrackerRow';
import { DailyCard, ChallengeCard } from '@/components/DailyCard';
import { getProfile, getTodayDailys, updateChallengeStatus, UserDaily, UserChallenge } from '@/lib/guy-talk';

interface TaskItem {
  id: string;
  text: string;
  status: 'pending' | 'completed';
  created_at: string;
  entry_id?: string;
  due_date?: string;
}

// Format due date helper
const formatDueDate = (dateStr?: string) => {
  if (!dateStr) return null;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return { text: dateStr, color: '#666' };
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffMs = dueDate.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays < 0) return { text: 'Overdue', color: '#ef4444' };
  if (diffDays === 0) return { text: 'Today', color: '#fcd34d' };
  if (diffDays === 1) return { text: 'Tomorrow', color: '#fb923c' };
  if (diffDays <= 7) return { text: `${diffDays} days`, color: '#9ca3af' };
  return { text: date.toLocaleDateString(), color: '#666' };
};

// Animated task item component for completion animation
const AnimatedHomeTaskItem = ({
  task,
  onComplete,
  onPress
}: {
  task: TaskItem;
  onComplete: (task: TaskItem) => void;
  onPress: (task: TaskItem) => void;
}) => {
  const [isCompleting, setIsCompleting] = useState(false);
  const strikeWidth = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const fillWidth = useRef(new Animated.Value(0)).current;

  const handleComplete = () => {
    if (task.status === 'completed' || isCompleting) {
      onComplete(task);
      return;
    }

    setIsCompleting(true);

    // Animate green fill bar and strikethrough together
    Animated.parallel([
      Animated.timing(fillWidth, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }),
      Animated.timing(strikeWidth, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }),
    ]).start(() => {
      // Then fade out
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        onComplete(task);
      });
    });
  };

  const isCompleted = task.status === 'completed';
  const dueInfo = formatDueDate(task.due_date);

  return (
    <Animated.View style={[styles.animatedTaskContainer, { opacity }]}>
      {/* Green fill background */}
      <Animated.View
        style={[
          styles.taskFillBar,
          {
            width: fillWidth.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          }
        ]}
      />

      <View style={styles.feedItem}>
        <TouchableOpacity
          style={styles.taskCheckArea}
          onPress={handleComplete}
        >
          <Ionicons
            name={isCompleted ? 'checkbox' : 'square-outline'}
            size={18}
            color={isCompleted ? '#4ade80' : '#555'}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.taskTextArea}
          onPress={() => onPress(task)}
        >
          <View style={styles.taskTextWrapper}>
            <View style={styles.taskTextRow}>
              <Text
                style={[
                  styles.itemText,
                  isCompleted && styles.itemTextCompleted
                ]}
                numberOfLines={1}
              >
                {task.text}
              </Text>
              {/* Due date badge */}
              {dueInfo && !isCompleted && (
                <View style={[styles.dueBadge, { backgroundColor: dueInfo.color + '20' }]}>
                  <Ionicons name="calendar-outline" size={10} color={dueInfo.color} />
                  <Text style={[styles.dueText, { color: dueInfo.color }]}>
                    {dueInfo.text}
                  </Text>
                </View>
              )}
            </View>
            {/* Strikethrough animation */}
            {!isCompleted && (
              <Animated.View
                style={[
                  styles.strikethroughLine,
                  {
                    width: strikeWidth.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  }
                ]}
              />
            )}
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

// Toast component for undo
const UndoToast = ({
  visible,
  onUndo,
  onDismiss,
}: {
  visible: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) => {
  const translateY = useRef(new Animated.Value(100)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();

      const timer = setTimeout(() => {
        onDismiss();
      }, 4000);
      return () => clearTimeout(timer);
    } else {
      Animated.timing(translateY, {
        toValue: 100,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.toast, { transform: [{ translateY }] }]}>
      <Ionicons name="checkmark-circle" size={20} color="#4ade80" />
      <Text style={styles.toastText}>Task completed</Text>
      <TouchableOpacity onPress={onUndo} style={styles.toastBtn}>
        <Text style={styles.toastBtnText}>Undo</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

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
  const [expandedVoice, setExpandedVoice] = useState<Set<string>>(new Set());
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [taskView, setTaskView] = useState<'todo' | 'done'>('todo');
  const [taskSort, setTaskSort] = useState<'newest' | 'oldest' | 'due_next'>('newest');
  const [toastVisible, setToastVisible] = useState(false);
  const [lastCompletedTask, setLastCompletedTask] = useState<TaskItem | null>(null);
  
  // Guy Talk state
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [dailys, setDailys] = useState<UserDaily[]>([]);
  const [challenge, setChallenge] = useState<UserChallenge | null>(null);
  const [userName, setUserName] = useState<string>('');

  const toggleVoiceExpanded = (dateKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedVoice(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  const toggleNotesExpanded = (dateKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

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

      // Get items from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

      // Get tasks
      const { data: tasks } = await supabase
        .from('voice_todos')
        .select('id, text, status, created_at, entry_id, due_date')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgoISO)
        .order('created_at', { ascending: false })
        .limit(100);

      // Get voice notes
      const { data: voiceNotes } = await supabase
        .from('voice_entries')
        .select('id, summary, created_at')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgoISO)
        .order('created_at', { ascending: false })
        .limit(50);

      // Get notes (bullet points)
      const { data: notes } = await supabase
        .from('voice_notes')
        .select('id, text, created_at, entry_id')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .gte('created_at', thirtyDaysAgoISO)
        .order('created_at', { ascending: false })
        .limit(100);

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

  // Load Guy Talk data (profile, dailys, challenge)
  const loadGuyTalkData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Check if onboarding is needed
      const { profile, onboarding_required } = await getProfile();
      setNeedsOnboarding(onboarding_required);
      
      if (profile) {
        // Extract first name from profile or user email
        const firstName = user.email?.split('@')[0] || 'there';
        setUserName(firstName.charAt(0).toUpperCase() + firstName.slice(1));
      }
      
      // Load dailys and challenge if onboarded
      if (!onboarding_required) {
        const { dailys: todayDailys, challenge: todayChallenge } = await getTodayDailys();
        setDailys(todayDailys);
        setChallenge(todayChallenge || null);
      }
    } catch (error) {
      console.error('[Home] Error loading Guy Talk data:', error);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user && !authLoading) {
        loadData();
        loadGuyTalkData();
      } else if (!authLoading && !user) {
        setIsLoading(false);
      }
    }, [user, authLoading, loadData, loadGuyTalkData])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
    loadGuyTalkData();
  }, [loadData, loadGuyTalkData]);
  
  const handleChallengeStatusChange = useCallback(async (status: 'accepted' | 'completed' | 'skipped') => {
    if (!challenge) return;
    const result = await updateChallengeStatus(challenge.id, status);
    if (result.success) {
      setChallenge(prev => prev ? { ...prev, status, streak_count: result.streak || prev.streak_count } : null);
    }
  }, [challenge]);

  const toggleTask = useCallback(async (task: TaskItem) => {
    const newStatus = task.status === 'pending' ? 'completed' : 'pending';

    // Show toast and store for undo when completing
    if (newStatus === 'completed') {
      setLastCompletedTask(task);
      setToastVisible(true);
    }

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

  const undoComplete = useCallback(async () => {
    if (!lastCompletedTask) return;

    setToastVisible(false);

    // Revert UI
    setDayData(prev => prev.map(day => ({
      ...day,
      tasks: day.tasks.map(t =>
        t.id === lastCompletedTask.id ? { ...t, status: 'pending' } : t
      ),
    })));

    // Revert in DB
    try {
      await supabase
        .from('voice_todos')
        .update({ status: 'pending', completed_at: null })
        .eq('id', lastCompletedTask.id);

      setTodayStats(prev => ({ ...prev, tasks: prev.tasks + 1, completed: prev.completed - 1 }));
    } catch (error) {
      console.error('Error undoing task:', error);
    }

    setLastCompletedTask(null);
  }, [lastCompletedTask]);

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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <View style={styles.container}>
      <TabHeader title="Home" subtitle={formatDate()} titleColor="#fff" />

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
        {/* Onboarding CTA if needed */}
        {needsOnboarding && (
          <TouchableOpacity 
            style={styles.onboardingCard}
            onPress={() => router.push('/onboarding')}
            activeOpacity={0.8}
          >
            <View style={styles.onboardingContent}>
              <View style={styles.onboardingIcon}>
                <Ionicons name="mic" size={24} color="#f97316" />
              </View>
              <View style={styles.onboardingText}>
                <Text style={styles.onboardingTitle}>Tell me about yourself</Text>
                <Text style={styles.onboardingSubtitle}>
                  1-2 min voice intro to personalize your experience
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </View>
          </TouchableOpacity>
        )}

        {/* Voice Prompt - Quick Capture */}
        <TouchableOpacity 
          style={styles.voicePromptCard}
          onPress={openCreateMenu}
          activeOpacity={0.8}
        >
          <View style={styles.voicePromptContent}>
            <Ionicons name="mic-outline" size={24} color="#c4dfc4" />
            <Text style={styles.voicePromptText}>What's on your mind?</Text>
          </View>
        </TouchableOpacity>

        {/* Trackers Row */}
        {!needsOnboarding && <TrackerRow />}

        {/* Daily Challenge */}
        {!needsOnboarding && challenge && (
          <ChallengeCard 
            challenge={challenge}
            onStatusChange={handleChallengeStatusChange}
          />
        )}

        {/* Dailys (Personalized Content) */}
        {!needsOnboarding && dailys.length > 0 && (
          <View style={styles.dailysSection}>
            <Text style={styles.dailysSectionTitle}>Today's Inspiration</Text>
            {dailys.map((daily) => (
              <DailyCard 
                key={daily.id} 
                daily={daily}
                onEngagementChange={(updated) => {
                  setDailys(prev => prev.map(d => d.id === updated.id ? updated : d));
                }}
              />
            ))}
          </View>
        )}

        {/* Divider before tasks/notes */}
        {!needsOnboarding && (dailys.length > 0 || challenge) && hasContent && (
          <View style={styles.sectionDivider} />
        )}

        {/* Day Sections */}
        {dayData.map((day) => {
          const hasVoice = day.voice.length > 0;
          const hasTasks = day.tasks.length > 0;
          const hasNotes = day.notes.length > 0;
          const todoTasks = day.tasks.filter(t => t.status === 'pending');
          const doneTasks = day.tasks.filter(t => t.status === 'completed');

          if (!hasVoice && !hasTasks && !hasNotes) return null;

          return (
            <View key={day.date} style={styles.daySection}>
              {/* Day Header with date and task toggles */}
              <View style={styles.dayHeaderRow}>
                <Text style={styles.dayLabel}>{day.label}</Text>
                {hasTasks && (
                  <View style={styles.taskToggleRow}>
                    <TouchableOpacity
                      style={[styles.taskTogglePill, taskView === 'todo' && styles.taskTogglePillActive]}
                      onPress={() => setTaskView('todo')}
                    >
                      <Text style={[styles.taskToggleText, taskView === 'todo' && styles.taskToggleTextActive]}>
                        {todoTasks.length} to do
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.taskTogglePill, taskView === 'done' && styles.taskTogglePillDone]}
                      onPress={() => setTaskView('done')}
                    >
                      <Text style={[styles.taskToggleText, taskView === 'done' && styles.taskToggleTextActive]}>
                        {doneTasks.length} done
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Sort options - only show for todo view with tasks */}
              {hasTasks && taskView === 'todo' && todoTasks.length > 1 && (
                <View style={styles.sortRow}>
                  {(['newest', 'oldest', 'due_next'] as const).map((sortOption) => (
                    <TouchableOpacity
                      key={sortOption}
                      style={[styles.sortPill, taskSort === sortOption && styles.sortPillActive]}
                      onPress={() => setTaskSort(sortOption)}
                    >
                      <Text style={[styles.sortText, taskSort === sortOption && styles.sortTextActive]}>
                        {sortOption === 'newest' ? 'Newest' : sortOption === 'oldest' ? 'Oldest' : 'Due Next'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Task list - shown in both views */}
              {hasTasks && (
                <View style={styles.typeSection}>
                  {(taskView === 'todo'
                    ? [...todoTasks].sort((a, b) => {
                      if (taskSort === 'newest') {
                        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                      } else if (taskSort === 'oldest') {
                        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                      } else {
                        // due_next - tasks with due dates first, sorted by due date
                        const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
                        const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
                        return aDue - bDue;
                      }
                    })
                    : doneTasks
                  ).map((task) => (
                    <AnimatedHomeTaskItem
                      key={task.id}
                      task={task}
                      onComplete={toggleTask}
                      onPress={(t) => router.push(`/task/${t.id}`)}
                    />
                  ))}
                  {(taskView === 'todo' ? todoTasks : doneTasks).length === 0 && (
                    <Text style={styles.emptyTaskText}>
                      {taskView === 'todo' ? 'All done!' : 'No completed tasks yet'}
                    </Text>
                  )}
                </View>
              )}

              {/* Notes - Collapsible (only in to-do view) */}
              {taskView === 'todo' && hasNotes && (
                <View style={styles.typeSection}>
                  <TouchableOpacity
                    style={styles.collapsibleHeader}
                    onPress={() => toggleNotesExpanded(day.date)}
                  >
                    <Ionicons
                      name={expandedNotes.has(day.date) ? "chevron-down" : "chevron-forward"}
                      size={16}
                      color="#666"
                    />
                    <Ionicons name="document-text-outline" size={14} color="#93c5fd" />
                    <Text style={styles.collapsibleLabel}>
                      {day.notes.length} note{day.notes.length !== 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                  {expandedNotes.has(day.date) && day.notes.map((note) => (
                    <TouchableOpacity
                      key={note.id}
                      style={styles.noteItem}
                      onPress={() => router.push(`/note/${note.id}`)}
                    >
                      <View style={styles.noteIconWrapper}>
                        <Ionicons name="document-text-outline" size={18} color="#93c5fd" />
                      </View>
                      <Text style={styles.noteText}>{note.text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Voice Notes - Collapsible (only in to-do view) */}
              {taskView === 'todo' && hasVoice && (
                <View style={styles.typeSection}>
                  <TouchableOpacity
                    style={styles.collapsibleHeader}
                    onPress={() => toggleVoiceExpanded(day.date)}
                  >
                    <Ionicons
                      name={expandedVoice.has(day.date) ? "chevron-down" : "chevron-forward"}
                      size={16}
                      color="#666"
                    />
                    <Ionicons name="mic" size={14} color="#c4dfc4" />
                    <Text style={styles.collapsibleLabel}>
                      {day.voice.length} voice note{day.voice.length !== 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                  {expandedVoice.has(day.date) && day.voice.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.feedItem}
                      onPress={() => router.push(`/entry/${item.id}`)}
                    >
                      <View style={styles.itemIconWrapper}>
                        <Ionicons name="mic" size={18} color="#c4dfc4" />
                      </View>
                      <Text style={styles.itemText} numberOfLines={1}>
                        {item.summary || formatTime(item.created_at)}
                      </Text>
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

      {/* Undo Toast */}
      <UndoToast
        visible={toastVisible}
        onUndo={undoComplete}
        onDismiss={() => setToastVisible(false)}
      />
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
  // Guy Talk styles
  onboardingCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f9731640',
  },
  onboardingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  onboardingIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f9731620',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onboardingText: {
    flex: 1,
  },
  onboardingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  onboardingSubtitle: {
    fontSize: 13,
    color: '#888',
  },
  voicePromptCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#c4dfc440',
  },
  voicePromptContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voicePromptText: {
    fontSize: 16,
    color: '#888',
  },
  dailysSection: {
    marginBottom: 16,
  },
  dailysSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#222',
    marginVertical: 16,
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
  dayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
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
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 2,
  },
  collapsibleLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888',
  },
  feedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ITEM_HEIGHT,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  itemIconWrapper: {
    width: 28,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  taskCheckArea: {
    width: 24,
    marginRight: 8,
  },
  taskTextArea: {
    flex: 1,
  },
  itemText: {
    fontSize: 15,
    color: '#ddd',
  },
  itemTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#555',
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  noteIconWrapper: {
    width: 28,
    paddingTop: 2,
  },
  noteText: {
    flex: 1,
    fontSize: 15,
    color: '#ddd',
    lineHeight: 22,
  },
  taskToggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  taskTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
  },
  taskTogglePillActive: {
    backgroundColor: '#333',
  },
  taskTogglePillDone: {
    backgroundColor: '#166534',
  },
  taskToggleText: {
    fontSize: 12,
    color: '#666',
  },
  taskToggleTextActive: {
    color: '#fff',
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    marginLeft: 4,
  },
  sortPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
  },
  sortPillActive: {
    backgroundColor: '#c4dfc4',
  },
  sortText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  sortTextActive: {
    color: '#0a0a0a',
  },
  emptyTaskText: {
    fontSize: 14,
    color: '#555',
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  animatedTaskContainer: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 4,
    marginBottom: 2,
  },
  taskFillBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    borderRadius: 4,
  },
  taskTextWrapper: {
    position: 'relative',
  },
  taskTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  dueText: {
    fontSize: 10,
    fontWeight: '600',
  },
  strikethroughLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    height: 2,
    backgroundColor: '#4ade80',
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    marginLeft: 10,
  },
  toastBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toastBtnText: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '600',
  },
});
