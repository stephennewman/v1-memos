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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import type { VoiceTodo } from '@/lib/types';

export default function TaskDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [task, setTask] = useState<VoiceTodo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [editedDueDate, setEditedDueDate] = useState('');

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
    } catch (error) {
      console.error('Error loading task:', error);
      Alert.alert('Error', 'Failed to load task');
      router.back();
    } finally {
      setIsLoading(false);
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
        })
        .eq('id', task.id);

      if (error) throw error;
      
      setTask({ ...task, text: editedText, due_date: parsedDate || undefined });
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert('Error', 'Failed to save changes');
    }
  };

  const archiveTask = () => {
    Alert.alert(
      'Archive Task',
      'Are you sure you want to archive this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('voice_todos')
                .update({ is_archived: true })
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
              
              // Create the note
              const { error: noteError } = await supabase
                .from('voice_notes')
                .insert({
                  user_id: taskData.user_id,
                  text: task.text,
                  entry_id: task.entry_id || null,
                  is_archived: false,
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
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const isCompleted = task.status === 'completed';

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Task</Text>
        <TouchableOpacity onPress={archiveTask} style={styles.archiveButton}>
          <Ionicons name="archive-outline" size={22} color="#666" />
        </TouchableOpacity>
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
        {/* Status Toggle */}
        <TouchableOpacity style={styles.statusRow} onPress={toggleStatus}>
          <View style={[styles.checkbox, isCompleted && styles.checkboxChecked]}>
            {isCompleted && <Ionicons name="checkmark" size={18} color="#0a0a0a" />}
          </View>
          <Text style={[styles.statusText, isCompleted && styles.statusTextCompleted]}>
            {isCompleted ? 'Completed' : 'Mark as complete'}
          </Text>
        </TouchableOpacity>

        {/* Task Text */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>TASK</Text>
            {!isEditing && (
              <TouchableOpacity onPress={() => setIsEditing(true)}>
                <Ionicons name="pencil" size={16} color="#666" />
              </TouchableOpacity>
            )}
          </View>
          {isEditing ? (
            <TextInput
              style={styles.textInput}
              value={editedText}
              onChangeText={setEditedText}
              multiline
              placeholder="Enter task..."
              placeholderTextColor="#444"
            />
          ) : (
            <Text style={[styles.taskText, isCompleted && styles.taskTextCompleted]}>
              {task.text}
            </Text>
          )}
        </View>

        {/* Due Date */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>DUE DATE</Text>
            {task.due_date && !isEditing && (
              <TouchableOpacity onPress={clearDueDate}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          {isEditing ? (
            <TextInput
              style={styles.dateInput}
              value={editedDueDate}
              onChangeText={setEditedDueDate}
              placeholder="e.g., December 25, 2025"
              placeholderTextColor="#444"
            />
          ) : (
            <View style={styles.dateRow}>
              <Ionicons 
                name="calendar-outline" 
                size={18} 
                color={task.due_date ? '#c4dfc4' : '#444'} 
              />
              <Text style={[styles.dateText, !task.due_date && styles.dateTextEmpty]}>
                {formatDateDisplay(task.due_date)}
              </Text>
            </View>
          )}
        </View>

        {/* Source Entry */}
        {task.entry_id && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SOURCE</Text>
            <TouchableOpacity 
              style={styles.sourceRow}
              onPress={() => router.push(`/entry/${task.entry_id}`)}
            >
              <Ionicons name="mic" size={18} color="#666" />
              <Text style={styles.sourceText}>View original voice note</Text>
              <Ionicons name="chevron-forward" size={16} color="#444" />
            </TouchableOpacity>
          </View>
        )}

        {/* Metadata */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>INFO</Text>
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

        {/* Convert to Note */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACTIONS</Text>
          <TouchableOpacity style={styles.convertRow} onPress={convertToNote}>
            <Ionicons name="document-text-outline" size={18} color="#a78bfa" />
            <Text style={styles.convertText}>Convert to Note</Text>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </TouchableOpacity>
        </View>

        {/* Edit Actions */}
        {isEditing && (
          <View style={styles.editActions}>
            <TouchableOpacity 
              style={styles.cancelBtn} 
              onPress={() => {
                setIsEditing(false);
                setEditedText(task.text);
                setEditedDueDate(formatDateForInput(task.due_date));
              }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={saveChanges}>
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        )}

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
    color: '#fff',
  },
  archiveButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#444',
    marginRight: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#c4dfc4',
    borderColor: '#c4dfc4',
  },
  statusText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  statusTextCompleted: {
    color: '#c4dfc4',
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
  taskText: {
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
  },
  dateText: {
    fontSize: 16,
    color: '#fff',
  },
  dateTextEmpty: {
    color: '#444',
  },
  dateInput: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
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
    backgroundColor: '#c4dfc4',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#0a0a0a',
    fontSize: 15,
    fontWeight: '600',
  },
});

