import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const HOUR_HEIGHT = 64;
const START_HOUR = 6;
const END_HOUR = 23;

interface TimelineItem {
  id: string;
  type: 'task' | 'note' | 'voice';
  text: string;
  status?: 'pending' | 'completed';
  created_at: string;
  hour: number;
}

interface DayData {
  date: Date;
  dateKey: string;
  label: string;
  isToday: boolean;
  items: TimelineItem[];
}

const getDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDayLabel = (date: Date, isToday: boolean) => {
  if (isToday) return 'Today';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - itemDate.getTime()) / 86400000);

  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatHour = (hour: number) => {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  if (hour < 12) return `${hour}a`;
  return `${hour - 12}p`;
};

const getCurrentHour = () => new Date().getHours();

// Inline input for adding items
const InlineInput = ({
  type,
  hour,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  type: 'task' | 'note';
  hour: number;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  autoFocus: boolean;
}) => {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [autoFocus]);

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
      setText('');
    } else {
      onCancel();
    }
  };

  return (
    <View style={styles.inlineInputContainer}>
      <Ionicons 
        name={type === 'task' ? 'square-outline' : 'document-text-outline'} 
        size={16} 
        color={type === 'task' ? '#c4dfc4' : '#93c5fd'} 
      />
      <TextInput
        ref={inputRef}
        style={styles.inlineInput}
        placeholder={type === 'task' ? 'Add task...' : 'Add note...'}
        placeholderTextColor="#444"
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSubmit}
        onBlur={handleSubmit}
        returnKeyType="done"
        autoFocus={autoFocus}
      />
    </View>
  );
};

// Hour Block for Today
const HourBlock = ({
  hour,
  items,
  isCurrentHour,
  activeInput,
  onStartInput,
  onSubmitItem,
  onCancelInput,
  onToggleTask,
  onItemPress,
}: {
  hour: number;
  items: TimelineItem[];
  isCurrentHour: boolean;
  activeInput: 'task' | 'note' | null;
  onStartInput: (type: 'task' | 'note') => void;
  onSubmitItem: (text: string, type: 'task' | 'note') => void;
  onCancelInput: () => void;
  onToggleTask: (item: TimelineItem) => void;
  onItemPress: (item: TimelineItem) => void;
}) => {
  return (
    <View style={[styles.hourBlock, isCurrentHour && styles.currentHourBlock]}>
      {/* Hour Label */}
      <View style={styles.hourLabelContainer}>
        <Text style={[styles.hourLabel, isCurrentHour && styles.currentHourLabel]}>
          {formatHour(hour)}
        </Text>
        {isCurrentHour && <View style={styles.nowLine} />}
      </View>

      {/* Content Area */}
      <View style={styles.hourContent}>
        {/* Existing items */}
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.timelineItem}
            onPress={() => item.type === 'task' ? onToggleTask(item) : onItemPress(item)}
          >
            {item.type === 'task' && (
              <Ionicons 
                name={item.status === 'completed' ? 'checkbox' : 'square-outline'} 
                size={16} 
                color={item.status === 'completed' ? '#4ade80' : '#c4dfc4'} 
              />
            )}
            {item.type === 'note' && (
              <Ionicons name="document-text" size={16} color="#93c5fd" />
            )}
            {item.type === 'voice' && (
              <Ionicons name="mic" size={16} color="#c4dfc4" />
            )}
            <Text 
              style={[
                styles.itemText,
                item.status === 'completed' && styles.completedText
              ]} 
              numberOfLines={1}
            >
              {item.text}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Active input */}
        {activeInput && (
          <InlineInput
            type={activeInput}
            hour={hour}
            onSubmit={(text) => onSubmitItem(text, activeInput)}
            onCancel={onCancelInput}
            autoFocus
          />
        )}

        {/* Add buttons - only show if no active input */}
        {!activeInput && (
          <View style={styles.addRow}>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => onStartInput('task')}
            >
              <Ionicons name="add" size={14} color="#c4dfc4" />
              <Text style={styles.addButtonText}>Task</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => onStartInput('note')}
            >
              <Ionicons name="add" size={14} color="#93c5fd" />
              <Text style={[styles.addButtonText, { color: '#93c5fd' }]}>Note</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

// Past Day Section (no hours, just items)
const PastDaySection = ({
  day,
  onToggleTask,
  onItemPress,
}: {
  day: DayData;
  onToggleTask: (item: TimelineItem) => void;
  onItemPress: (item: TimelineItem) => void;
}) => {
  if (day.items.length === 0) return null;

  return (
    <View style={styles.pastDaySection}>
      <Text style={styles.pastDayLabel}>{day.label}</Text>
      {day.items.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.pastDayItem}
          onPress={() => item.type === 'task' ? onToggleTask(item) : onItemPress(item)}
        >
          {item.type === 'task' && (
            <Ionicons 
              name={item.status === 'completed' ? 'checkbox' : 'square-outline'} 
              size={16} 
              color={item.status === 'completed' ? '#4ade80' : '#c4dfc4'} 
            />
          )}
          {item.type === 'note' && (
            <Ionicons name="document-text" size={16} color="#93c5fd" />
          )}
          {item.type === 'voice' && (
            <Ionicons name="mic" size={16} color="#c4dfc4" />
          )}
          <Text 
            style={[
              styles.pastItemText,
              item.status === 'completed' && styles.completedText
            ]} 
            numberOfLines={2}
          >
            {item.text}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [days, setDays] = useState<DayData[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Active input state: { hour, type }
  const [activeInput, setActiveInput] = useState<{ hour: number; type: 'task' | 'note' } | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Load tasks
      const { data: tasks } = await supabase
        .from('voice_todos')
        .select('id, text, status, created_at')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      // Load notes
      const { data: notes } = await supabase
        .from('voice_notes')
        .select('id, text, created_at')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      // Load voice entries
      const { data: voiceEntries } = await supabase
        .from('voice_entries')
        .select('id, summary, created_at')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      // Build days
      const daysArray: DayData[] = [];
      const dayMap = new Map<string, DayData>();

      for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        const isToday = i === 0;
        const day: DayData = {
          date,
          dateKey: getDateKey(date),
          label: formatDayLabel(date, isToday),
          isToday,
          items: [],
        };
        daysArray.push(day);
        dayMap.set(day.dateKey, day);
      }

      // Add tasks
      (tasks || []).forEach(t => {
        const date = new Date(t.created_at);
        const key = getDateKey(date);
        const day = dayMap.get(key);
        if (day) {
          day.items.push({
            id: t.id,
            type: 'task',
            text: t.text,
            status: t.status,
            created_at: t.created_at,
            hour: date.getHours(),
          });
        }
      });

      // Add notes
      (notes || []).forEach(n => {
        const date = new Date(n.created_at);
        const key = getDateKey(date);
        const day = dayMap.get(key);
        if (day) {
          day.items.push({
            id: n.id,
            type: 'note',
            text: n.text,
            created_at: n.created_at,
            hour: date.getHours(),
          });
        }
      });

      // Add voice entries
      (voiceEntries || []).forEach(v => {
        const date = new Date(v.created_at);
        const key = getDateKey(date);
        const day = dayMap.get(key);
        if (day) {
          day.items.push({
            id: v.id,
            type: 'voice',
            text: v.summary || 'Voice Note',
            created_at: v.created_at,
            hour: date.getHours(),
          });
        }
      });

      // Sort items within each day by created_at (newest first for past days, by hour for today)
      daysArray.forEach(day => {
        if (!day.isToday) {
          day.items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
      });

      setDays(daysArray);
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

  // Scroll to current hour on load
  useEffect(() => {
    if (!isLoading && scrollViewRef.current) {
      const currentHour = getCurrentHour();
      const scrollPosition = Math.max(0, (currentHour - START_HOUR - 1) * HOUR_HEIGHT);
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: scrollPosition, animated: false });
      }, 100);
    }
  }, [isLoading]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  const handleStartInput = useCallback((hour: number, type: 'task' | 'note') => {
    setActiveInput({ hour, type });
  }, []);

  const handleSubmitItem = useCallback(async (text: string, hour: number, type: 'task' | 'note') => {
    if (!user) return;

    // Create date for this hour (today)
    const itemDate = new Date();
    itemDate.setHours(hour, 0, 0, 0);

    try {
      if (type === 'task') {
        const { data, error } = await supabase
          .from('voice_todos')
          .insert({
            user_id: user.id,
            text,
            status: 'pending',
            created_at: itemDate.toISOString(),
          })
          .select()
          .single();

        if (error) throw error;

        // Update local state
        setDays(prev => prev.map((day, idx) => {
          if (idx === 0) { // Today
            return {
              ...day,
              items: [...day.items, {
                id: data.id,
                type: 'task',
                text: data.text,
                status: data.status,
                created_at: data.created_at,
                hour,
              }],
            };
          }
          return day;
        }));
      } else {
        const { data, error } = await supabase
          .from('voice_notes')
          .insert({
            user_id: user.id,
            text,
            is_archived: false,
            created_at: itemDate.toISOString(),
          })
          .select()
          .single();

        if (error) throw error;

        // Update local state
        setDays(prev => prev.map((day, idx) => {
          if (idx === 0) { // Today
            return {
              ...day,
              items: [...day.items, {
                id: data.id,
                type: 'note',
                text: data.text,
                created_at: data.created_at,
                hour,
              }],
            };
          }
          return day;
        }));
      }
    } catch (error) {
      console.error('Error adding item:', error);
    }

    setActiveInput(null);
  }, [user]);

  const handleToggleTask = useCallback(async (item: TimelineItem) => {
    if (item.type !== 'task') return;

    const newStatus = item.status === 'pending' ? 'completed' : 'pending';

    // Optimistic update
    setDays(prev => prev.map(day => ({
      ...day,
      items: day.items.map(i =>
        i.id === item.id ? { ...i, status: newStatus } : i
      ),
    })));

    try {
      await supabase
        .from('voice_todos')
        .update({
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', item.id);
    } catch (error) {
      // Revert on error
      setDays(prev => prev.map(day => ({
        ...day,
        items: day.items.map(i =>
          i.id === item.id ? { ...i, status: item.status } : i
        ),
      })));
      console.error('Error toggling task:', error);
    }
  }, []);

  const handleItemPress = useCallback((item: TimelineItem) => {
    if (item.type === 'voice') {
      router.push(`/entry/${item.id}`);
    } else if (item.type === 'note') {
      router.push(`/note/${item.id}`);
    } else if (item.type === 'task') {
      router.push(`/task/${item.id}`);
    }
  }, [router]);

  if (isLoading || authLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  const today = days[0];
  const pastDays = days.slice(1).filter(d => d.items.length > 0);
  const currentHour = getCurrentHour();
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Today</Text>
        <Text style={styles.headerSubtitle}>
          {new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric' 
          })}
        </Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#c4dfc4"
          />
        }
      >
        {/* Today's Hours */}
        <View style={styles.todaySection}>
          {hours.map(hour => {
            const hourItems = today?.items.filter(i => i.hour === hour) || [];
            const isActive = activeInput?.hour === hour;
            
            return (
              <HourBlock
                key={hour}
                hour={hour}
                items={hourItems}
                isCurrentHour={hour === currentHour}
                activeInput={isActive ? activeInput.type : null}
                onStartInput={(type) => handleStartInput(hour, type)}
                onSubmitItem={(text, type) => handleSubmitItem(text, hour, type)}
                onCancelInput={() => setActiveInput(null)}
                onToggleTask={handleToggleTask}
                onItemPress={handleItemPress}
              />
            );
          })}
        </View>

        {/* Past Days */}
        {pastDays.length > 0 && (
          <View style={styles.pastSection}>
            <View style={styles.pastDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Earlier</Text>
              <View style={styles.dividerLine} />
            </View>
            
            {pastDays.map(day => (
              <PastDaySection
                key={day.dateKey}
                day={day}
                onToggleTask={handleToggleTask}
                onItemPress={handleItemPress}
              />
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
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
  scrollView: {
    flex: 1,
  },
  todaySection: {
    paddingTop: 8,
  },
  hourBlock: {
    flexDirection: 'row',
    minHeight: HOUR_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  currentHourBlock: {
    backgroundColor: 'rgba(196, 223, 196, 0.03)',
  },
  hourLabelContainer: {
    width: 50,
    paddingTop: 10,
    paddingLeft: 16,
    position: 'relative',
  },
  hourLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#444',
  },
  currentHourLabel: {
    color: '#c4dfc4',
  },
  nowLine: {
    position: 'absolute',
    top: 16,
    right: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#c4dfc4',
  },
  hourContent: {
    flex: 1,
    paddingVertical: 8,
    paddingRight: 16,
    paddingLeft: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    color: '#ddd',
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#555',
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#111',
  },
  addButtonText: {
    fontSize: 12,
    color: '#c4dfc4',
    fontWeight: '500',
  },
  inlineInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  inlineInput: {
    flex: 1,
    fontSize: 14,
    color: '#ddd',
    padding: 0,
  },
  pastSection: {
    paddingTop: 16,
  },
  pastDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#222',
  },
  dividerText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
    paddingHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pastDaySection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  pastDayLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    marginBottom: 8,
  },
  pastDayItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  pastItemText: {
    flex: 1,
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
});
