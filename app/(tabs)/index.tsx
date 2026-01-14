import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  Modal,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { supabase } from '@/lib/supabase';
import { autoGenerateTags, getAllUniqueTags, getTagColor } from '@/lib/auto-tags';
import { SwipeableItem } from '@/components/SwipeableItem';
import { ModernLoader } from '@/components/ModernLoader';

// Sort options
type SortOption = 
  | 'normal'           // Original order (created_at, oldest first)
  | 'newest'           // Created, new to old
  | 'oldest'           // Created, old to new
  | 'pending_first'    // Not done first, then done
  | 'completed_first'  // Done first, then not done
  | 'tasks_first'      // Tasks before notes
  | 'notes_first';     // Notes before tasks

const SORT_OPTIONS: { value: SortOption; label: string; icon: string }[] = [
  { value: 'pending_first', label: 'Not done first', icon: 'square-outline' },
  { value: 'completed_first', label: 'Done first', icon: 'checkbox' },
  { value: 'newest', label: 'Newest first', icon: 'arrow-up' },
  { value: 'oldest', label: 'Oldest first', icon: 'arrow-down' },
  { value: 'normal', label: 'Original order', icon: 'time-outline' },
];

const SORT_STORAGE_KEY = '@memotalk_sort_option';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Format recurrence pattern for display (e.g., "Weekly on Tue", "Monthly on 15th")
const formatRecurrencePattern = (pattern: any): string => {
  if (!pattern) return '';
  
  const { frequency, day_of_week, day_of_month, interval } = pattern;
  
  if (frequency === 'daily') {
    return interval === 2 ? 'Every other day' : 'Daily';
  }
  
  if (frequency === 'weekly') {
    const dayName = day_of_week !== undefined ? WEEKDAY_NAMES[day_of_week] : '';
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
  
  return '';
};

// Memoized checkbox component with LOCAL state for instant feedback
const TaskCheckbox = React.memo(({ 
  itemId, 
  initialStatus, 
  onToggle 
}: { 
  itemId: string; 
  initialStatus: 'pending' | 'completed' | undefined;
  onToggle: (id: string, newStatus: 'pending' | 'completed') => void;
}) => {
  const [localStatus, setLocalStatus] = useState(initialStatus);
  const isCompleted = localStatus === 'completed';
  
  // Sync with parent if initialStatus changes (e.g., after refresh)
  useEffect(() => {
    setLocalStatus(initialStatus);
  }, [initialStatus]);
  
  const handlePress = useCallback(() => {
    const newStatus = localStatus === 'completed' ? 'pending' : 'completed';
    setLocalStatus(newStatus); // INSTANT local update
    onToggle(itemId, newStatus); // Notify parent (fire and forget)
  }, [localStatus, itemId, onToggle]);
  
  return (
    <Pressable 
      onPress={handlePress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
    >
      <Ionicons 
        name={isCompleted ? 'checkbox' : 'square-outline'} 
        size={20} 
        color={isCompleted ? '#3b82f6' : '#666'} 
      />
    </Pressable>
  );
});

interface Item {
  id: string;
  type: 'task' | 'note';
  text: string;
  status?: 'pending' | 'completed';
  created_at: string;
  tags?: string[];
  due_date?: string;
  is_recurring?: boolean;
  recurrence_pattern?: {
    frequency?: string;
    instance?: number;
    total?: number;
  };
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
  const { colors, isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [days, setDays] = useState<DayData[]>([]);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [dayPositions, setDayPositions] = useState<Map<string, number>>(new Map());
  const scrollViewRef = useRef<ScrollView>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagCounts, setTagCounts] = useState<Map<string, number>>(new Map());
  
  // Sort state
  const [sortOption, setSortOption] = useState<SortOption>('pending_first');
  const [isSortModalVisible, setIsSortModalVisible] = useState(false);
  
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
    
    // Save to database and get the real ID back
    const { data, error } = await supabase.from('voice_todos').insert({
      user_id: user.id,
      text: newItem.text,
      status: 'pending',
      tags,
      created_at: createdAt,
    }).select('id').single();
    
    setIsSaving(false);
    
    if (error) {
      console.error('Error adding task:', error);
      // Revert on error
      loadData();
    } else if (data) {
      // Update the temp ID with the real database ID
      setDays(prevDays => prevDays.map(day => ({
        ...day,
        items: day.items.map(item => 
          item.id === tempId ? { ...item, id: data.id } : item
        ),
      })));
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
    
    // Save to database and get the real ID back
    const { data, error } = await supabase.from('voice_notes').insert({
      user_id: user.id,
      text: newItem.text,
      is_archived: false,
      tags,
      created_at: createdAt,
    }).select('id').single();
    
    setIsSaving(false);
    
    if (error) {
      console.error('Error adding note:', error);
      // Revert on error
      loadData();
    } else if (data) {
      // Update the temp ID with the real database ID
      setDays(prevDays => prevDays.map(day => ({
        ...day,
        items: day.items.map(item => 
          item.id === tempId ? { ...item, id: data.id } : item
        ),
      })));
    }
    
    // Re-focus input for next entry
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [addingText, user, addingTo, loadData, isSaving, days]);

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

      // Parallel queries for better performance
      const [tasksResult, notesResult, entriesResult] = await Promise.all([
        supabase
          .from('voice_todos')
          .select('id, text, status, created_at, tags, entry_id, due_date, is_recurring, recurrence_pattern')
          .eq('user_id', user.id)
          .neq('status', 'dismissed')
          .gte('created_at', thirtyDaysAgoISO)
          .order('created_at', { ascending: false }),
        supabase
          .from('voice_notes')
          .select('id, text, created_at, tags, entry_id')
          .eq('user_id', user.id)
          .eq('is_archived', false)
          .gte('created_at', thirtyDaysAgoISO)
          .order('created_at', { ascending: false }),
        supabase
          .from('voice_entries')
          .select('id, summary, transcript, created_at')
          .eq('user_id', user.id)
          .eq('is_archived', false)
          .gte('created_at', thirtyDaysAgoISO)
          .order('created_at', { ascending: false }),
      ]);

      const tasks = tasksResult.data;
      const notes = notesResult.data;
      const voiceEntries = entriesResult.data;
      
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

      // Add tasks to days - always use created_at (feed shows when you captured it)
      // The due_date is shown as a badge, not used for grouping
      const allItems: Item[] = [];
      (tasks || []).forEach(t => {
        const key = getDateKey(new Date(t.created_at));
        const day = dayMap.get(key);
        // Auto-generate tags if not stored in DB
        const tags = (t.tags && t.tags.length > 0) ? t.tags : autoGenerateTags(t.text);
        const item: Item = { 
          id: t.id, 
          type: 'task', 
          text: t.text, 
          status: t.status, 
          created_at: t.created_at, 
          tags,
          due_date: t.due_date,
          is_recurring: t.is_recurring,
          recurrence_pattern: t.recurrence_pattern,
        };
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

      // Sorting is handled by processItems when computing allDays

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

  // Load sort preference from storage
  useEffect(() => {
    const loadSortPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(SORT_STORAGE_KEY);
        if (saved && SORT_OPTIONS.some(opt => opt.value === saved)) {
          setSortOption(saved as SortOption);
        }
      } catch (e) {
        console.log('Failed to load sort preference:', e);
      }
    };
    loadSortPreference();
  }, []);

  // Save sort preference when changed
  const handleSortChange = useCallback(async (newSort: SortOption) => {
    setSortOption(newSort);
    setIsSortModalVisible(false);
    try {
      await AsyncStorage.setItem(SORT_STORAGE_KEY, newSort);
    } catch (e) {
      console.log('Failed to save sort preference:', e);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  // Called by TaskCheckbox after local state already updated
  const handleToggleTask = useCallback((itemId: string, newStatus: 'pending' | 'completed') => {
    // Save to database in background (checkbox already updated locally)
    supabase
      .from('voice_todos')
      .update({ status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null })
      .eq('id', itemId)
      .then(({ error }) => {
        if (!error) {
          // Sync parent state after DB success (for sorting to work on next render)
          setDays(prev => {
            const dayIndex = prev.findIndex(d => d.items.some(i => i.id === itemId));
            if (dayIndex === -1) return prev;
            const newDays = [...prev];
            const day = newDays[dayIndex];
            newDays[dayIndex] = {
              ...day,
              items: day.items.map(i => i.id === itemId ? { ...i, status: newStatus } : i),
            };
            return newDays;
          });
        }
      });
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
    Alert.alert(`Archive ${item.type === 'task' ? 'Task' : 'Note'}?`, '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          // Optimistic update - remove from UI immediately
          setDays(prev => prev.map(day => ({
            ...day,
            items: day.items.filter(i => i.id !== item.id),
          })));
          try {
            if (item.type === 'note') {
              await supabase.from('voice_notes').update({ is_archived: true }).eq('id', item.id);
            } else {
              // Tasks use 'dismissed' status for archive
              await supabase.from('voice_todos').update({ status: 'dismissed' }).eq('id', item.id);
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


  // Helper to filter and sort items based on sortOption
  const processItems = useCallback((items: Item[]) => {
    let filtered = [...items];
    
    // Filter by selected tags if any (item must have at least one of the selected tags)
    if (selectedTags.length > 0) {
      filtered = filtered.filter(item => 
        item.tags?.some(tag => selectedTags.includes(tag))
      );
    }
    
    // Sort based on sortOption
    filtered.sort((a, b) => {
      switch (sortOption) {
        case 'normal':
          // Original order - by created_at, oldest first
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          
        case 'newest':
          // Newest first
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          
        case 'oldest':
          // Oldest first
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          
        case 'pending_first':
          // Not done first, then done; within each group, oldest first
          const aPending = a.status === 'completed' ? 1 : 0;
          const bPending = b.status === 'completed' ? 1 : 0;
          if (aPending !== bPending) return aPending - bPending;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          
        case 'completed_first':
          // Done first, then not done; within each group, oldest first
          const aCompleted = a.status === 'completed' ? 0 : 1;
          const bCompleted = b.status === 'completed' ? 0 : 1;
          if (aCompleted !== bCompleted) return aCompleted - bCompleted;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          
        case 'tasks_first':
          // Tasks before notes; within each type, oldest first
          const aTask = a.type === 'task' ? 0 : 1;
          const bTask = b.type === 'task' ? 0 : 1;
          if (aTask !== bTask) return aTask - bTask;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          
        case 'notes_first':
          // Notes before tasks; within each type, oldest first
          const aNote = a.type === 'note' ? 0 : 1;
          const bNote = b.type === 'note' ? 0 : 1;
          if (aNote !== bNote) return aNote - bNote;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          
        default:
          return 0;
      }
    });
    return filtered;
  }, [selectedTags, sortOption]);

  // Process days - memoized for performance
  const allDays = useMemo(() => {
    return days
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
  }, [days, processItems, selectedTags]);
  
  const totalItems = useMemo(() => 
    allDays.reduce((sum, d) => sum + d.items.length + d.memos.length, 0),
    [allDays]
  );

  // These hooks MUST be defined before any conditional returns to avoid "rendered more hooks" error
  const handleSwipeArchive = useCallback(async (item: Item) => {
    // Optimistic update - remove from UI immediately
    setDays(prev => prev.map(day => ({
      ...day,
      items: day.items.filter(i => i.id !== item.id),
    })));
    
    try {
      if (item.type === 'note') {
        await supabase.from('voice_notes').update({ is_archived: true }).eq('id', item.id);
      } else {
        // Tasks use 'dismissed' status for archive
        await supabase.from('voice_todos').update({ status: 'dismissed' }).eq('id', item.id);
      }
    } catch (error) {
      loadData(); // Revert on error
    }
  }, [loadData]);

  const handleSwipeArchiveMemo = useCallback(async (memoId: string) => {
    // Optimistic update - remove from UI immediately
    setDays(prev => prev.map(day => ({
      ...day,
      memos: day.memos.filter(m => m.id !== memoId),
    })));
    
    try {
      await supabase.from('voice_entries').update({ is_archived: true }).eq('id', memoId);
    } catch (error) {
      loadData(); // Revert on error
    }
  }, [loadData]);

  // Early return AFTER all hooks are defined
  if (isLoading || authLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ModernLoader size="large" color={colors.accent} />
      </View>
    );
  }

  const renderItem = (item: Item) => {
    // Auto-generate tags if not present
    const displayTags = (item.tags && item.tags.length > 0) ? item.tags : autoGenerateTags(item.text);
    const isEditing = editingItemId === item.id;
    
    // If editing this item, show inline input (no swipe)
    if (isEditing) {
      return (
        <View key={item.id} style={styles.item}>
          {item.type === 'task' && (
            <TaskCheckbox 
              itemId={item.id} 
              initialStatus={item.status} 
              onToggle={handleToggleTask} 
            />
          )}
          {item.type === 'note' && <Ionicons name="ellipse" size={10} color={colors.notesPurple} style={{ marginHorizontal: 4 }} />}
          <TextInput
            style={[styles.inlineEditInput, { backgroundColor: colors.card, color: colors.text }]}
            value={editingText}
            onChangeText={setEditingText}
            autoFocus
            selectTextOnFocus
            onSubmitEditing={() => saveItemEdit(item.id)}
            onBlur={() => saveItemEdit(item.id)}
            returnKeyType="done"
          />
          <TouchableOpacity onPress={cancelItemEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      );
    }
    
    // Format due date for display
    const formatDueDate = (dateStr?: string) => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dueDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const diffDays = Math.round((dueDate.getTime() - todayStart.getTime()) / 86400000);
      
      if (diffDays < 0) return { text: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), isOverdue: true };
      if (diffDays === 0) return { text: 'Today', isOverdue: false };
      if (diffDays === 1) return { text: 'Tomorrow', isOverdue: false };
      if (diffDays < 7) return { text: date.toLocaleDateString('en-US', { weekday: 'short' }), isOverdue: false };
      return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isOverdue: false };
    };
    
    const dueDateInfo = item.type === 'task' ? formatDueDate(item.due_date) : null;
    const scheduleText = item.is_recurring && item.recurrence_pattern 
      ? formatRecurrencePattern(item.recurrence_pattern)
      : null;
    
    // Swipeable content (no checkbox - checkbox is outside for instant tap response)
    const swipeableContent = (
      <View style={styles.itemInner}>
        <View style={styles.itemTextWrapper}>
          {/* Only the text itself triggers editing */}
          <TouchableOpacity onPress={() => startEditingItem(item)}>
            <Text style={[styles.itemText, { color: colors.text }, item.status === 'completed' && { textDecorationLine: 'line-through', color: colors.taskBlue }]}>
              {item.text}
            </Text>
          </TouchableOpacity>
          {/* Due date and recurring schedule row for tasks - tapping goes to detail */}
          {item.type === 'task' && (dueDateInfo || scheduleText) && (
            <TouchableOpacity onPress={() => goToDetailPage(item)} style={styles.taskMetaRow}>
              {dueDateInfo && (
                <View style={[styles.dueDateBadge, dueDateInfo.isOverdue && styles.dueDateBadgeOverdue]}>
                  <Ionicons name="calendar-outline" size={11} color={dueDateInfo.isOverdue ? '#ef4444' : colors.textMuted} />
                  <Text style={[styles.dueDateText, { color: colors.textMuted }, dueDateInfo.isOverdue && styles.dueDateTextOverdue]}>
                    {dueDateInfo.text}
                  </Text>
                </View>
              )}
              {scheduleText && (
                <View style={[styles.scheduleBadge, { backgroundColor: `${colors.taskBlue}15` }]}>
                  <Ionicons name="repeat" size={10} color={colors.taskBlue} />
                  <Text style={[styles.scheduleText, { color: colors.taskBlue }]}>
                    {scheduleText}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
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
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );

    // Task: SwipeableItem wraps entire row to avoid clipping
    if (item.type === 'task') {
      return (
        <SwipeableItem
          key={item.id}
          onSwipeLeft={() => handleSwipeArchive(item)}
          leftAction={{
            icon: 'trash-outline',
            color: '#fff',
            backgroundColor: colors.error,
            label: 'Delete',
          }}
        >
          <View style={styles.item}>
            <TaskCheckbox 
              itemId={item.id} 
              initialStatus={item.status} 
              onToggle={handleToggleTask} 
            />
            {swipeableContent}
          </View>
        </SwipeableItem>
      );
    }
    
    // Note: SwipeableItem wraps entire row
    return (
      <SwipeableItem
        key={item.id}
        onSwipeLeft={() => handleSwipeArchive(item)}
        leftAction={{
          icon: 'archive-outline',
          color: '#fff',
          backgroundColor: colors.error,
          label: 'Archive',
        }}
      >
        <View style={styles.item}>
          <Ionicons name="ellipse" size={10} color={colors.notesPurple} style={{ marginHorizontal: 4 }} />
          {swipeableContent}
        </View>
      </SwipeableItem>
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
        style={[styles.daySection, { borderBottomColor: colors.cardBorder }]}
        onLayout={(e) => {
          const y = e.nativeEvent.layout.y;
          setDayPositions(prev => new Map(prev).set(day.dateKey, y));
        }}
      >
        {!hideHeader && (
          <View style={[
            styles.dayHeader, 
            { backgroundColor: hasItems || day.isToday ? colors.accent : colors.card }
          ]}>
            <TouchableOpacity 
              style={styles.dayHeaderLeft}
              onPress={() => toggleDayExpanded(day.dateKey)}
              activeOpacity={0.7}
            >
              <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={18} color={hasItems || day.isToday ? (isDark ? '#0a0a0a' : '#fff') : colors.textSecondary} />
              <Text style={[styles.dayLabel, { color: hasItems || day.isToday ? (isDark ? '#0a0a0a' : '#fff') : colors.textSecondary }]}>{day.label}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.badge, { backgroundColor: hasItems || day.isToday ? 'rgba(0,0,0,0.2)' : colors.cardBorder }]}
              onPress={() => !day.isToday && focusDay(day.dateKey)}
              activeOpacity={day.isToday ? 1 : 0.7}
            >
              <Text style={[styles.badgeText, { color: hasItems || day.isToday ? (isDark ? '#0a0a0a' : '#fff') : colors.textSecondary }]}>{totalCount}</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {isExpanded && (
          <View style={styles.dayContent}>
            {/* Tasks */}
            <View style={styles.typeGroup}>
              <View style={styles.typeLabelRow}>
                <Ionicons name="checkbox-outline" size={14} color={colors.taskBlue} />
                <Text style={[styles.typeLabel, { color: colors.taskBlue }]}>Tasks</Text>
              </View>
              {tasks.map(renderItem)}
              {addingTo?.dayKey === day.dateKey && addingTo?.type === 'task' ? (
                <View ref={inputRowRef} style={styles.inlineInputRow}>
                  <Ionicons name="square-outline" size={20} color={colors.textSecondary} />
                  <View style={styles.inputWithCancel}>
                    <TextInput
                      ref={inputRef}
                      style={[styles.inlineInputInner, { color: colors.text }]}
                      value={addingText}
                      onChangeText={setAddingText}
                      placeholder="Enter task..."
                      placeholderTextColor={colors.textSecondary}
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
                      <Text style={[styles.inlineAddText, { color: colors.taskBlue }, !addingText.trim() && { color: colors.textMuted }]}>Add</Text>
                    </TouchableOpacity>
                    <Text style={[styles.inlineDivider, { color: colors.cardBorder }]}>|</Text>
                    <TouchableOpacity 
                      style={styles.inlineCancelBtn}
                      onPress={() => { setAddingTo(null); setAddingText(''); Keyboard.dismiss(); }}
                      hitSlop={{ top: 10, bottom: 10, left: 5, right: 10 }}
                    >
                      <Text style={[styles.inlineCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.addLink} 
                  onPress={() => setAddingTo({ dayKey: day.dateKey, type: 'task' })}
                >
                  <Text style={[styles.addLinkText, { color: colors.taskBlue }]}>+ Add task</Text>
                </TouchableOpacity>
              )}
            </View>
            
            {/* Notes */}
            <View style={styles.typeGroup}>
              <View style={styles.typeLabelRow}>
                <Ionicons name="document-text-outline" size={14} color={colors.notesPurple} />
                <Text style={[styles.typeLabel, { color: colors.notesPurple }]}>Notes</Text>
              </View>
              {notes.map(renderItem)}
              {addingTo?.dayKey === day.dateKey && addingTo?.type === 'note' ? (
                <View ref={inputRowRef} style={styles.inlineInputRow}>
                  <Ionicons name="ellipse" size={10} color={colors.notesPurple} style={{ marginHorizontal: 5 }} />
                  <View style={styles.inputWithCancel}>
                    <TextInput
                      ref={inputRef}
                      style={[styles.inlineInputInner, { color: colors.text }]}
                      value={addingText}
                      onChangeText={setAddingText}
                      placeholder="Enter note..."
                      placeholderTextColor={colors.textSecondary}
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
                      <Text style={[styles.inlineAddText, { color: colors.notesPurple }, !addingText.trim() && { color: colors.textMuted }]}>Add</Text>
                    </TouchableOpacity>
                    <Text style={[styles.inlineDivider, { color: colors.cardBorder }]}>|</Text>
                    <TouchableOpacity 
                      style={styles.inlineCancelBtn}
                      onPress={() => { setAddingTo(null); setAddingText(''); Keyboard.dismiss(); }}
                      hitSlop={{ top: 10, bottom: 10, left: 5, right: 10 }}
                    >
                      <Text style={[styles.inlineCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.addLink} 
                  onPress={() => setAddingTo({ dayKey: day.dateKey, type: 'note' })}
                >
                  <Text style={[styles.addLinkText, { color: colors.notesPurple }]}>+ Add note</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Memos */}
            <View style={styles.typeGroup}>
              <View style={styles.typeLabelRow}>
                <Ionicons name="mic-outline" size={14} color={colors.memoGreen} />
                <Text style={[styles.typeLabel, { color: colors.memoGreen }]}>Memos</Text>
              </View>
              {memos.map(memo => (
                <SwipeableItem
                  key={memo.id}
                  onSwipeLeft={() => handleSwipeArchiveMemo(memo.id)}
                  leftAction={{
                    icon: 'archive-outline',
                    color: '#fff',
                    backgroundColor: colors.error,
                    label: 'Archive',
                  }}
                >
                  <TouchableOpacity
                    style={styles.item}
                    onPress={() => router.push(`/entry/${memo.id}`)}
                  >
                    <Ionicons name="play" size={16} color={colors.memoGreen} />
                    <View style={styles.itemTextWrapper}>
                      <Text style={[styles.itemText, { color: colors.text }]} numberOfLines={1}>
                        {memo.summary || memo.transcript?.slice(0, 50) || 'Voice memo'}
                      </Text>
                    </View>
                    {(memo.taskCount > 0 || memo.noteCount > 0) && (
                      <View style={styles.memoCounts}>
                        {memo.taskCount > 0 && (
                          <View style={[styles.memoCountBadge, { backgroundColor: colors.card }]}>
                            <Ionicons name="checkbox-outline" size={12} color={colors.taskBlue} />
                            <Text style={[styles.memoCountText, { color: colors.textSecondary }]}>{memo.taskCount}</Text>
                          </View>
                        )}
                        {memo.noteCount > 0 && (
                          <View style={[styles.memoCountBadge, { backgroundColor: colors.card }]}>
                            <Ionicons name="ellipse" size={8} color={colors.notesPurple} />
                            <Text style={[styles.memoCountText, { color: colors.textSecondary }]}>{memo.noteCount}</Text>
                          </View>
                        )}
                      </View>
                    )}
                    <View style={styles.detailBtn}>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                </SwipeableItem>
              ))}
              <TouchableOpacity 
                style={styles.addLink} 
                onPress={() => router.push('/record?autoStart=true')}
              >
                <Text style={[styles.addLinkText, { color: colors.memoGreen }]}>+ Add Memo</Text>
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
      style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity style={styles.menuBtn} onPress={toggleDrawer}>
          <Ionicons name="menu" size={24} color={selectedTags.length > 0 ? colors.success : colors.text} />
          {selectedTags.length > 0 && (
            <View style={[styles.menuBadge, { backgroundColor: colors.accent }]}>
              <Text style={[styles.menuBadgeText, { color: isDark ? '#0a0a0a' : '#fff' }]}>{selectedTags.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        
        <Text style={[styles.headerTitle, { color: colors.text }]}>MemoTalk</Text>
        
        <View style={{ flex: 1 }} />
        
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/calendar')}>
          <Ionicons name="calendar-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setIsSortModalVisible(true)}>
          <Ionicons name="swap-vertical" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/search')}>
          <Ionicons name="search" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/(tabs)/settings')}>
          <Ionicons name="person-circle-outline" size={26} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tag Drawer Overlay */}
      <Pressable 
        style={[styles.drawerOverlay, { pointerEvents: isDrawerOpen ? 'auto' : 'none' }]}
        onPress={closeDrawer}
      >
        <Animated.View style={[styles.drawerOverlayBg, { opacity: overlayAnim, backgroundColor: isDark ? '#000' : 'rgba(0,0,0,0.3)' }]} />
      </Pressable>

      {/* Tag Drawer */}
      <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerAnim }], backgroundColor: colors.backgroundSecondary }]}>
        <View style={[styles.drawerContent, { paddingTop: insets.top + 12 }]}>
          <View style={[styles.drawerHeader, { borderBottomColor: colors.cardBorder }]}>
            <Text style={[styles.drawerTitle, { color: colors.text }]}>Filters</Text>
            <TouchableOpacity onPress={closeDrawer}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
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
              style={[styles.drawerTag, selectedTags.length === 0 && { backgroundColor: isDark ? '#1a1a1a' : '#e5e5e5' }]}
              onPress={clearAllFilters}
            >
              <View style={styles.drawerTagLeft}>
                <View style={[styles.drawerTagDot, { backgroundColor: isDark ? '#666' : '#999' }]} />
                <Text style={[styles.drawerTagText, { color: selectedTags.length === 0 ? colors.text : colors.textSecondary }]}>All Items</Text>
              </View>
              <Text style={[styles.drawerTagCount, { color: colors.textSecondary }]}>{allTags.reduce((sum, t) => sum + (tagCounts.get(t) || 0), 0)}</Text>
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
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {allDays.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Add Memo below</Text>
          </View>
        ) : (
          allDays.map((day, index) => renderDaySection(day, false, index === 0))
        )}
        
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sort Options Modal */}
      <Modal
        visible={isSortModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSortModalVisible(false)}
      >
        <Pressable 
          style={[styles.sortModalOverlay, { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.4)' }]}
          onPress={() => setIsSortModalVisible(false)}
        >
          <View style={[styles.sortModalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.sortModalTitle, { color: colors.text }]}>Sort by</Text>
            {SORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.sortOption,
                  sortOption === option.value && { backgroundColor: isDark ? '#0f2f0f' : '#e8f5e8' },
                ]}
                onPress={() => handleSortChange(option.value)}
              >
                <Ionicons 
                  name={option.icon as any} 
                  size={20} 
                  color={sortOption === option.value ? colors.success : colors.textSecondary} 
                />
                <Text style={[
                  styles.sortOptionText,
                  { color: colors.textSecondary },
                  sortOption === option.value && { color: colors.text, fontWeight: '600' },
                ]}>
                  {option.label}
                </Text>
                {sortOption === option.value && (
                  <Ionicons name="checkmark" size={20} color={colors.success} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
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
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
  },
  itemInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
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
    color: '#3b82f6',
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
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  dueDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dueDateBadgeOverdue: {
    // overdue styling handled by text color
  },
  dueDateText: {
    fontSize: 11,
    color: '#666',
  },
  dueDateTextOverdue: {
    color: '#ef4444',
    fontWeight: '600',
  },
  recurringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  recurringText: {
    fontSize: 11,
    fontWeight: '600',
  },
  scheduleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scheduleText: {
    fontSize: 10,
    fontWeight: '500',
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
  // Sort Modal Styles
  sortModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 320,
  },
  sortModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    gap: 12,
  },
  sortOptionActive: {
    backgroundColor: '#0f2f0f',
  },
  sortOptionText: {
    fontSize: 15,
    color: '#888',
    flex: 1,
  },
  sortOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
});
