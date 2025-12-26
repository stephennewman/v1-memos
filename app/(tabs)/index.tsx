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
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  isFuture: boolean;
  items: TimelineItem[];
}

const getDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDayLabel = (date: Date, isToday: boolean, isFuture: boolean) => {
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  if (isToday) return `Today · ${dateStr}`;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((itemDate.getTime() - today.getTime()) / 86400000);

  if (isFuture) {
    if (diffDays === 1) return `Tomorrow · ${dateStr}`;
    if (diffDays < 7) {
      const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
      return `${weekday} · ${dateStr}`;
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  
  // Past days
  const pastDiffDays = Math.floor((today.getTime() - itemDate.getTime()) / 86400000);
  if (pastDiffDays === 1) return `Yesterday · ${dateStr}`;
  if (pastDiffDays < 7) {
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `${weekday} · ${dateStr}`;
  }
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

// Hour Block for Today/Future
const HourBlock = ({
  hour,
  items,
  isCurrentHour,
  canAdd,
  activeInput,
  onStartInput,
  onSubmitItem,
  onCancelInput,
  onToggleTask,
  onItemPress,
  onDeleteItem,
}: {
  hour: number;
  items: TimelineItem[];
  isCurrentHour: boolean;
  canAdd: boolean;
  activeInput: 'task' | 'note' | null;
  onStartInput: (type: 'task' | 'note') => void;
  onSubmitItem: (text: string, type: 'task' | 'note') => void;
  onCancelInput: () => void;
  onToggleTask: (item: TimelineItem) => void;
  onItemPress: (item: TimelineItem) => void;
  onDeleteItem: (item: TimelineItem) => void;
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
            onPress={() => onItemPress(item)}
            onLongPress={() => onDeleteItem(item)}
            delayLongPress={500}
          >
            {item.type === 'task' && (
              <TouchableOpacity 
                onPress={() => onToggleTask(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons 
                  name={item.status === 'completed' ? 'checkbox' : 'square-outline'} 
                  size={16} 
                  color={item.status === 'completed' ? '#4ade80' : '#c4dfc4'} 
                />
              </TouchableOpacity>
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
            <Ionicons name="chevron-forward" size={14} color="#333" />
          </TouchableOpacity>
        ))}

        {/* Active input - only if canAdd */}
        {canAdd && activeInput && (
          <InlineInput
            type={activeInput}
            hour={hour}
            onSubmit={(text) => onSubmitItem(text, activeInput)}
            onCancel={onCancelInput}
            autoFocus
          />
        )}

        {/* Add buttons - only show if canAdd and no active input */}
        {canAdd && !activeInput && (
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

// Past Day Section (collapsible, no hours)
const PastDaySection = ({
  day,
  isExpanded,
  onToggleExpand,
  onToggleTask,
  onItemPress,
  onDeleteItem,
}: {
  day: DayData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleTask: (item: TimelineItem) => void;
  onItemPress: (item: TimelineItem) => void;
  onDeleteItem: (item: TimelineItem) => void;
}) => {
  const hasItems = day.items.length > 0;

  return (
    <View style={styles.pastDaySection}>
      <TouchableOpacity 
        style={styles.pastDayHeader}
        onPress={onToggleExpand}
        activeOpacity={0.7}
      >
        <Ionicons 
          name={isExpanded ? 'chevron-down' : 'chevron-forward'} 
          size={18} 
          color="#666" 
        />
        <Text style={styles.pastDayLabel}>{day.label}</Text>
        {hasItems && (
          <View style={styles.itemCountBadge}>
            <Text style={styles.itemCountText}>{day.items.length}</Text>
          </View>
        )}
      </TouchableOpacity>
      
      {isExpanded && hasItems && day.items.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.pastDayItem}
          onPress={() => onItemPress(item)}
          onLongPress={() => onDeleteItem(item)}
          delayLongPress={500}
        >
          {item.type === 'task' && (
            <TouchableOpacity 
              onPress={() => onToggleTask(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons 
                name={item.status === 'completed' ? 'checkbox' : 'square-outline'} 
                size={16} 
                color={item.status === 'completed' ? '#4ade80' : '#c4dfc4'} 
              />
            </TouchableOpacity>
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
          <Ionicons name="chevron-forward" size={14} color="#333" />
        </TouchableOpacity>
      ))}
      
      {isExpanded && !hasItems && (
        <Text style={styles.noItemsText}>No entries</Text>
      )}
    </View>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [days, setDays] = useState<DayData[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Active input state: { hour, type, dateKey }
  const [activeInput, setActiveInput] = useState<{ hour: number; type: 'task' | 'note'; dateKey: string } | null>(null);
  
  // Expanded days state
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  
  // Show all hours toggle for today
  const [showAllHours, setShowAllHours] = useState(false);
  
  // Tab state: 'past' | 'today' | 'future'
  const [selectedTab, setSelectedTab] = useState<'past' | 'today' | 'future'>('today');

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

      // Build days - include 7 future days + today + 30 past days
      const daysArray: DayData[] = [];
      const dayMap = new Map<string, DayData>();

      // Future days (7 days ahead, in reverse order so Tomorrow is first after Today)
      for (let i = 7; i >= 1; i--) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        date.setHours(0, 0, 0, 0);
        const day: DayData = {
          date,
          dateKey: getDateKey(date),
          label: formatDayLabel(date, false, true),
          isToday: false,
          isFuture: true,
          items: [],
        };
        daysArray.push(day);
        dayMap.set(day.dateKey, day);
      }

      // Today + past days
      for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        const isToday = i === 0;
        const day: DayData = {
          date,
          dateKey: getDateKey(date),
          label: formatDayLabel(date, isToday, false),
          isToday,
          isFuture: false,
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


  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  const handleStartInput = useCallback((hour: number, type: 'task' | 'note', dateKey?: string) => {
    setActiveInput({ hour, type, dateKey: dateKey || getDateKey(new Date()) });
  }, []);

  const handleSubmitItem = useCallback(async (text: string, hour: number, type: 'task' | 'note', dateKey?: string) => {
    if (!user) return;

    // Find the target day to get the correct date
    const targetDateKey = dateKey || getDateKey(new Date());
    const targetDay = days.find(d => d.dateKey === targetDateKey);
    
    // Create date for this hour on the target day
    const itemDate = targetDay ? new Date(targetDay.date) : new Date();
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
        setDays(prev => prev.map(day => {
          if (day.dateKey === targetDateKey) {
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
        setDays(prev => prev.map(day => {
          if (day.dateKey === targetDateKey) {
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
  }, [user, days]);

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

  const handleDeleteItem = useCallback((item: TimelineItem) => {
    const itemTypeLabel = item.type === 'task' ? 'Task' : item.type === 'note' ? 'Note' : 'Voice Entry';
    const tableName = item.type === 'task' ? 'voice_todos' : item.type === 'note' ? 'voice_notes' : 'voice_entries';
    
    Alert.alert(
      `Delete ${itemTypeLabel}`,
      `Are you sure you want to delete this ${item.type}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic update - remove from local state
            setDays(prev => prev.map(day => ({
              ...day,
              items: day.items.filter(i => i.id !== item.id),
            })));

            try {
              if (item.type === 'note') {
                // Archive notes instead of delete
                await supabase
                  .from(tableName)
                  .update({ is_archived: true })
                  .eq('id', item.id);
              } else {
                await supabase
                  .from(tableName)
                  .delete()
                  .eq('id', item.id);
              }
            } catch (error) {
              console.error('Error deleting item:', error);
              // Revert on error
              loadData();
            }
          },
        },
      ]
    );
  }, [loadData]);

  const toggleDayExpanded = useCallback((dateKey: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }, []);

  // Split days into future, today, and past
  const futureDays = days.filter(d => d.isFuture);
  const today = days.find(d => d.isToday);
  const pastDays = days.filter(d => !d.isToday && !d.isFuture);
  
  // Count today's items
  const todayItemCount = today?.items.length || 0;

  if (isLoading || authLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  const currentHour = getCurrentHour();
  const allHours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  
  // Get visible hours for today: show hours with content + current hour +/- 1 hour
  // If showAllHours is true, show all hours
  const visibleHours = showAllHours ? allHours : allHours.filter(hour => {
    const hasItems = today?.items.some(i => i.hour === hour) || false;
    const isNearCurrent = Math.abs(hour - currentHour) <= 1;
    const hasActiveInput = activeInput?.hour === hour;
    return hasItems || isNearCurrent || hasActiveInput;
  });
  
  // Check if there are hidden hours
  const hiddenHoursCount = allHours.length - visibleHours.length;

  // Reverse future days so furthest is at top
  const reversedFutureDays = [...futureDays].reverse();
  
  // Past items count
  const pastItemsCount = pastDays.reduce((sum, d) => sum + d.items.length, 0);
  const futureItemsCount = futureDays.reduce((sum, d) => sum + d.items.length, 0);

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Home</Text>
          <Text style={styles.headerSubtitle}>
            {selectedTab === 'today' && `${todayItemCount} item${todayItemCount !== 1 ? 's' : ''} today`}
            {selectedTab === 'past' && `${pastItemsCount} item${pastItemsCount !== 1 ? 's' : ''} in past 30 days`}
            {selectedTab === 'future' && `${futureItemsCount} item${futureItemsCount !== 1 ? 's' : ''} planned`}
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

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, selectedTab === 'past' && styles.tabActive]}
          onPress={() => setSelectedTab('past')}
        >
          <Ionicons name="arrow-back" size={16} color={selectedTab === 'past' ? '#fff' : '#666'} />
          <Text style={[styles.tabText, selectedTab === 'past' && styles.tabTextActive]}>Past</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, styles.tabCenter, selectedTab === 'today' && styles.tabActive]}
          onPress={() => setSelectedTab('today')}
        >
          <Ionicons name="today" size={16} color={selectedTab === 'today' ? '#fff' : '#666'} />
          <Text style={[styles.tabText, selectedTab === 'today' && styles.tabTextActive]}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, selectedTab === 'future' && styles.tabActive]}
          onPress={() => setSelectedTab('future')}
        >
          <Text style={[styles.tabText, selectedTab === 'future' && styles.tabTextActive]}>Future</Text>
          <Ionicons name="arrow-forward" size={16} color={selectedTab === 'future' ? '#fff' : '#666'} />
        </TouchableOpacity>
      </View>

      {/* TODAY TAB */}
      {selectedTab === 'today' && (
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
          <View style={styles.todaySection}>
            {visibleHours.map(hour => {
              const hourItems = today?.items.filter(i => i.hour === hour) || [];
              const isActive = activeInput?.hour === hour && activeInput?.dateKey === today?.dateKey;
              const canAdd = hour >= currentHour;
              
              return (
                <HourBlock
                  key={hour}
                  hour={hour}
                  items={hourItems}
                  isCurrentHour={hour === currentHour}
                  canAdd={canAdd}
                  activeInput={isActive ? activeInput.type : null}
                  onStartInput={(type) => handleStartInput(hour, type, today?.dateKey)}
                  onSubmitItem={(text, type) => handleSubmitItem(text, hour, type, today?.dateKey)}
                  onCancelInput={() => setActiveInput(null)}
                  onToggleTask={handleToggleTask}
                  onItemPress={handleItemPress}
                  onDeleteItem={handleDeleteItem}
                />
              );
            })}
            
            {hiddenHoursCount > 0 && !showAllHours && (
              <TouchableOpacity 
                style={styles.showMoreHours}
                onPress={() => setShowAllHours(true)}
              >
                <Ionicons name="ellipsis-horizontal" size={16} color="#555" />
                <Text style={styles.showMoreText}>
                  Show {hiddenHoursCount} more hours
                </Text>
              </TouchableOpacity>
            )}
            
            {showAllHours && (
              <TouchableOpacity 
                style={styles.showMoreHours}
                onPress={() => setShowAllHours(false)}
              >
                <Ionicons name="chevron-up" size={16} color="#555" />
                <Text style={styles.showMoreText}>
                  Collapse empty hours
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* PAST TAB - scrolls down, newest first */}
      {selectedTab === 'past' && (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#c4dfc4"
            />
          }
        >
          {pastDays.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={48} color="#333" />
              <Text style={styles.emptyTitle}>No past entries</Text>
              <Text style={styles.emptyText}>Your history will appear here</Text>
            </View>
          ) : (
            pastDays.map(day => (
              <PastDaySection
                key={day.dateKey}
                day={day}
                isExpanded={expandedDays.has(day.dateKey)}
                onToggleExpand={() => toggleDayExpanded(day.dateKey)}
                onToggleTask={handleToggleTask}
                onItemPress={handleItemPress}
                onDeleteItem={handleDeleteItem}
              />
            ))
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* FUTURE TAB - scrolls up, furthest day at top */}
      {selectedTab === 'future' && (
        <ScrollView
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
          {reversedFutureDays.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#333" />
              <Text style={styles.emptyTitle}>Plan ahead</Text>
              <Text style={styles.emptyText}>Add tasks and notes for upcoming days</Text>
            </View>
          ) : (
            reversedFutureDays.map(day => {
              const isFutureDayExpanded = expandedDays.has(day.dateKey);
              return (
                <View key={day.dateKey} style={styles.futureDaySection}>
                  <TouchableOpacity 
                    style={styles.dayHeader}
                    onPress={() => toggleDayExpanded(day.dateKey)}
                    activeOpacity={0.7}
                  >
                    <Ionicons 
                      name={isFutureDayExpanded ? 'chevron-down' : 'chevron-forward'} 
                      size={18} 
                      color="#666" 
                    />
                    <Text style={[styles.dayHeaderLabel, styles.futureDayLabel]}>{day.label}</Text>
                    {day.items.length > 0 && (
                      <View style={[styles.itemCountBadge, styles.futureItemBadge]}>
                        <Text style={styles.itemCountText}>{day.items.length}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  
                  {isFutureDayExpanded && (
                    <>
                      {allHours.filter(hour => {
                        const hasItems = day.items.some(i => i.hour === hour);
                        const isWorkHour = hour >= 8 && hour <= 18;
                        return hasItems || isWorkHour;
                      }).map(hour => {
                        const hourItems = day.items.filter(i => i.hour === hour);
                        const isActive = activeInput?.hour === hour && activeInput?.dateKey === day.dateKey;
                        
                        return (
                          <HourBlock
                            key={hour}
                            hour={hour}
                            items={hourItems}
                            isCurrentHour={false}
                            canAdd={true}
                            activeInput={isActive ? activeInput.type : null}
                            onStartInput={(type) => handleStartInput(hour, type, day.dateKey)}
                            onSubmitItem={(text, type) => handleSubmitItem(text, hour, type, day.dateKey)}
                            onCancelInput={() => setActiveInput(null)}
                            onToggleTask={handleToggleTask}
                            onItemPress={handleItemPress}
                            onDeleteItem={handleDeleteItem}
                          />
                        );
                      })}
                    </>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
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
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  tabCenter: {
    flex: 1.2,
  },
  tabActive: {
    backgroundColor: '#1a3a1a',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  dayHeaderLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#e5e5e5',
  },
  scrollView: {
    flex: 1,
  },
  todaySection: {
    // Container for today's collapsible section
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
  futureSection: {
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    marginTop: 8,
  },
  futureDaySection: {
    // Each future day section
  },
  futureDayLabel: {
    color: '#4ade80', // Green tint for future days
  },
  futureItemBadge: {
    backgroundColor: '#166534',
  },
  pastSection: {
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    marginTop: 8,
  },
  pastDaySection: {
    // Each day section
  },
  pastDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  pastDayLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#e5e5e5',
  },
  itemCountBadge: {
    backgroundColor: '#222',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  itemCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  noItemsText: {
    fontSize: 13,
    color: '#444',
    fontStyle: 'italic',
    paddingHorizontal: 46,
    paddingVertical: 12,
  },
  pastDayItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 46,
    paddingRight: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  pastItemText: {
    flex: 1,
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
  showMoreHours: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    backgroundColor: '#0d0d0d',
  },
  showMoreText: {
    fontSize: 13,
    color: '#555',
  },
});
