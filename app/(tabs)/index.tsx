import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { autoGenerateTags, getAllUniqueTags, getTagColor } from '@/lib/auto-tags';

interface Item {
  id: string;
  type: 'task' | 'note';
  text: string;
  status?: 'pending' | 'completed';
  created_at: string;
  tags?: string[];
}

interface MemoItem {
  id: string;
  summary: string | null;
  transcript: string | null;
  created_at: string;
  taskCount: number;
  noteCount: number;
}

interface DayData {
  date: Date;
  dateKey: string;
  label: string;
  isToday: boolean;
  isFuture: boolean;
  items: Item[];
  memos: MemoItem[];
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
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  // Inline add state - tracks which day and type
  const [addingTo, setAddingTo] = useState<{ dayKey: string; type: 'task' | 'note' } | null>(null);
  const [addingText, setAddingText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleAddTask = useCallback(async () => {
    if (!addingText.trim() || !user || !addingTo) return;
    
    // Parse the dayKey to get the target date (format: "YYYY-MM-DD")
    const [year, month, dayNum] = addingTo.dayKey.split('-').map(Number);
    // Month is 1-indexed in dayKey but 0-indexed in JS Date
    const targetDate = new Date(year, month - 1, dayNum);
    // Set to end of day so it sorts to bottom within that day
    targetDate.setHours(23, 59, 59, Date.now() % 1000);
    
    // Auto-generate tags from the text
    const tags = autoGenerateTags(addingText.trim());
    const tempId = `temp-${Date.now()}`;
    const createdAt = targetDate.toISOString();
    
    // Optimistic update - add item to local state immediately
    const newItem: Item = {
      id: tempId,
      type: 'task',
      text: addingText.trim(),
      status: 'pending',
      created_at: createdAt,
      tags,
    };
    
    setDays(prevDays => prevDays.map(day => {
      if (day.dateKey === addingTo.dayKey) {
        return { ...day, items: [...day.items, newItem] };
      }
      return day;
    }));
    
    // Remove from collapsedDays so the day stays expanded
    setCollapsedDays(prev => {
      const next = new Set(prev);
      next.delete(addingTo.dayKey);
      return next;
    });
    
    // Update tags if new
    if (tags.length > 0) {
      setAllTags(prev => {
        const tagSet = new Set(prev);
        tags.forEach(t => tagSet.add(t));
        return Array.from(tagSet);
      });
    }
    
    setAddingText('');
    setAddingTo(null);
    
    // Save to database in background
    const { error } = await supabase.from('voice_todos').insert({
      user_id: user.id,
      text: newItem.text,
      status: 'pending',
      tags,
      created_at: createdAt,
    });
    
    if (error) {
      console.error('Error adding task:', error);
      // Revert on error
      loadData();
    }
  }, [addingText, user, addingTo, loadData]);

  const handleAddNote = useCallback(async () => {
    if (!addingText.trim() || !user || !addingTo) return;
    
    // Parse the dayKey to get the target date (format: "YYYY-MM-DD")
    const [year, month, dayNum] = addingTo.dayKey.split('-').map(Number);
    // Month is 1-indexed in dayKey but 0-indexed in JS Date
    const targetDate = new Date(year, month - 1, dayNum);
    // Set to end of day so it sorts to bottom within that day
    targetDate.setHours(23, 59, 59, Date.now() % 1000);
    
    // Auto-generate tags from the text
    const tags = autoGenerateTags(addingText.trim());
    const tempId = `temp-${Date.now()}`;
    const createdAt = targetDate.toISOString();
    
    // Optimistic update - add item to local state immediately
    const newItem: Item = {
      id: tempId,
      type: 'note',
      text: addingText.trim(),
      created_at: createdAt,
      tags,
    };
    
    setDays(prevDays => prevDays.map(day => {
      if (day.dateKey === addingTo.dayKey) {
        return { ...day, items: [...day.items, newItem] };
      }
      return day;
    }));
    
    // Remove from collapsedDays so the day stays expanded
    setCollapsedDays(prev => {
      const next = new Set(prev);
      next.delete(addingTo.dayKey);
      return next;
    });
    
    // Update tags if new
    if (tags.length > 0) {
      setAllTags(prev => {
        const tagSet = new Set(prev);
        tags.forEach(t => tagSet.add(t));
        return Array.from(tagSet);
      });
    }
    
    setAddingText('');
    setAddingTo(null);
    
    // Save to database in background
    const { error } = await supabase.from('voice_notes').insert({
      user_id: user.id,
      text: newItem.text,
      is_archived: false,
      tags,
      created_at: createdAt,
    });
    
    if (error) {
      console.error('Error adding note:', error);
      // Revert on error
      loadData();
    }
  }, [addingText, user, addingTo, loadData]);

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: tasks } = await supabase
        .from('voice_todos')
        .select('id, text, status, created_at, tags, entry_id')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      const { data: notes } = await supabase
        .from('voice_notes')
        .select('id, text, created_at, tags, entry_id')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      const { data: voiceEntries } = await supabase
        .from('voice_entries')
        .select('id, summary, transcript, created_at')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });
      
      // Build memo counts from tasks/notes
      const memoTaskCounts = new Map<string, number>();
      const memoNoteCounts = new Map<string, number>();
      (tasks || []).forEach(t => {
        if (t.entry_id) {
          memoTaskCounts.set(t.entry_id, (memoTaskCounts.get(t.entry_id) || 0) + 1);
        }
      });
      (notes || []).forEach(n => {
        if (n.entry_id) {
          memoNoteCounts.set(n.entry_id, (memoNoteCounts.get(n.entry_id) || 0) + 1);
        }
      });

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
          memos: [],
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
          memos: [],
        };
        daysArray.push(day);
        dayMap.set(day.dateKey, day);
      }

      // Add tasks to days
      const allItems: Item[] = [];
      (tasks || []).forEach(t => {
        const key = getDateKey(new Date(t.created_at));
        const day = dayMap.get(key);
        const item: Item = { id: t.id, type: 'task', text: t.text, status: t.status, created_at: t.created_at, tags: t.tags || [] };
        if (day) {
          day.items.push(item);
        }
        allItems.push(item);
      });

      (notes || []).forEach(n => {
        const key = getDateKey(new Date(n.created_at));
        const day = dayMap.get(key);
        const item: Item = { id: n.id, type: 'note', text: n.text, created_at: n.created_at, tags: n.tags || [] };
        if (day) {
          day.items.push(item);
        }
        allItems.push(item);
      });

      // Add memos to days
      (voiceEntries || []).forEach(m => {
        const key = getDateKey(new Date(m.created_at));
        const day = dayMap.get(key);
        const memo: MemoItem = {
          id: m.id,
          summary: m.summary,
          transcript: m.transcript,
          created_at: m.created_at,
          taskCount: memoTaskCounts.get(m.id) || 0,
          noteCount: memoNoteCounts.get(m.id) || 0,
        };
        if (day) {
          day.memos.push(memo);
        }
      });
      
      // Extract all unique tags
      setAllTags(getAllUniqueTags(allItems));

      // Sort items within each day by created_at (oldest first - new items at bottom)
      daysArray.forEach(day => {
        day.items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });

      // Ensure today is expanded if it has items
      const todayKey = getDateKey(new Date());
      const todayData = dayMap.get(todayKey);
      if (todayData && todayData.items.length > 0) {
        setCollapsedDays(prev => {
          if (prev.has(todayKey)) {
            const next = new Set(prev);
            next.delete(todayKey);
            return next;
          }
          return prev;
        });
      }

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
    if (item.type === 'note') router.push(`/note/${item.id}`);
    else if (item.type === 'task') router.push(`/task/${item.id}`);
  }, [router]);

  const handleDeleteItem = useCallback((item: Item) => {
    const table = item.type === 'task' ? 'voice_todos' : 'voice_notes';
    const action = item.type === 'note' ? 'Archive' : 'Delete';
    
    Alert.alert(`${action} ${item.type === 'task' ? 'Task' : 'Note'}?`, '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: 'destructive',
        onPress: async () => {
          // Optimistic update - remove from UI immediately
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

  const toggleDayExpanded = (dateKey: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };


  // Helper to filter and sort items
  const processItems = (items: Item[]) => {
    let filtered = [...items];
    
    // Filter by selected tag if any
    if (selectedTag) {
      filtered = filtered.filter(item => item.tags?.includes(selectedTag));
    }
    
    // Sort by oldest first (new items go to bottom)
    filtered.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateA - dateB;
    });
    return filtered;
  };

  // Process days - today first, then past (newest first), exclude future
  const allDays = days
    .filter(d => !d.isFuture) // Only today and past
    .map(d => ({ ...d, items: processItems(d.items) }))
    .filter(d => {
      // When filtering by tag, hide days with no matching items (memos don't have tags so hide them too)
      if (selectedTag) return d.items.length > 0;
      // Otherwise show all days
      return true;
    })
    .sort((a, b) => {
      // Today comes first
      if (a.isToday && !b.isToday) return -1;
      if (!a.isToday && b.isToday) return 1;
      // Then sort by date descending (newest first)
      return new Date(b.dateKey).getTime() - new Date(a.dateKey).getTime();
    });
  
  const totalItems = allDays.reduce((sum, d) => sum + d.items.length + d.memos.length, 0);

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
      <Text style={[styles.itemText, item.status === 'completed' && styles.itemTextCompleted]} numberOfLines={1}>
        {item.text}
      </Text>
      {item.tags && item.tags.length > 0 && (
        <View style={styles.itemTagsRow}>
          {item.tags.slice(0, 3).map(tag => (
            <TouchableOpacity 
              key={tag}
              style={[styles.itemTag, { backgroundColor: `${getTagColor(tag)}20` }]}
              onPress={() => setSelectedTag(tag)}
            >
              <Text style={[styles.itemTagText, { color: getTagColor(tag) }]}>#{tag}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color="#333" />
    </TouchableOpacity>
  );

  const renderDaySection = (day: DayData, hideHeader: boolean = false) => {
    // Empty days are collapsed by default, others expanded
    // Today is ALWAYS expanded by default when it has items
    const hasItems = day.items.length > 0 || day.memos.length > 0;
    const totalCount = day.items.length + day.memos.length;
    const isExpanded = day.isToday && hasItems 
      ? !collapsedDays.has(day.dateKey) // Today with items: expanded unless explicitly collapsed
      : hasItems 
        ? !collapsedDays.has(day.dateKey) // Other days with items: expanded unless explicitly collapsed
        : collapsedDays.has(day.dateKey); // Empty days: collapsed unless explicitly expanded
    
    // Group by type
    const tasks = day.items.filter(i => i.type === 'task');
    const notes = day.items.filter(i => i.type === 'note');
    const memos = day.memos;
    
    return (
      <View key={day.dateKey} style={styles.daySection}>
        {!hideHeader && (
          <TouchableOpacity 
            style={[styles.dayHeader, !hasItems && styles.dayHeaderEmpty]}
            onPress={() => toggleDayExpanded(day.dateKey)}
            activeOpacity={0.7}
          >
            <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={18} color={hasItems ? '#0a0a0a' : '#666'} />
            <Text style={[styles.dayLabel, !hasItems && styles.dayLabelEmpty]}>{day.label}</Text>
          {hasItems && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{totalCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
        
        {isExpanded && (
          <View style={styles.dayContent}>
            {/* Tasks */}
            <View style={styles.typeGroup}>
              <Text style={styles.typeLabel}>Tasks</Text>
              {tasks.map(renderItem)}
              {addingTo?.dayKey === day.dateKey && addingTo?.type === 'task' ? (
                <View style={styles.inlineInputRow}>
                  <TextInput
                    ref={inputRef}
                    style={styles.inlineInput}
                    value={addingText}
                    onChangeText={setAddingText}
                    placeholder="Enter task..."
                    placeholderTextColor="#666"
                    autoFocus
                    onSubmitEditing={() => {
                      if (addingText.trim()) {
                        handleAddTask();
                      } else {
                        setAddingTo(null);
                      }
                    }}
                    blurOnSubmit={true}
                    returnKeyType="done"
                    enablesReturnKeyAutomatically={true}
                  />
                  <TouchableOpacity 
                    style={styles.cancelBtn}
                    onPress={() => { setAddingTo(null); setAddingText(''); }}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.addLink} 
                  onPress={() => setAddingTo({ dayKey: day.dateKey, type: 'task' })}
                >
                  <Text style={styles.addLinkText}>+ Add task</Text>
                </TouchableOpacity>
              )}
            </View>
            
            {/* Notes */}
            <View style={styles.typeGroup}>
              <Text style={[styles.typeLabel, { color: '#a78bfa' }]}>Notes</Text>
              {notes.map(renderItem)}
              {addingTo?.dayKey === day.dateKey && addingTo?.type === 'note' ? (
                <View style={styles.inlineInputRow}>
                  <TextInput
                    ref={inputRef}
                    style={styles.inlineInput}
                    value={addingText}
                    onChangeText={setAddingText}
                    placeholder="Enter note..."
                    placeholderTextColor="#666"
                    autoFocus
                    onSubmitEditing={() => {
                      if (addingText.trim()) {
                        handleAddNote();
                      } else {
                        setAddingTo(null);
                      }
                    }}
                    blurOnSubmit={true}
                    returnKeyType="done"
                    enablesReturnKeyAutomatically={true}
                  />
                  <TouchableOpacity 
                    style={styles.cancelBtn}
                    onPress={() => { setAddingTo(null); setAddingText(''); }}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.addLink} 
                  onPress={() => setAddingTo({ dayKey: day.dateKey, type: 'note' })}
                >
                  <Text style={[styles.addLinkText, { color: '#a78bfa' }]}>+ Add note</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Memos */}
            <View style={styles.typeGroup}>
              <Text style={[styles.typeLabel, { color: '#22c55e' }]}>Memos</Text>
              {memos.map(memo => (
                <TouchableOpacity
                  key={memo.id}
                  style={styles.item}
                  onPress={() => router.push(`/entry/${memo.id}`)}
                >
                  <Ionicons name="mic" size={18} color="#22c55e" />
                  <Text style={styles.itemText} numberOfLines={1}>
                    {memo.summary || memo.transcript?.slice(0, 50) || 'Voice memo'}
                  </Text>
                  {(memo.taskCount > 0 || memo.noteCount > 0) && (
                    <View style={styles.memoCounts}>
                      {memo.taskCount > 0 && (
                        <View style={styles.memoCountBadge}>
                          <Ionicons name="checkbox-outline" size={12} color="#3b82f6" />
                          <Text style={styles.memoCountText}>{memo.taskCount}</Text>
                        </View>
                      )}
                      {memo.noteCount > 0 && (
                        <View style={styles.memoCountBadge}>
                          <Ionicons name="document-text-outline" size={12} color="#a78bfa" />
                          <Text style={styles.memoCountText}>{memo.noteCount}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color="#333" />
                </TouchableOpacity>
              ))}
            </View>
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
        <Text style={styles.headerTitle}>MemoTalk</Text>
        
        <View style={{ flex: 1 }} />
        
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/search')}>
          <Ionicons name="search" size={22} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/(tabs)/settings')}>
          <Ionicons name="person-circle-outline" size={26} color="#666" />
        </TouchableOpacity>
      </View>

      
      {/* Tag Filter Row */}
      {allTags.length > 0 && (
        <View style={styles.tagFilterRow}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tagFilterContent}
            style={{ flex: 1 }}
          >
            {(selectedTag ? [selectedTag] : allTags).map(tag => (
              <TouchableOpacity
                key={tag}
                style={[
                  styles.tagChip, 
                  selectedTag === tag && styles.tagChipActive,
                  { borderColor: getTagColor(tag) }
                ]}
                onPress={() => setSelectedTag(selectedTag === tag ? null : tag)}
              >
                <Text style={[
                  styles.tagChipText, 
                  selectedTag === tag && styles.tagChipTextActive,
                  { color: selectedTag === tag ? '#fff' : getTagColor(tag) }
                ]}>
                  #{tag}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {selectedTag && (
            <TouchableOpacity
              style={styles.clearFilterBtn}
              onPress={() => setSelectedTag(null)}
            >
              <Text style={styles.clearFilterText}>Clear</Text>
              <Ionicons name="close-circle" size={14} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#c4dfc4" />}
      >
        {allDays.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Add Memo below</Text>
          </View>
        ) : (
          allDays.map(day => renderDaySection(day))
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
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
    backgroundColor: '#f472b6',
  },
  dayLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  dayHeaderEmpty: {
    backgroundColor: '#1a1a1a',
  },
  dayLabelEmpty: {
    color: '#666',
  },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 12,
    color: '#0a0a0a',
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
  },
  addBtnText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  addRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
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
    fontSize: 14,
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
  addLink: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  addLinkText: {
    fontSize: 13,
    color: '#3b82f6',
    opacity: 0.7,
  },
  inlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
  },
  inlineInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cancelBtnText: {
    fontSize: 13,
    color: '#666',
  },
  tagFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    maxHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  tagFilterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 12,
    gap: 4,
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
  },
  tagChipActive: {
    backgroundColor: '#1a3a1a',
    borderColor: '#4ade80',
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  tagChipTextActive: {
    color: '#fff',
  },
  itemTagsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  itemTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemTagText: {
    fontSize: 10,
    fontWeight: '600',
  },
  memoCounts: {
    flexDirection: 'row',
    gap: 8,
  },
  memoCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  memoCountText: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
  },
});
