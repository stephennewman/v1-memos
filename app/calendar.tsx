import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { supabase } from '@/lib/supabase';
import { ModernLoader } from '@/components/ModernLoader';
import { SwipeableItem } from '@/components/SwipeableItem';

interface Task {
  id: string;
  text: string;
  status: 'pending' | 'completed';
  due_date: string | null;
  original_due_date: string | null;
  is_recurring: boolean;
  recurrence_pattern: any;
  task_type: 'deadline' | 'due_date';
  created_at: string;
  tags: string[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Format recurrence pattern for display
const formatRecurrencePattern = (pattern: any): string => {
  if (!pattern) return 'Recurring';
  
  const { frequency, day_of_week, day_of_month, interval } = pattern;
  
  if (frequency === 'daily') {
    return interval === 2 ? 'Every other day' : 'Daily';
  }
  
  if (frequency === 'weekly') {
    const dayName = day_of_week !== undefined ? WEEKDAYS[day_of_week] : '';
    if (interval === 2) return dayName ? `Biweekly ${dayName}` : 'Biweekly';
    return dayName ? `Weekly ${dayName}` : 'Weekly';
  }
  
  if (frequency === 'monthly') {
    if (day_of_month) {
      const suffix = day_of_month === 1 ? 'st' : day_of_month === 2 ? 'nd' : day_of_month === 3 ? 'rd' : 'th';
      return `${day_of_month}${suffix} monthly`;
    }
    return interval === 3 ? 'Quarterly' : 'Monthly';
  }
  
  if (frequency === 'yearly') return 'Yearly';
  
  return 'Recurring';
};

const getDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const isToday = (date: Date) => {
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
};

const isOverdue = (dueDate: string | null, status: string) => {
  if (!dueDate || status === 'completed') return false;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
};

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tasksByDate, setTasksByDate] = useState<Map<string, Task[]>>(new Map());

  const loadTasks = useCallback(async () => {
    if (!user) return;

    try {
      // Load tasks with due dates (past 30 days to future 60 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const sixtyDaysAhead = new Date();
      sixtyDaysAhead.setDate(sixtyDaysAhead.getDate() + 60);

      const { data, error } = await supabase
        .from('voice_todos')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'dismissed')
        .order('due_date', { ascending: true });

      if (error) throw error;

      const allTasks = data || [];
      setTasks(allTasks);
      
      // Group tasks by due_date, falling back to created_at (same as feed)
      const byDate = new Map<string, Task[]>();
      
      allTasks.forEach(task => {
        // Use due_date if available, otherwise fall back to created_at
        const dateToUse = task.due_date || task.created_at;
        const key = getDateKey(new Date(dateToUse));
        const existing = byDate.get(key) || [];
        byDate.set(key, [...existing, task]);
      });

      setTasksByDate(byDate);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [loadTasks])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadTasks();
  }, [loadTasks]);

  const goToPreviousMonth = () => {
    const prev = new Date(currentMonth);
    prev.setMonth(prev.getMonth() - 1);
    setCurrentMonth(prev);
  };

  const goToNextMonth = () => {
    const next = new Date(currentMonth);
    next.setMonth(next.getMonth() + 1);
    setCurrentMonth(next);
  };

  const goToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setCurrentMonth(today);
  };

  const toggleTaskStatus = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    
    // Optimistic update
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, status: newStatus } : t
    ));
    setTasksByDate(prev => {
      const newMap = new Map(prev);
      newMap.forEach((tasks, key) => {
        newMap.set(key, tasks.map(t => 
          t.id === taskId ? { ...t, status: newStatus } : t
        ));
      });
      return newMap;
    });

    await supabase
      .from('voice_todos')
      .update({ 
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null
      })
      .eq('id', taskId);
  };

  const moveTaskToDate = async (taskId: string, newDate: Date) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const newDateISO = newDate.toISOString();
    
    await supabase
      .from('voice_todos')
      .update({ 
        due_date: newDateISO,
        moved_to_date: newDateISO,
        // Preserve original_due_date if not set
        original_due_date: task.original_due_date || task.due_date
      })
      .eq('id', taskId);

    loadTasks();
  };

  const moveToToday = (taskId: string) => {
    Alert.alert(
      'Move to Today',
      'Move this task to today?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Move', 
          onPress: () => moveTaskToDate(taskId, new Date())
        }
      ]
    );
  };

  // Generate calendar days for current month
  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDay = firstDay.getDay();
    const totalDays = lastDay.getDate();
    
    const days: (Date | null)[] = [];
    
    // Add empty slots for days before the 1st
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const calendarDays = generateCalendarDays();
  const selectedDateKey = getDateKey(selectedDate);
  const selectedDateTasks = tasksByDate.get(selectedDateKey) || [];
  
  // Separate pending and completed
  const pendingTasks = selectedDateTasks.filter(t => t.status !== 'completed');
  const completedTasks = selectedDateTasks.filter(t => t.status === 'completed');

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ModernLoader size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Calendar</Text>
        <TouchableOpacity onPress={goToToday} style={[styles.todayBtn, { backgroundColor: colors.card }]}>
          <Text style={[styles.todayBtnText, { color: colors.accent }]}>Today</Text>
        </TouchableOpacity>
      </View>

      {/* Month Navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthArrow}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.monthTitle, { color: colors.text }]}>
          {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </Text>
        <TouchableOpacity onPress={goToNextMonth} style={styles.monthArrow}>
          <Ionicons name="chevron-forward" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Weekday Headers */}
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map(day => (
          <View key={day} style={styles.weekdayCell}>
            <Text style={[styles.weekdayText, { color: colors.textSecondary }]}>{day}</Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>
        {calendarDays.map((day, index) => {
          if (!day) {
            return <View key={`empty-${index}`} style={styles.dayCell} />;
          }
          
          const dateKey = getDateKey(day);
          const dayTasks = tasksByDate.get(dateKey) || [];
          const pendingCount = dayTasks.filter(t => t.status !== 'completed').length;
          const hasOverdue = dayTasks.some(t => isOverdue(t.due_date, t.status));
          const isSelected = dateKey === selectedDateKey;
          const isTodayDate = isToday(day);
          
          return (
            <TouchableOpacity
              key={dateKey}
              style={[
                styles.dayCell,
                isSelected && { backgroundColor: colors.accent, borderRadius: 12 },
                isTodayDate && !isSelected && { borderWidth: 2, borderColor: colors.accent, borderRadius: 12 },
              ]}
              onPress={() => setSelectedDate(day)}
            >
              <Text style={[
                styles.dayNumber,
                { color: colors.text },
                isSelected && { color: isDark ? '#0a0a0a' : '#fff', fontWeight: '700' },
                isTodayDate && !isSelected && { color: colors.accent },
              ]}>
                {day.getDate()}
              </Text>
              {/* Simple dots below date - no numbers */}
              {pendingCount > 0 && (
                <View style={styles.dotsRow}>
                  {/* Show up to 3 dots, one per task */}
                  {Array.from({ length: Math.min(pendingCount, 3) }).map((_, i) => (
                    <View 
                      key={i} 
                      style={[
                        styles.taskDotSimple,
                        { backgroundColor: hasOverdue ? colors.error : colors.taskBlue },
                      ]} 
                    />
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected Date Tasks */}
      <View style={[styles.taskSection, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[styles.taskSectionHeader, { borderBottomColor: colors.cardBorder }]}>
          <Text style={[styles.taskSectionTitle, { color: colors.text }]}>
            {selectedDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric' 
            })}
          </Text>
          <Text style={[styles.taskCount, { color: colors.textSecondary }]}>
            {pendingTasks.length} pending
          </Text>
        </View>
        
        <ScrollView 
          style={styles.taskList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
        >
          {selectedDateTasks.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No tasks for this date</Text>
            </View>
          ) : (
            <>
              {/* Pending Tasks */}
              {pendingTasks.map(task => (
                <SwipeableItem
                  key={task.id}
                  onSwipeRight={() => moveToToday(task.id)}
                  rightAction={{
                    icon: 'today-outline',
                    color: '#fff',
                    backgroundColor: colors.taskBlue,
                    label: 'Move to Today',
                  }}
                >
                  <View style={[styles.taskItem, { borderBottomColor: colors.cardBorder }]}>
                    <TouchableOpacity 
                      onPress={() => toggleTaskStatus(task.id, task.status)}
                      style={styles.taskCheckbox}
                    >
                      <Ionicons 
                        name={task.status === 'completed' ? 'checkbox' : 'square-outline'} 
                        size={22} 
                        color={task.status === 'completed' ? colors.taskBlue : colors.textSecondary} 
                      />
                    </TouchableOpacity>
                    <View style={styles.taskContent}>
                      <Text style={[
                        styles.taskText,
                        { color: colors.text },
                        isOverdue(task.due_date, task.status) && { color: colors.error },
                      ]}>
                        {task.text}
                      </Text>
                      <View style={styles.taskMeta}>
                        {task.is_recurring && (
                          <View style={styles.recurringBadge}>
                            <Ionicons name="repeat" size={12} color={colors.success} />
                            <Text style={[styles.recurringText, { color: colors.success }]}>
                              {formatRecurrencePattern(task.recurrence_pattern)}
                            </Text>
                          </View>
                        )}
                        {task.task_type === 'deadline' && (
                          <View style={styles.deadlineBadge}>
                            <Ionicons name="alert-circle" size={12} color={colors.warning} />
                            <Text style={[styles.deadlineText, { color: colors.warning }]}>Deadline</Text>
                          </View>
                        )}
                        {isOverdue(task.due_date, task.status) && (
                          <View style={styles.overdueBadge}>
                            <Text style={[styles.overdueText, { color: colors.error }]}>Overdue</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity 
                      onPress={() => router.push(`/task/${task.id}`)}
                      style={styles.taskChevron}
                    >
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </SwipeableItem>
              ))}
              
              {/* Completed Tasks */}
              {completedTasks.length > 0 && (
                <>
                  <Text style={[styles.completedHeader, { color: colors.textSecondary }]}>Completed</Text>
                  {completedTasks.map(task => (
                    <View key={task.id} style={[styles.taskItem, styles.taskItemCompleted, { borderBottomColor: colors.cardBorder }]}>
                      <TouchableOpacity 
                        onPress={() => toggleTaskStatus(task.id, task.status)}
                        style={styles.taskCheckbox}
                      >
                        <Ionicons name="checkbox" size={22} color={colors.taskBlue} />
                      </TouchableOpacity>
                      <Text style={[styles.taskTextCompleted, { color: colors.taskBlue }]}>{task.text}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
          
          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
  },
  todayBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#c4dfc4',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  monthArrow: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  dayCellSelected: {
    backgroundColor: '#f472b6',
    borderRadius: 12,
  },
  dayCellToday: {
    borderWidth: 2,
    borderColor: '#c4dfc4',
    borderRadius: 12,
  },
  dayNumber: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  dayNumberSelected: {
    color: '#0a0a0a',
    fontWeight: '700',
  },
  dayNumberToday: {
    color: '#c4dfc4',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  taskDotSimple: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#3b82f6',
  },
  taskSection: {
    flex: 1,
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 16,
    paddingTop: 16,
  },
  taskSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  taskSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  taskCount: {
    fontSize: 13,
    color: '#666',
  },
  taskList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  taskItemCompleted: {
    opacity: 0.6,
  },
  taskCheckbox: {
    padding: 4,
    marginRight: 8,
  },
  taskContent: {
    flex: 1,
  },
  taskText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 22,
  },
  taskTextOverdue: {
    color: '#ef4444',
  },
  taskTextCompleted: {
    flex: 1,
    fontSize: 15,
    color: '#3b82f6',
    textDecorationLine: 'line-through',
  },
  taskMeta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  recurringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  recurringText: {
    fontSize: 11,
    color: '#22c55e',
    fontWeight: '500',
  },
  deadlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  deadlineText: {
    fontSize: 11,
    color: '#f59e0b',
    fontWeight: '500',
  },
  overdueBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  overdueText: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '600',
  },
  taskChevron: {
    padding: 4,
  },
  completedHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
});
