import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  TextInput,
  Keyboard,
  FlatList,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TabHeader } from '@/components/TabHeader';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HOUR_HEIGHT = 72;
const START_HOUR = 6; // 6 AM
const END_HOUR = 23; // 11 PM

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
  items: TimelineItem[];
}

const getDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDayLabel = (date: Date) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - itemDate.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatHour = (hour: number) => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
};

const getCurrentHour = () => new Date().getHours();

// Hour Block Component
const HourBlock = ({
  hour,
  items,
  isCurrentHour,
  onAddItem,
  onToggleTask,
  onItemPress,
}: {
  hour: number;
  items: TimelineItem[];
  isCurrentHour: boolean;
  onAddItem: (hour: number, type: 'task' | 'note') => void;
  onToggleTask: (item: TimelineItem) => void;
  onItemPress: (item: TimelineItem) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasItems = items.length > 0;

  return (
    <View style={[styles.hourBlock, isCurrentHour && styles.currentHourBlock]}>
      {/* Hour Label */}
      <View style={styles.hourLabelContainer}>
        <Text style={[styles.hourLabel, isCurrentHour && styles.currentHourLabel]}>
          {formatHour(hour)}
        </Text>
        {isCurrentHour && <View style={styles.nowDot} />}
      </View>

      {/* Content Area */}
      <TouchableOpacity 
        style={styles.hourContent}
        onPress={() => !hasItems && setIsExpanded(!isExpanded)}
        activeOpacity={hasItems ? 1 : 0.7}
      >
        {/* Items in this hour */}
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

        {/* Empty state - tap to add */}
        {!hasItems && !isExpanded && (
          <Text style={styles.emptyHourText}>Tap to add</Text>
        )}

        {/* Expanded add options */}
        {!hasItems && isExpanded && (
          <View style={styles.addOptions}>
            <TouchableOpacity 
              style={styles.addOption}
              onPress={() => {
                setIsExpanded(false);
                onAddItem(hour, 'task');
              }}
            >
              <Ionicons name="checkbox-outline" size={18} color="#c4dfc4" />
              <Text style={styles.addOptionText}>Task</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.addOption}
              onPress={() => {
                setIsExpanded(false);
                onAddItem(hour, 'note');
              }}
            >
              <Ionicons name="document-text-outline" size={18} color="#93c5fd" />
              <Text style={styles.addOptionText}>Note</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

// Add Item Modal
const AddItemSheet = ({
  visible,
  hour,
  type,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  hour: number;
  type: 'task' | 'note';
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) => {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  if (!visible) return null;

  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
      setText('');
    }
  };

  return (
    <View style={styles.addSheet}>
      <View style={styles.addSheetHeader}>
        <Text style={styles.addSheetTitle}>
          Add {type} for {formatHour(hour)}
        </Text>
        <TouchableOpacity onPress={onCancel}>
          <Ionicons name="close" size={24} color="#666" />
        </TouchableOpacity>
      </View>
      <View style={styles.addSheetInput}>
        <Ionicons 
          name={type === 'task' ? 'checkbox-outline' : 'document-text-outline'} 
          size={20} 
          color={type === 'task' ? '#c4dfc4' : '#93c5fd'} 
        />
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={type === 'task' ? 'What needs to be done?' : 'What\'s on your mind?'}
          placeholderTextColor="#555"
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSubmit}
          returnKeyType="done"
          autoFocus
        />
      </View>
      <TouchableOpacity 
        style={[styles.addSheetButton, !text.trim() && styles.addSheetButtonDisabled]}
        onPress={handleSubmit}
        disabled={!text.trim()}
      >
        <Text style={styles.addSheetButtonText}>Add {type}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [days, setDays] = useState<DayData[]>([]);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Add item state
  const [addingItem, setAddingItem] = useState<{ hour: number; type: 'task' | 'note' } | null>(null);

  // Initialize days (today + last 30 days)
  const initializeDays = useCallback(() => {
    const daysArray: DayData[] = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      daysArray.push({
        date,
        dateKey: getDateKey(date),
        items: [],
      });
    }
    return daysArray;
  }, []);

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
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

      // Build days with items
      const daysArray = initializeDays();
      const dayMap = new Map<string, DayData>();
      daysArray.forEach(d => dayMap.set(d.dateKey, d));

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

      setDays(daysArray);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, initializeDays]);

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
      const scrollPosition = Math.max(0, (currentHour - START_HOUR - 2) * HOUR_HEIGHT);
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: scrollPosition, animated: false });
      }, 100);
    }
  }, [isLoading]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  const handleAddItem = useCallback((hour: number, type: 'task' | 'note') => {
    setAddingItem({ hour, type });
  }, []);

  const handleSubmitItem = useCallback(async (text: string) => {
    if (!user || !addingItem) return;

    const { hour, type } = addingItem;
    
    // Create date for this hour
    const itemDate = new Date(days[currentDayIndex].date);
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
          if (idx === currentDayIndex) {
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
          if (idx === currentDayIndex) {
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

    setAddingItem(null);
    Keyboard.dismiss();
  }, [user, addingItem, days, currentDayIndex]);

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

  const renderDay = ({ item: day, index }: { item: DayData; index: number }) => {
    const currentHour = index === 0 ? getCurrentHour() : -1;
    const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

    return (
      <View style={styles.dayPage}>
        <ScrollView
          ref={index === currentDayIndex ? scrollViewRef : undefined}
          style={styles.hoursScroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#c4dfc4"
            />
          }
        >
          {hours.map(hour => {
            const hourItems = day.items.filter(i => i.hour === hour);
            return (
              <HourBlock
                key={hour}
                hour={hour}
                items={hourItems}
                isCurrentHour={hour === currentHour}
                onAddItem={handleAddItem}
                onToggleTask={handleToggleTask}
                onItemPress={handleItemPress}
              />
            );
          })}
          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    );
  };

  if (isLoading || authLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  const currentDay = days[currentDayIndex];

  return (
    <View style={styles.container}>
      {/* Day Header - shows current day label */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.dayNav}
          onPress={() => {
            if (currentDayIndex < days.length - 1) {
              flatListRef.current?.scrollToIndex({ index: currentDayIndex + 1, animated: true });
            }
          }}
          disabled={currentDayIndex >= days.length - 1}
        >
          <Ionicons 
            name="chevron-back" 
            size={24} 
            color={currentDayIndex < days.length - 1 ? '#fff' : '#333'} 
          />
        </TouchableOpacity>
        
        <View style={styles.dayTitleContainer}>
          <Text style={styles.dayTitle}>{currentDay ? formatDayLabel(currentDay.date) : 'Today'}</Text>
          <Text style={styles.daySubtitle}>
            {currentDay?.date.toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'long', 
              day: 'numeric' 
            })}
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.dayNav}
          onPress={() => {
            if (currentDayIndex > 0) {
              flatListRef.current?.scrollToIndex({ index: currentDayIndex - 1, animated: true });
            }
          }}
          disabled={currentDayIndex === 0}
        >
          <Ionicons 
            name="chevron-forward" 
            size={24} 
            color={currentDayIndex > 0 ? '#fff' : '#333'} 
          />
        </TouchableOpacity>
      </View>

      {/* Horizontal Day Pager */}
      <FlatList
        ref={flatListRef}
        data={days}
        renderItem={renderDay}
        keyExtractor={(item) => item.dateKey}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        inverted // So swiping left goes to yesterday
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentDayIndex(index);
        }}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        initialScrollIndex={0}
      />

      {/* Add Item Sheet */}
      {addingItem && (
        <AddItemSheet
          visible={true}
          hour={addingItem.hour}
          type={addingItem.type}
          onSubmit={handleSubmitItem}
          onCancel={() => {
            setAddingItem(null);
            Keyboard.dismiss();
          }}
        />
      )}
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
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  dayNav: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayTitleContainer: {
    alignItems: 'center',
  },
  dayTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  daySubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  dayPage: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  hoursScroll: {
    flex: 1,
  },
  hourBlock: {
    flexDirection: 'row',
    minHeight: HOUR_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  currentHourBlock: {
    backgroundColor: 'rgba(196, 223, 196, 0.05)',
  },
  hourLabelContainer: {
    width: 70,
    paddingTop: 12,
    paddingLeft: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  hourLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#555',
  },
  currentHourLabel: {
    color: '#c4dfc4',
    fontWeight: '700',
  },
  nowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#c4dfc4',
    marginTop: 4,
  },
  hourContent: {
    flex: 1,
    paddingVertical: 10,
    paddingRight: 16,
    justifyContent: 'center',
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    color: '#ddd',
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#555',
  },
  emptyHourText: {
    fontSize: 13,
    color: '#333',
    fontStyle: 'italic',
  },
  addOptions: {
    flexDirection: 'row',
    gap: 16,
  },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#111',
    borderRadius: 8,
  },
  addOptionText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
  addSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: '#222',
  },
  addSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addSheetTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  addSheetInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  addSheetButton: {
    backgroundColor: '#c4dfc4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addSheetButtonDisabled: {
    opacity: 0.5,
  },
  addSheetButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0a0a0a',
  },
});
