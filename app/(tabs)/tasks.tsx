import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Animated,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { VoiceTodo, TodoStatus } from '@/lib/types';

type FilterType = 'pending' | 'completed' | 'all';

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

// Animated task item
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
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
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
            <Text 
              style={[styles.todoText, isCompleted && styles.todoTextCompleted]}
              numberOfLines={2}
            >
              {item.text}
            </Text>
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
          {dueInfo && (
            <View style={styles.todoMeta}>
              <Ionicons name="calendar-outline" size={12} color={dueInfo.color} />
              <Text style={[styles.dueDate, { color: dueInfo.color }]}>
                {dueInfo.text}
              </Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color="#444" />
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  
  const [todos, setTodos] = useState<VoiceTodo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('pending');
  
  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [lastCompletedTodo, setLastCompletedTodo] = useState<VoiceTodo | null>(null);

  const loadTodos = useCallback(async (userId: string) => {
    try {
      let query = supabase
        .from('voice_todos')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (filter === 'pending') {
        query = query.eq('status', 'pending');
      } else if (filter === 'completed') {
        query = query.eq('status', 'completed');
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
  }, [filter]);

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

      if (newStatus === 'completed' && filter === 'pending') {
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

  const pendingCount = filter === 'all' 
    ? todos.filter(t => t.status === 'pending').length 
    : filter === 'pending' ? todos.length : 0;
  const completedCount = filter === 'all'
    ? todos.filter(t => t.status === 'completed').length
    : filter === 'completed' ? todos.length : 0;

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
            {pendingCount} pending • {completedCount} done
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.profileButton}
          onPress={() => router.push('/(tabs)/settings')}
        >
          <Ionicons name="person-circle-outline" size={28} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {(['pending', 'completed', 'all'] as FilterType[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Todos List */}
      {todos.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="checkbox-outline" size={48} color="#333" />
          </View>
          <Text style={styles.emptyTitle}>
            {filter === 'pending' ? 'No pending tasks' : 
             filter === 'completed' ? 'No completed tasks' : 'No tasks yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            Tasks are automatically extracted from your voice notes
          </Text>
        </View>
      ) : (
        <FlatList
          data={todos}
          renderItem={({ item }) => (
            <TaskItem 
              item={item}
              onComplete={completeTodo}
              onPress={(todo) => router.push(`/task/${todo.id}`)}
              onLongPress={deleteTodo}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#c4dfc4"
            />
          }
        />
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
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  filterTabActive: {
    backgroundColor: '#c4dfc4',
    borderColor: '#c4dfc4',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
  },
  filterTextActive: {
    color: '#0a0a0a',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 10,
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
  todoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  dueDate: {
    fontSize: 12,
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
