import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings-context';
import { supabase } from '@/lib/supabase';

interface Item {
  id: string;
  type: 'task' | 'note' | 'voice';
  text: string;
  status?: 'pending' | 'completed';
  created_at: string;
}

interface DayData {
  date: Date;
  dateKey: string;
  label: string;
  isToday: boolean;
  isFuture: boolean;
  items: Item[];
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
  
  const pastDiffDays = Math.floor((today.getTime() - itemDate.getTime()) / 86400000);
  if (pastDiffDays === 1) return `Yesterday · ${dateStr}`;
  if (pastDiffDays < 7) {
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `${weekday} · ${dateStr}`;
  }
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [days, setDays] = useState<DayData[]>([]);
  const { timeTab: selectedTab, setTimeTab: setSelectedTab } = useSettings();
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [typeFilter, setTypeFilter] = useState<'all' | 'tasks' | 'notes'>('all');
  
  // Add input state
  const [isAdding, setIsAdding] = useState(false);
  const [addingToDay, setAddingToDay] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: tasks } = await supabase
        .from('voice_todos')
        .select('id, text, status, created_at')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      const { data: notes } = await supabase
        .from('voice_notes')
        .select('id, text, created_at')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      const { data: voiceEntries } = await supabase
        .from('voice_entries')
        .select('id, summary, created_at')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      // Build days array
      const daysArray: DayData[] = [];
      const dayMap = new Map<string, DayData>();

      // Future days (7 days ahead)
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

      // Add items to days
      (tasks || []).forEach(t => {
        const key = getDateKey(new Date(t.created_at));
        const day = dayMap.get(key);
        if (day) {
          day.items.push({ id: t.id, type: 'task', text: t.text, status: t.status, created_at: t.created_at });
        }
      });

      (notes || []).forEach(n => {
        const key = getDateKey(new Date(n.created_at));
        const day = dayMap.get(key);
        if (day) {
          day.items.push({ id: n.id, type: 'note', text: n.text, created_at: n.created_at });
        }
      });

      (voiceEntries || []).forEach(v => {
        const key = getDateKey(new Date(v.created_at));
        const day = dayMap.get(key);
        if (day) {
          day.items.push({ id: v.id, type: 'voice', text: v.summary || 'Voice Note', created_at: v.created_at });
        }
      });

      // Sort items within each day by created_at (newest first)
      daysArray.forEach(day => {
        day.items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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

  const handleToggleTask = useCallback(async (item: Item) => {
    const newStatus = item.status === 'completed' ? 'pending' : 'completed';
    
    // Optimistic update
    setDays(prev => prev.map(day => ({
      ...day,
      items: day.items.map(i => i.id === item.id ? { ...i, status: newStatus } : i),
    })));

    try {
      await supabase
        .from('voice_todos')
        .update({ status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null })
        .eq('id', item.id);
    } catch (error) {
      // Revert
      setDays(prev => prev.map(day => ({
        ...day,
        items: day.items.map(i => i.id === item.id ? { ...i, status: item.status } : i),
      })));
    }
  }, []);

  const handleItemPress = useCallback((item: Item) => {
    if (item.type === 'voice') router.push(`/entry/${item.id}`);
    else if (item.type === 'note') router.push(`/note/${item.id}`);
    else if (item.type === 'task') router.push(`/task/${item.id}`);
  }, [router]);

  const handleDeleteItem = useCallback((item: Item) => {
    const label = item.type === 'task' ? 'Task' : item.type === 'note' ? 'Note' : 'Voice Entry';
    const table = item.type === 'task' ? 'voice_todos' : item.type === 'note' ? 'voice_notes' : 'voice_entries';
    
    Alert.alert(`Delete ${label}`, `Are you sure?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDays(prev => prev.map(day => ({
            ...day,
            items: day.items.filter(i => i.id !== item.id),
          })));
          try {
            if (item.type === 'note') {
              await supabase.from(table).update({ is_archived: true }).eq('id', item.id);
            } else {
              await supabase.from(table).delete().eq('id', item.id);
            }
          } catch (error) {
            loadData();
          }
        },
      },
    ]);
  }, [loadData]);

  const startAdding = (dateKey: string) => {
    // Auto-expand the day when adding
    setExpandedDays(prev => new Set([...prev, dateKey]));
    setAddingToDay(dateKey);
    setIsAdding(true);
    setNewItemText('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const cancelAdding = () => {
    setIsAdding(false);
    setAddingToDay(null);
    setNewItemText('');
  };

  const submitItem = async () => {
    if (!newItemText.trim() || !user || !addingToDay) return;
    
    const targetDay = days.find(d => d.dateKey === addingToDay);
    if (!targetDay) return;

    const itemDate = new Date(targetDay.date);
    itemDate.setHours(new Date().getHours(), new Date().getMinutes(), 0, 0);

    try {
      const { data, error } = await supabase
        .from('voice_todos')
        .insert({
          user_id: user.id,
          text: newItemText.trim(),
          status: 'pending',
          created_at: itemDate.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      setDays(prev => prev.map(day => {
        if (day.dateKey === addingToDay) {
          return {
            ...day,
            items: [{ id: data.id, type: 'task', text: data.text, status: 'pending', created_at: data.created_at }, ...day.items],
          };
        }
        return day;
      }));

      cancelAdding();
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  const toggleDayExpanded = (dateKey: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  // Helper to filter and sort items
  const processItems = (items: Item[]) => {
    let filtered = items;
    if (typeFilter === 'tasks') {
      filtered = items.filter(i => i.type === 'task');
    } else if (typeFilter === 'notes') {
      filtered = items.filter(i => i.type === 'note');
    }
    // Sort
    filtered.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sort === 'newest' ? dateB - dateA : dateA - dateB;
    });
    return filtered;
  };

  // Split and process days
  const futureDays = days.filter(d => d.isFuture).reverse().map(d => ({ ...d, items: processItems(d.items) }));
  const today = days.find(d => d.isToday);
  const todayProcessed = today ? { ...today, items: processItems(today.items) } : null;
  const pastDays = days.filter(d => !d.isToday && !d.isFuture).map(d => ({ ...d, items: processItems(d.items) }));
  
  const todayItemCount = todayProcessed?.items.length || 0;
  const pastItemsCount = pastDays.reduce((sum, d) => sum + d.items.length, 0);
  const futureItemsCount = futureDays.reduce((sum, d) => sum + d.items.length, 0);

  if (isLoading || authLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  const renderItem = (item: Item) => (
    <TouchableOpacity
      key={item.id}
      style={styles.item}
      onPress={() => handleItemPress(item)}
      onLongPress={() => handleDeleteItem(item)}
      delayLongPress={500}
    >
      {item.type === 'task' && (
        <TouchableOpacity onPress={() => handleToggleTask(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons 
            name={item.status === 'completed' ? 'checkbox' : 'square-outline'} 
            size={20} 
            color={item.status === 'completed' ? '#4ade80' : '#666'} 
          />
        </TouchableOpacity>
      )}
      {item.type === 'note' && <Ionicons name="document-text" size={18} color="#a78bfa" />}
      {item.type === 'voice' && <Ionicons name="mic" size={18} color="#22c55e" />}
      <Text style={[styles.itemText, item.status === 'completed' && styles.itemTextCompleted]} numberOfLines={2}>
        {item.text}
      </Text>
      <Ionicons name="chevron-forward" size={16} color="#333" />
    </TouchableOpacity>
  );

  const renderDaySection = (day: DayData, canAdd: boolean) => {
    const isExpanded = expandedDays.has(day.dateKey) || day.isToday;
    const isAddingHere = isAdding && addingToDay === day.dateKey;
    
    // Group by type
    const tasks = day.items.filter(i => i.type === 'task');
    const notes = day.items.filter(i => i.type === 'note');
    const voices = day.items.filter(i => i.type === 'voice');
    
    return (
      <View key={day.dateKey} style={styles.daySection}>
        <TouchableOpacity 
          style={styles.dayHeader}
          onPress={() => !day.isToday && toggleDayExpanded(day.dateKey)}
          activeOpacity={day.isToday ? 1 : 0.7}
        >
          {!day.isToday && (
            <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#666" />
          )}
          <Text style={[styles.dayLabel, day.isFuture && styles.futureDayLabel]}>{day.label}</Text>
          {day.items.length > 0 && (
            <View style={[styles.badge, day.isFuture && styles.futureBadge]}>
              <Text style={styles.badgeText}>{day.items.length}</Text>
            </View>
          )}
          {canAdd && (
            <TouchableOpacity style={styles.addBtn} onPress={() => startAdding(day.dateKey)}>
              <Ionicons name="add" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.dayContent}>
            {isAddingHere && (
              <View style={styles.addInputRow}>
                <Ionicons name="square-outline" size={20} color="#666" />
                <TextInput
                  ref={inputRef}
                  style={styles.addInput}
                  placeholder="Add item..."
                  placeholderTextColor="#444"
                  value={newItemText}
                  onChangeText={setNewItemText}
                  onSubmitEditing={submitItem}
                  returnKeyType="done"
                />
                <TouchableOpacity onPress={cancelAdding} style={styles.cancelBtn}>
                  <Ionicons name="close" size={18} color="#666" />
                </TouchableOpacity>
              </View>
            )}
            
            {day.items.length === 0 && !isAddingHere && (
              <Text style={styles.emptyText}>No items</Text>
            )}
            
            {/* Tasks */}
            {tasks.length > 0 && (
              <View style={styles.typeGroup}>
                <Text style={styles.typeLabel}>Tasks</Text>
                {tasks.map(renderItem)}
              </View>
            )}
            
            {/* Notes */}
            {notes.length > 0 && (
              <View style={styles.typeGroup}>
                <Text style={[styles.typeLabel, { color: '#a78bfa' }]}>Notes</Text>
                {notes.map(renderItem)}
              </View>
            )}
            
            {/* Voice */}
            {voices.length > 0 && (
              <View style={styles.typeGroup}>
                <Text style={[styles.typeLabel, { color: '#22c55e' }]}>Voice</Text>
                {voices.map(renderItem)}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

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
            {selectedTab === 'past' && `${pastItemsCount} item${pastItemsCount !== 1 ? 's' : ''}`}
            {selectedTab === 'future' && `${futureItemsCount} planned`}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/search')}>
          <Ionicons name="search" size={22} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/(tabs)/settings')}>
          <Ionicons name="person-circle-outline" size={26} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, selectedTab === 'past' && styles.tabActive]}
          onPress={() => setSelectedTab('past')}
        >
          <Ionicons name="arrow-back" size={14} color={selectedTab === 'past' ? '#fff' : '#666'} />
          <Text style={[styles.tabText, selectedTab === 'past' && styles.tabTextActive]}>Past</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, styles.tabCenter, selectedTab === 'today' && styles.tabActive]}
          onPress={() => setSelectedTab('today')}
        >
          <Ionicons name="today" size={14} color={selectedTab === 'today' ? '#fff' : '#666'} />
          <Text style={[styles.tabText, selectedTab === 'today' && styles.tabTextActive]}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, selectedTab === 'future' && styles.tabActive]}
          onPress={() => setSelectedTab('future')}
        >
          <Text style={[styles.tabText, selectedTab === 'future' && styles.tabTextActive]}>Future</Text>
          <Ionicons name="arrow-forward" size={14} color={selectedTab === 'future' ? '#fff' : '#666'} />
        </TouchableOpacity>
      </View>

      {/* Sort & Filter Row */}
      <View style={styles.filterSortRow}>
        {/* Sort Options - Left */}
        <View style={styles.sortGroup}>
          <TouchableOpacity
            style={[styles.sortBtn, sort === 'newest' && styles.sortBtnActive]}
            onPress={() => setSort('newest')}
          >
            <Text style={[styles.sortBtnText, sort === 'newest' && styles.sortBtnTextActive]}>Newest</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortBtn, sort === 'oldest' && styles.sortBtnActive]}
            onPress={() => setSort('oldest')}
          >
            <Text style={[styles.sortBtnText, sort === 'oldest' && styles.sortBtnTextActive]}>Oldest</Text>
          </TouchableOpacity>
        </View>

        {/* Type Filter - Right */}
        <View style={styles.toggleGroup}>
          <TouchableOpacity
            style={[styles.togglePill, typeFilter === 'all' && styles.togglePillActive]}
            onPress={() => setTypeFilter('all')}
          >
            <Text style={[styles.toggleText, typeFilter === 'all' && styles.toggleTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.togglePill, typeFilter === 'tasks' && styles.togglePillActive]}
            onPress={() => setTypeFilter('tasks')}
          >
            <Text style={[styles.toggleText, typeFilter === 'tasks' && styles.toggleTextActive]}>Tasks</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.togglePill, typeFilter === 'notes' && styles.togglePillActive]}
            onPress={() => setTypeFilter('notes')}
          >
            <Text style={[styles.toggleText, typeFilter === 'notes' && styles.toggleTextActive]}>Notes</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#c4dfc4" />}
      >
        {selectedTab === 'today' && todayProcessed && renderDaySection(todayProcessed, true)}
        
        {selectedTab === 'past' && (
          pastDays.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={48} color="#333" />
              <Text style={styles.emptyTitle}>No history</Text>
            </View>
          ) : (
            pastDays.map(day => renderDaySection(day, false))
          )
        )}
        
        {selectedTab === 'future' && (
          futureDays.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color="#333" />
              <Text style={styles.emptyTitle}>Plan ahead</Text>
            </View>
          ) : (
            futureDays.map(day => renderDaySection(day, true))
          )
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f472b6',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  headerBtn: {
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
    paddingVertical: 8,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  filterSortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sortGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#111',
  },
  sortBtnActive: {
    backgroundColor: '#1a3a1a',
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  sortBtnTextActive: {
    color: '#fff',
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 2,
  },
  togglePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  togglePillActive: {
    backgroundColor: '#1a3a1a',
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  daySection: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  dayLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#e5e5e5',
  },
  futureDayLabel: {
    color: '#4ade80',
  },
  badge: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  futureBadge: {
    backgroundColor: '#166534',
  },
  badgeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayContent: {
    paddingBottom: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 12,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  itemTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  addInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 12,
    backgroundColor: '#111',
  },
  addInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    padding: 0,
  },
  cancelBtn: {
    padding: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#444',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  typeGroup: {
    marginBottom: 8,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b82f6',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
});
