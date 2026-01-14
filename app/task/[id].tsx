import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import type { VoiceTodo } from '@/lib/types';
import { getTagColor } from '@/lib/auto-tags';

export default function TaskDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  
  const [task, setTask] = useState<VoiceTodo | null>(null);
  const [relatedTasks, setRelatedTasks] = useState<VoiceTodo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [editedDueDate, setEditedDueDate] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [newTagText, setNewTagText] = useState('');

  useEffect(() => {
    loadTask();
  }, [id]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadTask();
    setIsRefreshing(false);
  };

  const loadTask = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await supabase
        .from('voice_todos')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setTask(data);
      setEditedText(data.text);
      setEditedDueDate(formatDateForInput(data.due_date));
      // Set selected date for date picker
      if (data.due_date) {
        setSelectedDate(new Date(data.due_date));
      } else {
        setSelectedDate(new Date());
      }
      setEditedTags(data.tags || []);
      
      // Find related tasks (similar text, excluding this one)
      await loadRelatedTasks(data);
    } catch (error) {
      console.error('Error loading task:', error);
      Alert.alert('Error', 'Failed to load task');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };
  
  const loadRelatedTasks = async (currentTask: VoiceTodo) => {
    try {
      // Get keywords from the task text (words > 3 chars, lowercase)
      const keywords = currentTask.text
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
        .map(word => word.replace(/[^a-z0-9]/g, ''))
        .filter(word => word.length > 3);
      
      if (keywords.length === 0) {
        setRelatedTasks([]);
        return;
      }
      
      // Query for tasks containing any of these keywords
      const { data: allTasks } = await supabase
        .from('voice_todos')
        .select('*')
        .eq('user_id', currentTask.user_id)
        .neq('id', currentTask.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (!allTasks) {
        setRelatedTasks([]);
        return;
      }
      
      // Score and filter tasks by keyword matches
      const scoredTasks = allTasks.map(task => {
        const taskWords = task.text.toLowerCase().split(/\s+/);
        const matchCount = keywords.filter(keyword => 
          taskWords.some(word => word.includes(keyword) || keyword.includes(word))
        ).length;
        return { task, score: matchCount };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => item.task);
      
      setRelatedTasks(scoredTasks);
    } catch (error) {
      console.error('Error loading related tasks:', error);
      setRelatedTasks([]);
    }
  };

  const formatDateForInput = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return 'No due date';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffMs = dueDate.getTime() - todayStart.getTime();
    const diffDays = Math.round(diffMs / 86400000);

    const formatted = date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    if (diffDays < 0) return `${formatted} (Overdue)`;
    if (diffDays === 0) return `${formatted} (Today)`;
    if (diffDays === 1) return `${formatted} (Tomorrow)`;
    return formatted;
  };

  const toggleStatus = async () => {
    if (!task) return;
    
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    
    try {
      const { error } = await supabase
        .from('voice_todos')
        .update({ 
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', task.id);

      if (error) throw error;
      setTask({ ...task, status: newStatus });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const saveChanges = async () => {
    if (!task) return;
    
    try {
      // Parse the due date
      let parsedDate = null;
      if (editedDueDate.trim()) {
        const date = new Date(editedDueDate);
        if (!isNaN(date.getTime())) {
          date.setUTCHours(12, 0, 0, 0);
          parsedDate = date.toISOString();
        }
      }

      const { error } = await supabase
        .from('voice_todos')
        .update({ 
          text: editedText,
          due_date: parsedDate,
          tags: editedTags,
        })
        .eq('id', task.id);

      if (error) throw error;
      
      setTask({ ...task, text: editedText, due_date: parsedDate || undefined, tags: editedTags });
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert('Error', 'Failed to save changes');
    }
  };

  const archiveTask = () => {
    Alert.alert(
      'Archive Task',
      'This will move the task to archive. You can restore it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('voice_todos')
                .update({ status: 'dismissed' })
                .eq('id', task?.id);

              if (error) throw error;
              router.back();
            } catch (error) {
              console.error('Error archiving:', error);
            }
          },
        },
      ]
    );
  };

  const deleteTaskPermanently = () => {
    Alert.alert(
      'Delete Permanently',
      'This will permanently delete this task. This cannot be undone.',
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
                .eq('id', task?.id);

              if (error) throw error;
              router.back();
            } catch (error) {
              console.error('Error deleting:', error);
            }
          },
        },
      ]
    );
  };

  const clearDueDate = async () => {
    if (!task) return;
    
    try {
      const { error } = await supabase
        .from('voice_todos')
        .update({ due_date: null })
        .eq('id', task.id);

      if (error) throw error;
      setTask({ ...task, due_date: undefined });
      setEditedDueDate('');
    } catch (error) {
      console.error('Error clearing date:', error);
    }
  };

  const saveDueDate = async () => {
    if (!task) return;
    
    try {
      let parsedDate = null;
      if (editedDueDate.trim()) {
        const date = new Date(editedDueDate);
        if (!isNaN(date.getTime())) {
          date.setUTCHours(12, 0, 0, 0);
          parsedDate = date.toISOString();
        }
      }

      const { error } = await supabase
        .from('voice_todos')
        .update({ due_date: parsedDate })
        .eq('id', task.id);

      if (error) throw error;
      setTask({ ...task, due_date: parsedDate || undefined });
      setIsEditingDueDate(false);
    } catch (error) {
      console.error('Error saving due date:', error);
    }
  };

  const handleDateChange = async (event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    
    if (event.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }
    
    if (date && task) {
      setSelectedDate(date);
      
      // Save immediately on date selection
      try {
        const dateToSave = new Date(date);
        dateToSave.setUTCHours(12, 0, 0, 0);
        const parsedDate = dateToSave.toISOString();

        const { error } = await supabase
          .from('voice_todos')
          .update({ due_date: parsedDate })
          .eq('id', task.id);

        if (error) throw error;
        setTask({ ...task, due_date: parsedDate });
        setEditedDueDate(formatDateForInput(parsedDate));
        
        if (Platform.OS === 'ios') {
          // Keep picker open on iOS for potential adjustment
        }
      } catch (error) {
        console.error('Error saving due date:', error);
        Alert.alert('Error', 'Failed to save due date');
      }
    }
  };

  const confirmAndCloseDatePicker = () => {
    setShowDatePicker(false);
  };

  const convertToNote = () => {
    Alert.alert(
      'Convert to Note',
      'This will archive the task and create a note with the same text. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Convert',
          onPress: async () => {
            if (!task) return;
            
            try {
              // Get user_id from the task
              const { data: taskData } = await supabase
                .from('voice_todos')
                .select('user_id')
                .eq('id', task.id)
                .single();
              
              if (!taskData) throw new Error('Task not found');
              
              // Create the note with the same created_at date as the task
              const { error: noteError } = await supabase
                .from('voice_notes')
                .insert({
                  user_id: taskData.user_id,
                  text: task.text,
                  entry_id: task.entry_id || null,
                  is_archived: false,
                  created_at: task.created_at, // Preserve original date
                  tags: task.tags || [],
                });

              if (noteError) throw noteError;

              // Archive the task
              const { error: archiveError } = await supabase
                .from('voice_todos')
                .update({ is_archived: true })
                .eq('id', task.id);

              if (archiveError) throw archiveError;

              Alert.alert('Success', 'Task converted to note');
              router.back();
            } catch (error) {
              console.error('Error converting:', error);
              Alert.alert('Error', 'Failed to convert task');
            }
          },
        },
      ]
    );
  };

  if (isLoading || !task) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
      </View>
    );
  }

  const isCompleted = task.status === 'completed';

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.taskBlue }]}>Task</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={archiveTask} style={styles.actionButton}>
            <Ionicons name="archive-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={deleteTaskPermanently} style={styles.actionButton}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#666"
          />
        }
      >
        {/* Task with Checkbox */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>TASK</Text>
          </View>
          <View style={styles.taskRow}>
            <TouchableOpacity onPress={toggleStatus} style={styles.checkboxContainer}>
              <View style={[styles.checkbox, isCompleted && styles.checkboxChecked]}>
                {isCompleted && <Ionicons name="checkmark" size={18} color="#0a0a0a" />}
              </View>
            </TouchableOpacity>
            {isEditingText ? (
              <TextInput
                style={[styles.textInput, { flex: 1 }]}
                value={editedText}
                onChangeText={setEditedText}
                placeholder="Enter task..."
                placeholderTextColor="#444"
                autoFocus
                returnKeyType="done"
                blurOnSubmit={true}
                onSubmitEditing={() => { saveChanges(); setIsEditingText(false); }}
                onBlur={() => { saveChanges(); setIsEditingText(false); }}
              />
            ) : (
              <TouchableOpacity 
                style={{ flex: 1 }} 
                onPress={() => setIsEditingText(true)}
              >
                <Text style={[styles.taskText, isCompleted && styles.taskTextCompleted]}>
                  {task.text}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tags */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>TAGS</Text>
            {isEditingTags && (
              <TouchableOpacity onPress={() => { saveChanges(); setIsEditingTags(false); }}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
          {isEditingTags ? (
            <View>
              <View style={styles.tagsContainer}>
                {editedTags.map(tag => (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.tagChip, { backgroundColor: `${getTagColor(tag)}30`, borderColor: getTagColor(tag) }]}
                    onPress={() => setEditedTags(editedTags.filter(t => t !== tag))}
                  >
                    <Text style={[styles.tagChipText, { color: getTagColor(tag) }]}>#{tag}</Text>
                    <Ionicons name="close" size={14} color={getTagColor(tag)} />
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.addTagRow}>
                <TextInput
                  style={styles.tagInput}
                  value={newTagText}
                  onChangeText={setNewTagText}
                  placeholder="Add tag..."
                  placeholderTextColor="#444"
                  autoFocus
                  onSubmitEditing={() => {
                    const tag = newTagText.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (tag && !editedTags.includes(tag)) {
                      setEditedTags([...editedTags, tag]);
                    }
                    setNewTagText('');
                  }}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={styles.addTagBtn}
                  onPress={() => {
                    const tag = newTagText.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (tag && !editedTags.includes(tag)) {
                      setEditedTags([...editedTags, tag]);
                    }
                    setNewTagText('');
                  }}
                >
                  <Ionicons name="add" size={20} color="#666" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.tagsContainer}
              onPress={() => setIsEditingTags(true)}
            >
              {task.tags && task.tags.length > 0 ? (
                task.tags.map(tag => (
                  <View
                    key={tag}
                    style={[styles.tagChip, { backgroundColor: `${getTagColor(tag)}20`, borderColor: getTagColor(tag) }]}
                  >
                    <Text style={[styles.tagChipText, { color: getTagColor(tag) }]}>#{tag}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.noTagsText}>Tap to add tags</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Due Date */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>DUE DATE</Text>
            {task.due_date && (
              <TouchableOpacity onPress={clearDueDate}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity 
            style={styles.dateRow}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons 
              name="calendar-outline" 
              size={18} 
              color={task.due_date ? '#3b82f6' : '#444'} 
            />
            <Text style={[styles.dateText, !task.due_date && styles.dateTextEmpty]}>
              {formatDateDisplay(task.due_date)}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#444" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        {/* Date Picker Modal */}
        {Platform.OS === 'ios' ? (
          <Modal
            visible={showDatePicker}
            transparent
            animationType="slide"
          >
            <View style={styles.datePickerModal}>
              <View style={styles.datePickerContainer}>
                <View style={styles.datePickerHeader}>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.datePickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.datePickerTitle}>Select Due Date</Text>
                  <TouchableOpacity onPress={confirmAndCloseDatePicker}>
                    <Text style={styles.datePickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="spinner"
                  onChange={handleDateChange}
                  textColor="#fff"
                  style={styles.datePicker}
                />
              </View>
            </View>
          </Modal>
        ) : (
          showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="default"
              onChange={handleDateChange}
            />
          )
        )}

        {/* Source Entry */}
        {task.entry_id && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>SOURCE</Text>
            </View>
            <TouchableOpacity 
              style={styles.sourceRow}
              onPress={() => router.push(`/entry/${task.entry_id}`)}
            >
              <Ionicons name="play" size={16} color="#22c55e" />
              <Text style={styles.sourceText}>View original memo</Text>
              <Ionicons name="chevron-forward" size={16} color="#444" />
            </TouchableOpacity>
          </View>
        )}

        {/* Metadata */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>INFO</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Created</Text>
            <Text style={styles.metaValue}>
              {new Date(task.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          </View>
          {task.completed_at && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Completed</Text>
              <Text style={styles.metaValue}>
                {new Date(task.completed_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          )}
        </View>

        {/* Related Tasks */}
        {relatedTasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>RELATED TASKS</Text>
              <Text style={styles.relatedCount}>({relatedTasks.length})</Text>
            </View>
            {relatedTasks.map(relatedTask => (
              <TouchableOpacity 
                key={relatedTask.id}
                style={styles.relatedRow}
                onPress={() => router.push(`/task/${relatedTask.id}`)}
              >
                <Ionicons 
                  name={relatedTask.status === 'completed' ? 'checkbox' : 'square-outline'} 
                  size={16} 
                  color={relatedTask.status === 'completed' ? '#4ade80' : '#666'} 
                />
                <Text 
                  style={[
                    styles.relatedText,
                    relatedTask.status === 'completed' && styles.relatedTextCompleted
                  ]}
                  numberOfLines={1}
                >
                  {relatedTask.text}
                </Text>
                <Text style={styles.relatedDate}>
                  {new Date(relatedTask.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>ACTIONS</Text>
          </View>
          <TouchableOpacity style={styles.convertRow} onPress={convertToNote}>
            <Ionicons name="document-text-outline" size={18} color="#a78bfa" />
            <Text style={styles.convertText}>Convert to Note</Text>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
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
  loadingText: {
    color: '#666',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#3b82f6',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkboxContainer: {
    paddingTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 1,
  },
  clearText: {
    fontSize: 13,
    color: '#ef4444',
  },
  doneText: {
    fontSize: 13,
    color: '#3b82f6',
  },
  taskText: {
    flex: 1,
    fontSize: 18,
    color: '#fff',
    lineHeight: 26,
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  textInput: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 80,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  dateText: {
    fontSize: 16,
    color: '#fff',
    flex: 1,
  },
  dateTextEmpty: {
    color: '#444',
  },
  dueDateEditRow: {
    gap: 10,
  },
  dateInput: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  dueDateActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  dueDateCancelBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueDateSaveBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  sourceText: {
    flex: 1,
    fontSize: 15,
    color: '#888',
  },
  convertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  convertText: {
    flex: 1,
    fontSize: 15,
    color: '#a78bfa',
  },
  relatedCount: {
    fontSize: 12,
    color: '#666',
  },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  relatedText: {
    flex: 1,
    fontSize: 14,
    color: '#888',
  },
  relatedTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#555',
  },
  relatedDate: {
    fontSize: 12,
    color: '#555',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  metaLabel: {
    fontSize: 14,
    color: '#666',
  },
  metaValue: {
    fontSize: 14,
    color: '#888',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  noTagsText: {
    fontSize: 14,
    color: '#444',
  },
  addTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  tagInput: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  addTagBtn: {
    width: 40,
    height: 40,
    backgroundColor: '#111',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  datePickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  datePickerContainer: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  datePickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  datePickerCancel: {
    fontSize: 16,
    color: '#888',
  },
  datePickerDone: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  datePicker: {
    height: 200,
  },
});

