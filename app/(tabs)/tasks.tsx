import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
  TextInput,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 80;
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useCreate } from '@/lib/create-context';
import EmptyState from '@/components/EmptyState';
import type { VoiceTodo, TodoStatus } from '@/lib/types';
import { getDateGroupLabel } from '@/lib/format-date';

type FilterType = 'todo' | 'done';
type SortType = 'newest' | 'oldest' | 'due_next';

// Toast component
const Toast = ({
  visible,
  message,
  onUndo,
  onView,
  onDismiss,
}: {
  visible: boolean;
  message: string;
  onUndo: () => void;
  onView: () => void;
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
      <Ionicons name="checkmark-circle" size={20} color="#c4dfc4" />
      <Text style={styles.toastText}>{message}</Text>
      <TouchableOpacity onPress={onUndo} style={styles.toastBtn}>
        <Text style={styles.toastBtnText}>Undo</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onView} style={styles.toastBtn}>
        <Text style={styles.toastBtnText}>View</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Swipeable task item with complete action
const TaskItem = ({
  item,
  onComplete,
  onPress,
  onLongPress,
}: {
  item: VoiceTodo;
  onComplete: (todo: VoiceTodo) => void;
  onPress: (todo: VoiceTodo) => void;
  onLongPress: (todo: VoiceTodo) => void;
}) => {
  const [isCompleting, setIsCompleting] = useState(false);
  const strikeWidth = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 10;
      },
      onPanResponderGrant: () => {
        setShowSwipeHint(true);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow right swipe (positive dx) and cap it
        if (gestureState.dx > 0) {
          translateX.setValue(Math.min(gestureState.dx, SWIPE_THRESHOLD + 20));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        setShowSwipeHint(false);
        if (gestureState.dx > SWIPE_THRESHOLD && item.status !== 'completed') {
          // Swipe complete!
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onComplete(item);
            translateX.setValue(0);
          });
        } else {
          // Snap back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        setShowSwipeHint(false);
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

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

  const handleComplete = () => {
    if (item.status === 'completed' || isCompleting) {
      // If already completed, just toggle back
      onComplete(item);
      return;
    }

    setIsCompleting(true);

    // Animate strikethrough
    Animated.timing(strikeWidth, {
      toValue: 1,
      duration: 300,
      useNativeDriver: false,
    }).start(() => {
      // Then fade out and shrink
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.9,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onComplete(item);
      });
    });
  };

  const dueInfo = formatDueDate(item.due_date);
  const isCompleted = item.status === 'completed';

  return (
    <View style={styles.swipeContainer}>
      {/* Swipe background */}
      <View style={styles.swipeBackground}>
        <Ionicons name="checkmark-circle" size={24} color="#fff" />
        <Text style={styles.swipeText}>Done</Text>
      </View>

      <Animated.View
        style={{
          opacity,
          transform: [{ scale }, { translateX }],
          backgroundColor: '#0a0a0a',
        }}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={[styles.todoCard, isCompleted && styles.todoCardCompleted]}
          onPress={() => onPress(item)}
          onLongPress={() => onLongPress(item)}
          activeOpacity={0.7}
        >
          <TouchableOpacity
            style={[styles.checkbox, isCompleted && styles.checkboxChecked]}
            onPress={handleComplete}
          >
            {isCompleted && (
              <Ionicons name="checkmark" size={14} color="#0a0a0a" />
            )}
          </TouchableOpacity>
          <View style={styles.todoContent}>
            <View style={styles.textContainer}>
              <View style={styles.textRow}>
                <Text
                  style={[styles.todoText, isCompleted && styles.todoTextCompleted]}
                  numberOfLines={2}
                >
                  {item.text}
                </Text>
                {dueInfo && !isCompleted && (
                  <View style={[styles.dueBadge, { backgroundColor: dueInfo.color + '20' }]}>
                    <Ionicons name="calendar-outline" size={10} color={dueInfo.color} />
                    <Text style={[styles.dueBadgeText, { color: dueInfo.color }]}>
                      {dueInfo.text}
                    </Text>
                  </View>
                )}
              </View>
              {!isCompleted && isCompleting && (
                <Animated.View
                  style={[
                    styles.strikethrough,
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
          </View>
          <Ionicons name="chevron-forward" size={16} color="#444" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { openCreateMenu } = useCreate();

  const [todos, setTodos] = useState<VoiceTodo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('todo');
  const [sort, setSort] = useState<SortType>('newest');

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [lastCompletedTodo, setLastCompletedTodo] = useState<VoiceTodo | null>(null);

  // Get date boundaries
  const getDateBounds = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { today, tomorrow, now };
  };

  // Group todos by date
  const groupTodosByDate = (todos: VoiceTodo[]) => {
    const groups: { date: string; label: string; todos: VoiceTodo[] }[] = [];
    const groupMap = new Map<string, VoiceTodo[]>();

    todos.forEach(todo => {
      const dateKey = new Date(todo.created_at).toDateString();
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, []);
      }
      groupMap.get(dateKey)!.push(todo);
    });

    groupMap.forEach((todos, dateKey) => {
      groups.push({
        date: dateKey,
        label: getDateGroupLabel(todos[0].created_at),
        todos,
      });
    });

    return groups;
  };

  const loadTodos = useCallback(async (userId: string) => {
    try {
      const { today, tomorrow } = getDateBounds();
      const todayISO = today.toISOString();
      const tomorrowISO = tomorrow.toISOString();

      let query = supabase
        .from('voice_todos')
        .select('*')
        .eq('user_id', userId);

      // Fetch all tasks - we'll filter client-side for counts

      // Apply sort
      if (sort === 'newest') {
        query = query.order('created_at', { ascending: false });
      } else if (sort === 'oldest') {
        query = query.order('created_at', { ascending: true });
      } else {
        query = query.order('due_date', { ascending: true, nullsFirst: false });
      }

      const { data, error } = await query.limit(100);

      if (error) {
        console.log('Could not load todos:', error.message);
        setTodos([]);
      } else {
        setTodos(data || []);
      }
    } catch (error) {
      console.error('Error loading todos:', error);
      setTodos([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filter, sort]);

  useFocusEffect(
    useCallback(() => {
      if (user && !authLoading) {
        loadTodos(user.id);
      } else if (!authLoading && !user) {
        setIsLoading(false);
      }
    }, [user, authLoading, loadTodos])
  );

  const onRefresh = useCallback(() => {
    if (!user) return;
    setIsRefreshing(true);
    loadTodos(user.id);
  }, [user, loadTodos]);

  const completeTodo = async (todo: VoiceTodo) => {
    const newStatus: TodoStatus = todo.status === 'completed' ? 'pending' : 'completed';

    try {
      const { error } = await supabase
        .from('voice_todos')
        .update({
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', todo.id);

      if (error) throw error;

      const isPendingView = ['today', 'overdue', 'upcoming'].includes(filter);
      if (newStatus === 'completed' && isPendingView) {
        // Remove from list when completing in pending view
        setTodos(prev => prev.filter(t => t.id !== todo.id));
        setLastCompletedTodo({ ...todo, status: newStatus });
        setToastVisible(true);
      } else {
        // Update in place for 'all' or 'completed' view, or when uncompleting
        setTodos(prev => prev.map(t =>
          t.id === todo.id
            ? { ...t, status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : undefined }
            : t
        ));
      }
    } catch (error) {
      console.error('Error updating todo:', error);
      Alert.alert('Error', 'Failed to update task');
    }
  };

  const undoComplete = async () => {
    if (!lastCompletedTodo) return;

    try {
      const { error } = await supabase
        .from('voice_todos')
        .update({ status: 'pending', completed_at: null })
        .eq('id', lastCompletedTodo.id);

      if (error) throw error;

      // Add back to list
      setTodos(prev => [{ ...lastCompletedTodo, status: 'pending', completed_at: undefined }, ...prev]);
      setToastVisible(false);
      setLastCompletedTodo(null);
    } catch (error) {
      console.error('Error undoing:', error);
    }
  };

  const viewCompletedTodo = () => {
    if (!lastCompletedTodo) return;
    setToastVisible(false);
    router.push(`/task/${lastCompletedTodo.id}`);
  };

  const deleteTodo = (todo: VoiceTodo) => {
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('voice_todos')
                .delete()
                .eq('id', todo.id);

              if (error) throw error;
              setTodos(prev => prev.filter(t => t.id !== todo.id));
            } catch (error) {
              console.error('Error deleting todo:', error);
            }
          },
        },
      ]
    );
  };

  const isPendingFilter = filter === 'todo';
  const allPending = todos.filter(t => t.status === 'pending');
  const allCompleted = todos.filter(t => t.status === 'completed');
  const pendingCount = allPending.length;
  const completedCount = allCompleted.length;
  
  const displayTodos = filter === 'todo' ? allPending : allCompleted;

  if (isLoading || authLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Tasks</Text>
          <Text style={styles.headerSubtitle}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push('/search')}
        >
          <Ionicons name="search" size={22} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push('/(tabs)/settings')}
        >
          <Ionicons name="person-circle-outline" size={26} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Sort & Filter Row */}
      <View style={styles.filterSortRow}>
        {/* Sort Options - Left */}
        <View style={styles.sortGroup}>
          {(['newest', 'oldest', 'due_next'] as SortType[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sortBtn, sort === s && styles.sortBtnActive]}
              onPress={() => setSort(s)}
            >
              <Text style={[styles.sortBtnText, sort === s && styles.sortBtnTextActive]}>
                {s === 'newest' ? 'Newest' : s === 'oldest' ? 'Oldest' : 'Due Next'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* To Do / Done Toggle - Right */}
        <View style={styles.toggleGroup}>
          <TouchableOpacity
            style={[styles.togglePill, filter === 'todo' && styles.togglePillActive]}
            onPress={() => setFilter('todo')}
          >
            <Text style={[styles.toggleText, filter === 'todo' && styles.toggleTextActive]}>
              {pendingCount} to do
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.togglePill, filter === 'done' && styles.togglePillDone]}
            onPress={() => setFilter('done')}
          >
            <Text style={[styles.toggleText, filter === 'done' && styles.toggleTextActive]}>
              {completedCount} done
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Todos List */}
      {displayTodos.length === 0 ? (
        <EmptyState
          icon={filter === 'todo' ? 'checkbox-outline' : 'checkmark-circle'}
          title={filter === 'todo' ? 'All done!' : 'No completed tasks yet'}
          description={
            filter === 'todo'
              ? 'Great job! Record a voice note or add a task to get started'
              : 'Complete some tasks and they\'ll show up here'
          }
          actionLabel={filter === 'todo' ? 'Record a Voice Note' : undefined}
          onAction={filter === 'todo' ? () => router.push('/record') : undefined}
          secondaryActionLabel={filter === 'todo' ? 'Add Task' : undefined}
          onSecondaryAction={filter === 'todo' ? openCreateMenu : undefined}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#c4dfc4"
            />
          }
        >
          {groupTodosByDate(displayTodos).map((group) => (
            <View key={group.date} style={styles.dateGroup}>
              <Text style={styles.dateGroupLabel}>{group.label}</Text>
              {group.todos.map((item) => (
                <TaskItem
                  key={item.id}
                  item={item}
                  onComplete={completeTodo}
                  onPress={(todo) => router.push(`/task/${todo.id}`)}
                  onLongPress={deleteTodo}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Toast */}
      <Toast
        visible={toastVisible}
        message="Task completed!"
        onUndo={undoComplete}
        onView={viewCompletedTodo}
        onDismiss={() => setToastVisible(false)}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#3b82f6',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    marginHorizontal: 16,
    marginTop: 12,
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
  filterSortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sortGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  togglePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
  },
  togglePillActive: {
    backgroundColor: '#333',
  },
  togglePillDone: {
    backgroundColor: '#166534',
  },
  toggleText: {
    fontSize: 12,
    color: '#666',
  },
  toggleTextActive: {
    color: '#fff',
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
  },
  sortBtnActive: {
    backgroundColor: '#333',
  },
  sortBtnText: {
    fontSize: 12,
    color: '#666',
  },
  sortBtnTextActive: {
    color: '#c4dfc4',
  },
  dateGroup: {
    marginBottom: 20,
  },
  dateGroupLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  swipeContainer: {
    overflow: 'hidden',
    borderRadius: 12,
    marginBottom: 0,
  },
  swipeBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#4ade80',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    gap: 8,
    borderRadius: 12,
  },
  swipeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  todoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  todoCardCompleted: {
    opacity: 0.6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#444',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#c4dfc4',
    borderColor: '#c4dfc4',
  },
  todoContent: {
    flex: 1,
  },
  textContainer: {
    position: 'relative',
  },
  todoText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 20,
  },
  todoTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  strikethrough: {
    position: 'absolute',
    top: '50%',
    left: 0,
    height: 2,
    backgroundColor: '#c4dfc4',
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  dueBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  // Toast styles
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
    color: '#c4dfc4',
    fontSize: 14,
    fontWeight: '600',
  },
});
