import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  Animated,
  Dimensions,
  Pressable,
  Keyboard,
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
  const [dayPositions, setDayPositions] = useState<Map<string, number>>(new Map());
  const scrollViewRef = useRef<ScrollView>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagCounts, setTagCounts] = useState<Map<string, number>>(new Map());
  
  // Tag drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const drawerAnim = useRef(new Animated.Value(-280)).current;
  
  // Inline editing state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemType, setEditingItemType] = useState<'task' | 'note' | null>(null);
  const [editingText, setEditingText] = useState('');
  const overlayAnim = useRef(new Animated.Value(0)).current;
  
  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true);
    Animated.parallel([
      Animated.timing(drawerAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0.5,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [drawerAnim, overlayAnim]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(drawerAnim, {
        toValue: -280,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsDrawerOpen(false);
    });
  }, [drawerAnim, overlayAnim]);

  const toggleDrawer = useCallback(() => {
    if (isDrawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }, [isDrawerOpen, closeDrawer, openDrawer]);
  
  const toggleTagFilter = useCallback((tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag) // Remove if already selected
        : [...prev, tag] // Add if not selected
    );
  }, []);

  const clearAllFilters = useCallback(() => {
    setSelectedTags([]);
    closeDrawer();
  }, [closeDrawer]);

  const removeTagFilter = useCallback((tag: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  }, []);
  
  // Inline add state - tracks which day and type
  const [addingTo, setAddingTo] = useState<{ dayKey: string; type: 'task' | 'note' } | null>(null);
  const [addingText, setAddingText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const inputRowRef = useRef<View>(null);
  const justSubmittedRef = useRef(false);
  
  // Scroll to input when it becomes visible (keyboard handling)
  useEffect(() => {
    if (addingTo && scrollViewRef.current) {
      // Small delay to ensure layout is complete and keyboard is shown
      setTimeout(() => {
        // Use measureLayout to find actual input position
        if (inputRowRef.current) {
          inputRowRef.current.measureInWindow((x, y, width, height) => {
            // Get screen height and keyboard approximate height (~300px on iOS)
            const screenHeight = Dimensions.get('window').height;
            const keyboardHeight = 320;
            const visibleHeight = screenHeight - keyboardHeight;
            
            // If input is below visible area, scroll to it
            if (y > visibleHeight - 100) {
              const dayY = dayPositions.get(addingTo.dayKey) || 0;
              // Calculate how much we need to scroll
              const scrollAmount = y - visibleHeight + 150;
              scrollViewRef.current?.scrollTo({ 
                y: Math.max(0, dayY + scrollAmount), 
                animated: true 
              });
            }
          });
        }
      }, 200);
    }
  }, [addingTo, dayPositions]);

  const handleAddTask = useCallback(async () => {
    if (!addingText.trim() || !user || !addingTo || isSaving) return;
    
    justSubmittedRef.current = true;
    const taskText = addingText.trim();
    
    // Check for duplicate - exact same text in existing tasks
    const hasDuplicate = days.some(day => 
      day.items.some(item => 
        item.type === 'task' && item.text.toLowerCase() === taskText.toLowerCase()
      )
    );
    
    if (hasDuplicate) {
      Alert.alert('Duplicate Task', 'A task with this exact text already exists.');
      return;
    }
    
    setIsSaving(true);
    
    // Use current timestamp - new items always sort to bottom
    const createdAt = new Date().toISOString();
    
    // Auto-generate tags from the text
    const tags = autoGenerateTags(taskText);
    const tempId = `temp-${Date.now()}`;
    
    // Optimistic update - add item to local state immediately
    const newItem: Item = {
      id: tempId,
      type: 'task',
      text: taskText,
      status: 'pending',
      created_at: createdAt,
      tags,
    };
    
    setDays(prevDays => prevDays.map(day => {
      if (day.dateKey === addingTo.dayKey) {
        // Add and re-sort to maintain order
        const updatedItems = [...day.items, newItem].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        return { ...day, items: updatedItems };
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
    
    // Clear text but KEEP input open for multi-item entry
    setAddingText('');
    // Don't close: setAddingTo(null) - user taps outside to close
    
    // Save to database in background
    const { error } = await supabase.from('voice_todos').insert({
      user_id: user.id,
      text: newItem.text,
      status: 'pending',
      tags,
      created_at: createdAt,
    });
    
    setIsSaving(false);
    
    if (error) {
      console.error('Error adding task:', error);
      // Revert on error
      loadData();
    }
    
    // Re-focus input for next entry
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [addingText, user, addingTo, loadData, isSaving, days]);

  const handleAddNote = useCallback(async () => {
    if (!addingText.trim() || !user || !addingTo || isSaving) return;
    
    justSubmittedRef.current = true;
    const noteText = addingText.trim();
    
    // Check for duplicate - exact same text in existing notes
    const hasDuplicate = days.some(day => 
      day.items.some(item => 
        item.type === 'note' && item.text.toLowerCase() === noteText.toLowerCase()
      )
    );
    
    if (hasDuplicate) {
      Alert.alert('Duplicate Note', 'A note with this exact text already exists.');
      return;
    }
    
    setIsSaving(true);
    
    // Use current timestamp - new items always sort to bottom
    const createdAt = new Date().toISOString();
    
    // Auto-generate tags from the text
    const tags = autoGenerateTags(noteText);
    const tempId = `temp-${Date.now()}`;
    
    // Optimistic update - add item to local state immediately
    const newItem: Item = {
      id: tempId,
      type: 'note',
      text: noteText,
      created_at: createdAt,
      tags,
    };
    
    setDays(prevDays => prevDays.map(day => {
      if (day.dateKey === addingTo.dayKey) {
        // Add and re-sort to maintain order
        const updatedItems = [...day.items, newItem].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        return { ...day, items: updatedItems };
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
    
    // Clear text but KEEP input open for multi-item entry
    setAddingText('');
    // Don't close: setAddingTo(null) - user taps outside to close
    
    // Save to database in background
    const { error } = await supabase.from('voice_notes').insert({
      user_id: user.id,
      text: newItem.text,
      is_archived: false,
      tags,
      created_at: createdAt,
    });
    
    setIsSaving(false);
    
    if (error) {
      console.error('Error adding note:', error);
      // Revert on error
      loadData();
    }
    
    // Re-focus input for next entry
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [addingText, user, addingTo, loadData, isSaving, days]);

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
        // Auto-generate tags if not stored in DB
        const tags = (t.tags && t.tags.length > 0) ? t.tags : autoGenerateTags(t.text);
        const item: Item = { id: t.id, type: 'task', text: t.text, status: t.status, created_at: t.created_at, tags };
        if (day) {
          day.items.push(item);
        }
        allItems.push(item);
      });

      (notes || []).forEach(n => {
        const key = getDateKey(new Date(n.created_at));
        const day = dayMap.get(key);
        // Auto-generate tags if not stored in DB
        const tags = (n.tags && n.tags.length > 0) ? n.tags : autoGenerateTags(n.text);
        const item: Item = { id: n.id, type: 'note', text: n.text, created_at: n.created_at, tags };
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
      
      // Extract all unique tags with counts
      const counts = new Map<string, number>();
      allItems.forEach(item => {
        item.tags?.forEach(tag => {
          counts.set(tag, (counts.get(tag) || 0) + 1);
        });
      });
      setTagCounts(counts);
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

  const goToDetailPage = useCallback((item: Item) => {
    if (item.type === 'note') router.push(`/note/${item.id}`);
    else if (item.type === 'task') router.push(`/task/${item.id}`);
  }, [router]);

  const startEditingItem = useCallback((item: Item) => {
    setEditingItemId(item.id);
    setEditingItemType(item.type as 'task' | 'note');
    setEditingText(item.text);
  }, []);

  const saveItemEdit = useCallback(async (itemId: string) => {
    const trimmedText = editingText.trim();
    if (!trimmedText) {
      setEditingItemId(null);
      setEditingItemType(null);
      setEditingText('');
      return;
    }
    
    // Optimistic update
    setDays(prev => prev.map(day => ({
      ...day,
      items: day.items.map(item => 
        item.id === itemId ? { ...item, text: trimmedText } : item
      ),
    })));
    
    const table = editingItemType === 'task' ? 'voice_todos' : 'voice_notes';
    
    setEditingItemId(null);
    setEditingItemType(null);
    setEditingText('');
    
    try {
      await supabase.from(table).update({ text: trimmedText }).eq('id', itemId);
    } catch (error) {
      loadData(); // Revert on error
    }
  }, [editingText, editingItemType, loadData]);

  const cancelItemEdit = useCallback(() => {
    setEditingItemId(null);
    setEditingItemType(null);
    setEditingText('');
  }, []);

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

  const focusDay = useCallback((dateKey: string) => {
    // Expand the day if collapsed
    setCollapsedDays(prev => {
      const next = new Set(prev);
      next.delete(dateKey); // Remove from collapsed = expand it
      return next;
    });
    
    // Scroll to the day position
    const position = dayPositions.get(dateKey);
    if (position !== undefined && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: position, animated: true });
    }
  }, [dayPositions]);


  // Helper to filter and sort items
  const processItems = (items: Item[]) => {
    let filtered = [...items];
    
    // Filter by selected tags if any (item must have at least one of the selected tags)
    if (selectedTags.length > 0) {
      filtered = filtered.filter(item => 
        item.tags?.some(tag => selectedTags.includes(tag))
      );
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
      // When filtering by tags, hide days with no matching items (memos don't have tags so hide them too)
      if (selectedTags.length > 0) return d.items.length > 0;
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

  const renderItem = (item: Item) => {
    // Auto-generate tags if not present
    const displayTags = (item.tags && item.tags.length > 0) ? item.tags : autoGenerateTags(item.text);
    const isEditing = editingItemId === item.id;
    
    // If editing this item, show inline input
    if (isEditing) {
      return (
        <View key={item.id} style={styles.item}>
          {item.type === 'task' && (
            <TouchableOpacity onPress={() => handleToggleTask(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons 
                name={item.status === 'completed' ? 'checkbox' : 'square-outline'} 
                size={20} 
                color={item.status === 'completed' ? '#4ade80' : '#666'} 
              />
            </TouchableOpacity>
          )}
          {item.type === 'note' && <Ionicons name="ellipse" size={10} color="#a78bfa" style={{ marginHorizontal: 4 }} />}
          <TextInput
            style={styles.inlineEditInput}
            value={editingText}
            onChangeText={setEditingText}
            autoFocus
            selectTextOnFocus
            onSubmitEditing={() => saveItemEdit(item.id)}
            onBlur={() => saveItemEdit(item.id)}
            returnKeyType="done"
          />
          <TouchableOpacity onPress={cancelItemEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color="#666" />
          </TouchableOpacity>
        </View>
      );
    }
    
    return (
      <View
        key={item.id}
        style={styles.item}
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
        {item.type === 'note' && <Ionicons name="ellipse" size={10} color="#a78bfa" style={{ marginHorizontal: 4 }} />}
        <TouchableOpacity 
          style={styles.itemTextWrapper}
          onPress={() => startEditingItem(item)}
          onLongPress={() => handleDeleteItem(item)}
          delayLongPress={500}
        >
          <Text style={[styles.itemText, item.status === 'completed' && styles.itemTextCompleted]} numberOfLines={1}>
            {item.text}
          </Text>
        </TouchableOpacity>
        {displayTags.length > 0 && (
          <View style={styles.itemTagsRow}>
            {displayTags.slice(0, 2).map(tag => (
              <TouchableOpacity 
                key={tag}
                style={[styles.itemTag, { backgroundColor: `${getTagColor(tag)}20` }]}
                onPress={() => toggleTagFilter(tag)}
              >
                <Text style={[styles.itemTagText, { color: getTagColor(tag) }]}>#{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TouchableOpacity 
          onPress={() => goToDetailPage(item)} 
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.detailBtn}
        >
          <Ionicons name="chevron-forward" size={16} color="#444" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderDaySection = (day: DayData, hideHeader: boolean = false, isFirstDay: boolean = false) => {
    // Today is ALWAYS expanded and pink, even if empty
    // Past days: expanded if has items, collapsed if empty
    const hasItems = day.items.length > 0 || day.memos.length > 0;
    const totalCount = day.items.length + day.memos.length;
    const isExpanded = day.isToday 
      ? !collapsedDays.has(day.dateKey) // Today: always expanded by default (unless user collapses)
      : hasItems 
        ? !collapsedDays.has(day.dateKey) // Past days with items: expanded unless explicitly collapsed
        : false; // Past empty days: always collapsed
    
    // Group by type
    const tasks = day.items.filter(i => i.type === 'task');
    const notes = day.items.filter(i => i.type === 'note');
    const memos = day.memos;
    
    return (
      <View 
        key={day.dateKey} 
        style={styles.daySection}
        onLayout={(e) => {
          const y = e.nativeEvent.layout.y;
          setDayPositions(prev => new Map(prev).set(day.dateKey, y));
        }}
      >
        {!hideHeader && (
          <View style={[styles.dayHeader, !hasItems && !day.isToday && styles.dayHeaderEmpty]}>
            <TouchableOpacity 
              style={styles.dayHeaderLeft}
              onPress={() => toggleDayExpanded(day.dateKey)}
              activeOpacity={0.7}
            >
              <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={18} color={hasItems || day.isToday ? '#0a0a0a' : '#666'} />
              <Text style={[styles.dayLabel, !hasItems && !day.isToday && styles.dayLabelEmpty]}>{day.label}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.badge, !hasItems && !day.isToday && styles.badgeEmpty]}
              onPress={() => !day.isToday && focusDay(day.dateKey)}
              activeOpacity={day.isToday ? 1 : 0.7}
            >
              <Text style={[styles.badgeText, !hasItems && !day.isToday && styles.badgeTextEmpty]}>{totalCount}</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {isExpanded && (
          <View style={styles.dayContent}>
            {/* Tasks */}
            <View style={styles.typeGroup}>
              <View style={styles.typeLabelRow}>
                <Ionicons name="checkbox-outline" size={14} color="#3b82f6" />
                <Text style={styles.typeLabel}>Tasks</Text>
              </View>
              {tasks.map(renderItem)}
              {addingTo?.dayKey === day.dateKey && addingTo?.type === 'task' ? (
                <View ref={inputRowRef} style={styles.inlineInputRow}>
                  <Ionicons name="square-outline" size={20} color="#666" />
                  <View style={styles.inputWithCancel}>
                    <TextInput
                      ref={inputRef}
                      style={styles.inlineInputInner}
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
                          Keyboard.dismiss();
                        }
                      }}
                      onBlur={() => {
                        if (justSubmittedRef.current) {
                          justSubmittedRef.current = false;
                          return;
                        }
                        setTimeout(() => {
                          if (!justSubmittedRef.current) {
                            setAddingTo(null);
                          }
                        }, 150);
                      }}
                      blurOnSubmit={false}
                      returnKeyType="next"
                    />
                    <TouchableOpacity 
                      style={styles.inlineAddBtn}
                      onPress={() => { if (addingText.trim()) handleAddTask(); }}
                      hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
                    >
                      <Text style={[styles.inlineAddText, !addingText.trim() && styles.inlineAddTextDisabled]}>Add</Text>
                    </TouchableOpacity>
                    <Text style={styles.inlineDivider}>|</Text>
                    <TouchableOpacity 
                      style={styles.inlineCancelBtn}
                      onPress={() => { setAddingTo(null); setAddingText(''); Keyboard.dismiss(); }}
                      hitSlop={{ top: 10, bottom: 10, left: 5, right: 10 }}
                    >
                      <Text style={styles.inlineCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
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
              <View style={styles.typeLabelRow}>
                <Ionicons name="document-text-outline" size={14} color="#a78bfa" />
                <Text style={[styles.typeLabel, { color: '#a78bfa' }]}>Notes</Text>
              </View>
              {notes.map(renderItem)}
              {addingTo?.dayKey === day.dateKey && addingTo?.type === 'note' ? (
                <View ref={inputRowRef} style={styles.inlineInputRow}>
                  <Ionicons name="ellipse" size={10} color="#a78bfa" style={{ marginHorizontal: 5 }} />
                  <View style={styles.inputWithCancel}>
                    <TextInput
                      ref={inputRef}
                      style={styles.inlineInputInner}
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
                          Keyboard.dismiss();
                        }
                      }}
                      onBlur={() => {
                        if (justSubmittedRef.current) {
                          justSubmittedRef.current = false;
                          return;
                        }
                        setTimeout(() => {
                          if (!justSubmittedRef.current) {
                            setAddingTo(null);
                          }
                        }, 150);
                      }}
                      blurOnSubmit={false}
                      returnKeyType="next"
                    />
                    <TouchableOpacity 
                      style={styles.inlineAddBtn}
                      onPress={() => { if (addingText.trim()) handleAddNote(); }}
                      hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
                    >
                      <Text style={[styles.inlineAddText, !addingText.trim() && styles.inlineAddTextDisabled]}>Add</Text>
                    </TouchableOpacity>
                    <Text style={styles.inlineDivider}>|</Text>
                    <TouchableOpacity 
                      style={styles.inlineCancelBtn}
                      onPress={() => { setAddingTo(null); setAddingText(''); Keyboard.dismiss(); }}
                      hitSlop={{ top: 10, bottom: 10, left: 5, right: 10 }}
                    >
                      <Text style={styles.inlineCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
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
              <View style={styles.typeLabelRow}>
                <Ionicons name="mic-outline" size={14} color="#22c55e" />
                <Text style={[styles.typeLabel, { color: '#22c55e' }]}>Memos</Text>
              </View>
              {memos.map(memo => (
                <TouchableOpacity
                  key={memo.id}
                  style={styles.item}
                  onPress={() => router.push(`/entry/${memo.id}`)}
                >
                  <Ionicons name="play" size={16} color="#22c55e" />
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
                          <Ionicons name="ellipse" size={8} color="#a78bfa" />
                          <Text style={styles.memoCountText}>{memo.noteCount}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color="#333" />
                </TouchableOpacity>
              ))}
              <TouchableOpacity 
                style={styles.addLink} 
                onPress={() => router.push('/record?autoStart=true')}
              >
                <Text style={[styles.addLinkText, { color: '#22c55e' }]}>+ Add Memo</Text>
              </TouchableOpacity>
            </View>
            
            {/* Spacer for Today - leaves room for Yesterday to peek */}
            {isFirstDay && day.isToday && (
              <View style={{ height: Math.max(Dimensions.get('window').height - 750, 50) }} />
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
        <TouchableOpacity style={styles.menuBtn} onPress={toggleDrawer}>
          <Ionicons name="menu" size={24} color={selectedTags.length > 0 ? '#22c55e' : '#fff'} />
          {selectedTags.length > 0 && (
            <View style={styles.menuBadge}>
              <Text style={styles.menuBadgeText}>{selectedTags.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>MemoTalk</Text>
        
        <View style={{ flex: 1 }} />
        
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/search')}>
          <Ionicons name="search" size={22} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/(tabs)/settings')}>
          <Ionicons name="person-circle-outline" size={26} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Tag Drawer Overlay */}
      <Pressable 
        style={[styles.drawerOverlay, { pointerEvents: isDrawerOpen ? 'auto' : 'none' }]}
        onPress={closeDrawer}
      >
        <Animated.View style={[styles.drawerOverlayBg, { opacity: overlayAnim }]} />
      </Pressable>

      {/* Tag Drawer */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerAnim }] }]}>
        <View style={[styles.drawerContent, { paddingTop: insets.top + 12 }]}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>Filters</Text>
            <TouchableOpacity onPress={closeDrawer}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          
          {/* Active Filters Section */}
          {selectedTags.length > 0 && (
            <View style={styles.activeFiltersSection}>
              <View style={styles.activeFiltersHeader}>
                <Text style={styles.activeFiltersLabel}>Active ({selectedTags.length})</Text>
                <TouchableOpacity onPress={clearAllFilters}>
                  <Text style={styles.clearAllText}>Clear all</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.activeFiltersList}>
                {selectedTags.map(tag => (
                  <TouchableOpacity 
                    key={tag}
                    style={[styles.activeFilterPill, { backgroundColor: `${getTagColor(tag)}25`, borderColor: getTagColor(tag) }]}
                    onPress={() => removeTagFilter(tag)}
                  >
                    <Text style={[styles.activeFilterPillText, { color: getTagColor(tag) }]}>#{tag}</Text>
                    <Ionicons name="close-circle" size={16} color={getTagColor(tag)} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          
          <ScrollView style={styles.drawerScroll} showsVerticalScrollIndicator={false}>
            {/* All items option */}
            <TouchableOpacity 
              style={[styles.drawerTag, selectedTags.length === 0 && styles.drawerTagActive]}
              onPress={clearAllFilters}
            >
              <View style={styles.drawerTagLeft}>
                <View style={[styles.drawerTagDot, { backgroundColor: '#666' }]} />
                <Text style={[styles.drawerTagText, selectedTags.length === 0 && styles.drawerTagTextActive]}>All Items</Text>
              </View>
              <Text style={styles.drawerTagCount}>{allTags.reduce((sum, t) => sum + (tagCounts.get(t) || 0), 0)}</Text>
            </TouchableOpacity>
            
            {/* Individual tags sorted by count */}
            {allTags.map(tag => {
              const count = tagCounts.get(tag) || 0;
              const isActive = selectedTags.includes(tag);
              return (
                <TouchableOpacity 
                  key={tag}
                  style={[styles.drawerTag, isActive && styles.drawerTagActive]}
                  onPress={() => toggleTagFilter(tag)}
                >
                  <View style={styles.drawerTagLeft}>
                    {isActive && <Ionicons name="checkmark-circle" size={18} color={getTagColor(tag)} style={{ marginRight: 6 }} />}
                    {!isActive && <View style={[styles.drawerTagDot, { backgroundColor: getTagColor(tag) }]} />}
                    <Text style={[styles.drawerTagText, isActive && styles.drawerTagTextActive]}>#{tag}</Text>
                  </View>
                  <View style={styles.drawerTagRight}>
                    <View style={[styles.drawerTagBar, { width: Math.min(count * 8, 60), backgroundColor: `${getTagColor(tag)}40` }]} />
                    <Text style={styles.drawerTagCount}>{count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Animated.View>

      {/* Content */}
      <ScrollView
        ref={scrollViewRef}
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
          allDays.map((day, index) => renderDaySection(day, false, index === 0))
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
  menuBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  menuBadge: {
    position: 'absolute',
    top: 4,
    right: 2,
    backgroundColor: '#f472b6',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0a0a0a',
  },
  drawerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 998,
  },
  drawerOverlayBg: {
    flex: 1,
    backgroundColor: '#000',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 280,
    backgroundColor: '#111',
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  drawerContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    marginBottom: 8,
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  activeFiltersSection: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    marginBottom: 8,
  },
  activeFiltersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  activeFiltersLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearAllText: {
    fontSize: 12,
    color: '#888',
  },
  activeFiltersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  activeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  activeFilterPillText: {
    fontSize: 14,
    fontWeight: '500',
  },
  drawerScroll: {
    flex: 1,
  },
  drawerTag: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  drawerTagActive: {
    backgroundColor: '#1a1a1a',
  },
  drawerTagLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  drawerTagDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  drawerTagText: {
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
  drawerTagTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  drawerTagRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drawerTagBar: {
    height: 6,
    borderRadius: 3,
  },
  drawerTagCount: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'right',
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
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#f472b6',
  },
  dayHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  dayLabel: {
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
  badgeEmpty: {
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  badgeTextEmpty: {
    color: '#666',
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
  itemTextWrapper: {
    flex: 1,
  },
  itemText: {
    fontSize: 14,
    color: '#fff',
  },
  itemTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  inlineEditInput: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
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
  typeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b82f6',
    letterSpacing: 1,
    textTransform: 'uppercase',
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
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 12,
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
  inputWithCancel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingRight: 4,
  },
  inlineInputInner: {
    flex: 1,
    paddingLeft: 2,
    paddingRight: 8,
    paddingVertical: 10,
    fontSize: 14,
    color: '#fff',
  },
  inlineAddBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  inlineAddText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3b82f6',
  },
  inlineAddTextDisabled: {
    color: '#444',
  },
  inlineDivider: {
    fontSize: 13,
    color: '#333',
  },
  inlineCancelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  inlineCancelText: {
    fontSize: 13,
    color: '#666',
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
  detailBtn: {
    padding: 4,
    marginLeft: 4,
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
