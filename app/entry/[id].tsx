import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import type { VoiceEntry, VoiceTodo, VoiceNote as VoiceNoteType } from '@/lib/types';
import { getTagColor } from '@/lib/auto-tags';
import { ModernLoader } from '@/components/ModernLoader';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://www.outcomeview.com';

interface RelatedNote {
  id: string;
  title: string;
  created_at: string;
  shared_people: string[];
}

export default function EntryDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [entry, setEntry] = useState<VoiceEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  // Tasks and Notes from database
  const [tasks, setTasks] = useState<VoiceTodo[]>([]);
  const [notes, setNotes] = useState<VoiceNoteType[]>([]);

  // Editing states
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [editedTranscript, setEditedTranscript] = useState('');
  const [newTaskText, setNewTaskText] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [newTagText, setNewTagText] = useState('');

  // Related notes
  const [relatedNotes, setRelatedNotes] = useState<RelatedNote[]>([]);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);

  // Polling for processing updates
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Input refs for continuous entry
  const taskInputRef = useRef<TextInput>(null);
  const noteInputRef = useRef<TextInput>(null);

  const loadRelatedNotes = useCallback(async () => {
    if (!id || !user) return;

    setIsLoadingRelated(true);
    try {
      const response = await fetch(
        `${API_URL}/api/voice/related?entry_id=${id}&user_id=${user.id}&limit=5`
      );
      if (response.ok) {
        const data = await response.json();
        setRelatedNotes(data.related || []);
      }
    } catch (error) {
      console.error('Error loading related notes:', error);
    } finally {
      setIsLoadingRelated(false);
    }
  }, [id, user]);

  useEffect(() => {
    loadEntry();
    loadTasksAndNotes();
    return () => {
      if (sound) sound.unloadAsync();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [id]);

  // Load related notes once entry is processed
  // Also do a few extra polls to catch any late-arriving tasks
  useEffect(() => {
    if (entry?.is_processed) {
      loadRelatedNotes();
      loadTasksAndNotes();
      
      // Do a few more polls after processing to ensure tasks are loaded
      // This handles race conditions where DB writes haven't propagated yet
      const poll1 = setTimeout(() => loadTasksAndNotes(), 500);
      const poll2 = setTimeout(() => loadTasksAndNotes(), 1500);
      const poll3 = setTimeout(() => loadTasksAndNotes(), 3000);
      
      return () => {
        clearTimeout(poll1);
        clearTimeout(poll2);
        clearTimeout(poll3);
      };
    }
  }, [entry?.is_processed, loadRelatedNotes]);

  // Start polling if entry is not processed - poll fast (1 second)
  useEffect(() => {
    if (entry && !entry.is_processed) {
      pollIntervalRef.current = setInterval(() => {
        loadEntry();
        loadTasksAndNotes();
      }, 1000); // Poll every 1 second for faster updates
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, [entry?.is_processed]);

  const loadTasksAndNotes = async () => {
    if (!id) return;

    try {
      // Load tasks from voice_todos
      const { data: tasksData } = await supabase
        .from('voice_todos')
        .select('*')
        .eq('entry_id', id)
        .order('created_at', { ascending: true });

      if (tasksData) setTasks(tasksData);

      // Load notes from voice_notes
      const { data: notesData } = await supabase
        .from('voice_notes')
        .select('*')
        .eq('entry_id', id)
        .eq('is_archived', false)
        .order('created_at', { ascending: true });

      if (notesData) setNotes(notesData);
    } catch (error) {
      console.error('Error loading tasks/notes:', error);
    }
  };

  const loadEntry = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from('voice_entries')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setEntry(data);
      setEditedSummary(data.summary || '');
      setEditedTranscript(data.transcript || '');
      setEditedTags(data.tags || []);
    } catch (error) {
      console.error('Error loading entry:', error);
      if (isLoading) {
        Alert.alert('Error', 'Failed to load entry');
        router.back();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadEntry();
    await loadTasksAndNotes();
    await loadRelatedNotes();
    setIsRefreshing(false);
  };

  const playAudio = async () => {
    if (!entry?.audio_url) return;

    try {
      if (sound) {
        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
          return;
        }
        if (status.isLoaded) {
          await sound.playAsync();
          setIsPlaying(true);
          return;
        }
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: entry.audio_url },
        { shouldPlay: true }
      );

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });

      setSound(newSound);
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  const archiveEntry = () => {
    Alert.alert(
      'Archive Memo',
      'This will move the memo to archive. You can restore it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            try {
              await supabase.from('voice_entries').update({ is_archived: true }).eq('id', entry?.id);
              router.back();
            } catch (error) {
              console.error('Error archiving entry:', error);
            }
          },
        },
      ]
    );
  };

  const deleteEntryPermanently = () => {
    Alert.alert(
      'Delete Permanently',
      'This will permanently delete this memo and all associated tasks and notes. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete associated tasks and notes first
              await supabase.from('voice_todos').delete().eq('entry_id', entry?.id);
              await supabase.from('voice_notes').delete().eq('entry_id', entry?.id);
              // Then delete the entry
              await supabase.from('voice_entries').delete().eq('id', entry?.id);
              router.back();
            } catch (error) {
              console.error('Error deleting entry:', error);
            }
          },
        },
      ]
    );
  };

  const reprocessEntry = async () => {
    if (!entry || !user || isReprocessing) return;

    Alert.alert(
      'Reprocess Entry',
      'This will re-analyze your recording with the latest AI models to extract updated insights, tasks, and analytics.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reprocess',
          onPress: async () => {
            setIsReprocessing(true);
            try {
              // Mark as not processed to show loading states
              await supabase
                .from('voice_entries')
                .update({ is_processed: false })
                .eq('id', entry.id);

              // Get session for auth
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) throw new Error('No session');

              // Call transcribe endpoint which will re-run extraction
              const response = await fetch(`${API_URL}/api/voice/transcribe`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  entry_id: entry.id,
                  audio_url: entry.audio_url,
                }),
              });

              if (!response.ok) {
                throw new Error('Failed to reprocess');
              }

              // Reload entry to get updated data
              await loadEntry();
              await loadRelatedNotes();

              Alert.alert('Success', 'Entry has been reprocessed with latest AI models');
            } catch (error) {
              console.error('Error reprocessing:', error);
              Alert.alert('Error', 'Failed to reprocess entry');
            } finally {
              setIsReprocessing(false);
            }
          },
        },
      ]
    );
  };

  const saveSummary = async () => {
    if (!entry) return;
    try {
      await supabase
        .from('voice_entries')
        .update({ summary: editedSummary })
        .eq('id', entry.id);
      setEntry({ ...entry, summary: editedSummary });
      setIsEditingSummary(false);
    } catch (error) {
      console.error('Error saving summary:', error);
    }
  };

  const saveTranscript = async () => {
    if (!entry) return;
    try {
      await supabase
        .from('voice_entries')
        .update({ transcript: editedTranscript })
        .eq('id', entry.id);
      setEntry({ ...entry, transcript: editedTranscript });
      setIsEditingTranscript(false);
    } catch (error) {
      console.error('Error saving transcript:', error);
    }
  };

  const saveTags = async () => {
    if (!entry) return;
    try {
      await supabase
        .from('voice_entries')
        .update({ tags: editedTags })
        .eq('id', entry.id);
      setEntry({ ...entry, tags: editedTags });
      setIsEditingTags(false);
    } catch (error) {
      console.error('Error saving tags:', error);
    }
  };

  const addTask = async () => {
    if (!entry || !user || !newTaskText.trim()) return;

    try {
      const { data, error } = await supabase
        .from('voice_todos')
        .insert({
          user_id: user.id,
          entry_id: entry.id,
          text: newTaskText.trim(),
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      if (data) setTasks([...tasks, data]);
      setNewTaskText('');

      // Keep focus on input for continuous task entry
      setTimeout(() => {
        taskInputRef.current?.focus();
      }, 50);
    } catch (error) {
      console.error('Error adding task:', error);
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('voice_todos')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const toggleTask = async (task: VoiceTodo) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    
    // Optimistic update
    setTasks(tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    
    try {
      const { error } = await supabase
        .from('voice_todos')
        .update({ status: newStatus })
        .eq('id', task.id);

      if (error) {
        // Revert on error
        setTasks(tasks.map(t => t.id === task.id ? { ...t, status: task.status } : t));
      }
    } catch (error) {
      console.error('Error toggling task:', error);
      // Revert on error
      setTasks(tasks.map(t => t.id === task.id ? { ...t, status: task.status } : t));
    }
  };

  const addNote = async () => {
    if (!entry || !user || !newNoteText.trim()) return;

    try {
      const { data, error } = await supabase
        .from('voice_notes')
        .insert({
          user_id: user.id,
          entry_id: entry.id,
          text: newNoteText.trim(),
          is_archived: false,
        })
        .select()
        .single();

      if (error) throw error;
      if (data) setNotes([...notes, data]);
      setNewNoteText('');

      // Keep focus on input for continuous note entry
      setTimeout(() => {
        noteInputRef.current?.focus();
      }, 50);
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from('voice_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      setNotes(notes.filter(n => n.id !== noteId));
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>Entry not found</Text>
      </View>
    );
  }

  const isProcessing = !entry.is_processed;
  const todoCount = tasks.length;
  const noteCount = notes.length;
  const peopleList = entry.extracted_people || [];

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
        <Text style={[styles.headerTitle, { color: colors.memoGreen }]}>Memo</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={archiveEntry} style={styles.actionButton}>
            <Ionicons name="archive-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={deleteEntryPermanently} style={styles.actionButton}>
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
            tintColor={colors.textSecondary}
          />
        }
      >
        {/* Date */}
        <Text style={[styles.date, { color: colors.textSecondary }]}>{formatDate(entry.created_at)}</Text>

        {/* Audio Player */}
        {entry.audio_url && (
          <View style={[styles.audioPlayer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <TouchableOpacity onPress={playAudio} style={[styles.playButton, { backgroundColor: colors.accent }]}>
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={24}
                color={isDark ? '#0a0a0a' : '#fff'}
              />
            </TouchableOpacity>
            <View style={styles.audioInfo}>
              <Text style={[styles.audioLabel, { color: colors.text }]}>
                {isPlaying ? 'Playing...' : 'Voice Recording'}
              </Text>
              <Text style={[styles.audioDuration, { color: colors.textSecondary }]}>
                {formatDuration(entry.audio_duration_seconds)}
              </Text>
            </View>
          </View>
        )}

        {/* Summary Section - show inline loading when processing */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SUMMARY</Text>
              {(isProcessing && !entry.summary) && (
                <View style={styles.inlineLoading}>
                  <ModernLoader size="small" color={colors.accent} />
                  <Text style={[styles.inlineLoadingText, { color: colors.accent }]}>Generating...</Text>
                </View>
              )}
            </View>
            {entry.summary && !isEditingSummary && (
              <TouchableOpacity onPress={() => setIsEditingSummary(true)}>
                <Ionicons name="pencil" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {(isProcessing && !entry.summary) ? (
            <View style={[styles.skeleton, { backgroundColor: colors.cardBorder }]} />
          ) : isEditingSummary ? (
            <View>
              <TextInput
                style={[styles.editInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.cardBorder }]}
                value={editedSummary}
                onChangeText={setEditedSummary}
                placeholder="Enter summary..."
                placeholderTextColor={colors.textMuted}
                multiline
              />
              <View style={styles.editActions}>
                <TouchableOpacity onPress={() => setIsEditingSummary(false)} style={styles.cancelBtn}>
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveSummary} style={[styles.saveBtn, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.saveBtnText, { color: isDark ? '#0a0a0a' : '#fff' }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={[styles.summaryText, { color: colors.text }]}>
              {entry.summary || 'No summary yet'}
            </Text>
          )}
        </View>

        {/* Tags Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>TAGS</Text>
            {!isProcessing && !isEditingTags && (
              <TouchableOpacity onPress={() => setIsEditingTags(true)}>
                <Ionicons name="pencil" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {isProcessing ? (
            <View style={styles.peopleSkeleton}>
              <View style={[styles.skeletonBadge, { backgroundColor: colors.cardBorder }]} />
              <View style={[styles.skeletonBadge, { backgroundColor: colors.cardBorder }]} />
            </View>
          ) : isEditingTags ? (
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
                  style={[styles.tagInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.cardBorder }]}
                  value={newTagText}
                  onChangeText={setNewTagText}
                  placeholder="Add tag..."
                  placeholderTextColor={colors.textMuted}
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
                  style={[styles.addTagBtn, { backgroundColor: colors.accent }]}
                  onPress={() => {
                    const tag = newTagText.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (tag && !editedTags.includes(tag)) {
                      setEditedTags([...editedTags, tag]);
                    }
                    setNewTagText('');
                  }}
                >
                  <Ionicons name="add" size={20} color={isDark ? '#0a0a0a' : '#fff'} />
                </TouchableOpacity>
              </View>
              <View style={styles.editActions}>
                <TouchableOpacity onPress={() => { setIsEditingTags(false); setEditedTags(entry.tags || []); }} style={styles.cancelBtn}>
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveTags} style={[styles.saveBtn, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.saveBtnText, { color: isDark ? '#0a0a0a' : '#fff' }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.tagsContainer}>
              {entry.tags && entry.tags.length > 0 ? (
                entry.tags.map(tag => (
                  <View
                    key={tag}
                    style={[styles.tagChip, { backgroundColor: `${getTagColor(tag)}20`, borderColor: getTagColor(tag) }]}
                  >
                    <Text style={[styles.tagChipText, { color: getTagColor(tag) }]}>#{tag}</Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.noTagsText, { color: colors.textMuted }]}>No tags</Text>
              )}
            </View>
          )}
        </View>

        {/* Transcript Section - show inline loading when processing */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>TRANSCRIPT</Text>
              {(isProcessing && !entry.transcript) && (
                <View style={styles.inlineLoading}>
                  <ModernLoader size="small" color={colors.accent} />
                  <Text style={[styles.inlineLoadingText, { color: colors.accent }]}>Transcribing...</Text>
                </View>
              )}
            </View>
            {entry.transcript && !isEditingTranscript && (
              <TouchableOpacity onPress={() => setIsEditingTranscript(true)}>
                <Ionicons name="pencil" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          {(isProcessing && !entry.transcript) ? (
            <>
              <View style={[styles.skeleton, { backgroundColor: colors.cardBorder }]} />
              <View style={[styles.skeleton, { width: '80%', marginTop: 8, backgroundColor: colors.cardBorder }]} />
              <View style={[styles.skeleton, { width: '60%', marginTop: 8, backgroundColor: colors.cardBorder }]} />
            </>
          ) : isEditingTranscript ? (
            <View>
              <TextInput
                style={[styles.editInput, { minHeight: 100, backgroundColor: colors.card, color: colors.text, borderColor: colors.cardBorder }]}
                value={editedTranscript}
                onChangeText={setEditedTranscript}
                placeholder="Enter transcript..."
                placeholderTextColor={colors.textMuted}
                multiline
              />
              <View style={styles.editActions}>
                <TouchableOpacity onPress={() => setIsEditingTranscript(false)} style={styles.cancelBtn}>
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveTranscript} style={[styles.saveBtn, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.saveBtnText, { color: isDark ? '#0a0a0a' : '#fff' }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={[styles.transcriptText, { color: colors.textSecondary }]}>
              {entry.transcript || 'No transcript yet'}
            </Text>
          )}
        </View>

        {/* Tasks Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>TASKS ({todoCount})</Text>
              {(isProcessing && tasks.length === 0) && (
                <View style={styles.inlineLoading}>
                  <ModernLoader size="small" color={colors.accent} />
                  <Text style={[styles.inlineLoadingText, { color: colors.accent }]}>Extracting...</Text>
                </View>
              )}
            </View>
          </View>

          {(isProcessing && tasks.length === 0) ? (
            <>
              <View style={[styles.skeletonTask, { backgroundColor: colors.cardBorder }]} />
              <View style={[styles.skeletonTask, { backgroundColor: colors.cardBorder }]} />
            </>
          ) : (
            <>
              {tasks.map((task) => (
                <View key={task.id} style={[styles.taskItem, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <TouchableOpacity 
                    onPress={() => toggleTask(task)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={task.status === 'completed' ? "checkbox" : "square-outline"}
                      size={20}
                      color={task.status === 'completed' ? colors.taskBlue : colors.textSecondary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.taskContent}
                    onPress={() => router.push(`/task/${task.id}`)}
                  >
                    <Text style={[
                      styles.taskText,
                      { color: colors.text },
                      task.status === 'completed' && styles.taskTextCompleted
                    ]}>{task.text}</Text>
                    {task.due_date && (
                      <Text style={[styles.taskDue, { color: colors.textSecondary }]}>
                        Due: {new Date(task.due_date).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric'
                        })}
                      </Text>
                    )}
                  </TouchableOpacity>
                  {task.tags && task.tags.length > 0 && (
                    <View style={styles.itemTagsRow}>
                      {task.tags.slice(0, 2).map(tag => (
                        <View 
                          key={tag}
                          style={[styles.itemTag, { backgroundColor: `${getTagColor(tag)}20` }]}
                        >
                          <Text style={[styles.itemTagText, { color: getTagColor(tag) }]}>#{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => deleteTask(task.id)}
                    style={styles.deleteTaskBtn}
                  >
                    <Ionicons name="close" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add Task Input */}
              <View style={styles.addTaskContainer}>
                <TextInput
                  ref={taskInputRef}
                  style={[styles.addTaskInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.cardBorder }]}
                  value={newTaskText}
                  onChangeText={setNewTaskText}
                  placeholder="Add a task..."
                  placeholderTextColor={colors.textMuted}
                  onSubmitEditing={addTask}
                  returnKeyType="next"
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  onPress={addTask}
                  style={[styles.addTaskBtn, { backgroundColor: colors.accent }, !newTaskText.trim() && { backgroundColor: colors.cardBorder }]}
                  disabled={!newTaskText.trim()}
                >
                  <Ionicons name="add" size={20} color={newTaskText.trim() ? (isDark ? '#0a0a0a' : '#fff') : colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Notes Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>NOTES ({noteCount})</Text>
              {(isProcessing && notes.length === 0) && (
                <View style={styles.inlineLoading}>
                  <ModernLoader size="small" color={colors.accent} />
                  <Text style={[styles.inlineLoadingText, { color: colors.accent }]}>Extracting...</Text>
                </View>
              )}
            </View>
          </View>

          {(isProcessing && notes.length === 0) ? (
            <>
              <View style={[styles.skeletonNote, { backgroundColor: colors.cardBorder }]} />
              <View style={[styles.skeletonNote, { backgroundColor: colors.cardBorder }]} />
            </>
          ) : (
            <>
              {notes.map((note) => (
                <TouchableOpacity
                  key={note.id}
                  style={[styles.noteItem, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                  onPress={() => router.push(`/note/${note.id}`)}
                >
                  <Ionicons name="ellipse" size={10} color={colors.notesPurple} style={{ marginHorizontal: 3 }} />
                  <Text style={[styles.noteText, { color: colors.text }]} numberOfLines={2}>{note.text}</Text>
                  {note.tags && note.tags.length > 0 && (
                    <View style={styles.itemTagsRow}>
                      {note.tags.slice(0, 2).map(tag => (
                        <View 
                          key={tag}
                          style={[styles.itemTag, { backgroundColor: `${getTagColor(tag)}20` }]}
                        >
                          <Text style={[styles.itemTagText, { color: getTagColor(tag) }]}>#{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                    style={styles.deleteTaskBtn}
                  >
                    <Ionicons name="close" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}

              {/* Add Note Input */}
              <View style={styles.addTaskContainer}>
                <TextInput
                  ref={noteInputRef}
                  style={[styles.addTaskInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.cardBorder }]}
                  value={newNoteText}
                  onChangeText={setNewNoteText}
                  placeholder="Add a note..."
                  placeholderTextColor={colors.textMuted}
                  onSubmitEditing={addNote}
                  returnKeyType="next"
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  onPress={addNote}
                  style={[styles.addTaskBtn, { backgroundColor: colors.accent }, !newNoteText.trim() && { backgroundColor: colors.cardBorder }]}
                  disabled={!newNoteText.trim()}
                >
                  <Ionicons name="add" size={20} color={newNoteText.trim() ? (isDark ? '#0a0a0a' : '#fff') : colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* People Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PEOPLE ({isProcessing ? '...' : peopleList.length})</Text>
          </View>

          {isProcessing ? (
            <View style={styles.peopleSkeleton}>
              <View style={[styles.skeletonBadge, { backgroundColor: colors.cardBorder }]} />
              <View style={[styles.skeletonBadge, { backgroundColor: colors.cardBorder }]} />
            </View>
          ) : peopleList.length > 0 ? (
            <View style={styles.peopleContainer}>
              {peopleList.map((person, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.personTag, { backgroundColor: colors.card }]}
                  onPress={() => router.push(`/person/${encodeURIComponent(person)}`)}
                >
                  <Ionicons name="person" size={12} color={colors.accent} />
                  <Text style={[styles.personTagText, { color: colors.textSecondary }]}>{person}</Text>
                  <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={[styles.noPeopleText, { color: colors.textMuted }]}>No people mentioned</Text>
          )}
        </View>

        {/* Related Notes Section */}
        {!isProcessing && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>RELATED NOTES</Text>
            </View>

            {isLoadingRelated ? (
              <View style={styles.relatedSkeleton}>
                <View style={[styles.skeletonNote, { backgroundColor: colors.cardBorder }]} />
                <View style={[styles.skeletonNote, { backgroundColor: colors.cardBorder }]} />
              </View>
            ) : relatedNotes.length > 0 ? (
              <View style={styles.relatedList}>
                {relatedNotes.map((note) => (
                  <TouchableOpacity
                    key={note.id}
                    style={[styles.relatedItem, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                    onPress={() => router.push(`/entry/${note.id}`)}
                  >
                    <View style={[styles.relatedIcon, { backgroundColor: isDark ? '#a78bfa15' : '#a78bfa20' }]}>
                      <Ionicons name="link" size={16} color={colors.notesPurple} />
                    </View>
                    <View style={styles.relatedContent}>
                      <Text style={[styles.relatedTitle, { color: colors.text }]} numberOfLines={1}>
                        {note.title}
                      </Text>
                      {note.shared_people.length > 0 && (
                        <Text style={[styles.relatedPeople, { color: colors.textSecondary }]}>
                          Mentions: {note.shared_people.join(', ')}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={[styles.noRelatedText, { color: colors.textMuted }]}>No related notes found</Text>
            )}
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
  errorText: {
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
    color: '#22c55e',
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
  date: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  audioPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#c4dfc4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  audioInfo: {
    flex: 1,
  },
  audioLabel: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '500',
  },
  audioDuration: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 28,
  },
  transcriptText: {
    fontSize: 15,
    color: '#aaa',
    lineHeight: 24,
  },
  skeleton: {
    height: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    width: '100%',
  },
  skeletonTask: {
    height: 56,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    marginBottom: 8,
  },
  skeletonBadge: {
    height: 28,
    width: 80,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
  },
  skeletonNote: {
    height: 44,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    marginBottom: 8,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    gap: 10,
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  itemTagsRow: {
    flexDirection: 'row',
    gap: 4,
    marginRight: 8,
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
  noNotesText: {
    fontSize: 14,
    color: '#444',
  },
  editInput: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: '#666',
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: '#c4dfc4',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
  },
  saveBtnText: {
    color: '#0a0a0a',
    fontSize: 14,
    fontWeight: '600',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  taskContent: {
    flex: 1,
    marginLeft: 12,
  },
  taskText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 20,
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#3b82f6',
  },
  taskDue: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  deleteTaskBtn: {
    padding: 4,
  },
  addTaskContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  addTaskInput: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  addTaskBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#c4dfc4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addTaskBtnDisabled: {
    backgroundColor: '#222',
  },
  peopleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  peopleSkeleton: {
    flexDirection: 'row',
    gap: 8,
  },
  personTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  personTagText: {
    fontSize: 13,
    color: '#aaa',
  },
  noPeopleText: {
    fontSize: 14,
    color: '#444',
  },
  relatedSkeleton: {
    gap: 8,
  },
  relatedList: {
    gap: 8,
  },
  relatedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  relatedIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#a78bfa15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  relatedContent: {
    flex: 1,
    marginRight: 8,
  },
  relatedTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  relatedPeople: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  noRelatedText: {
    fontSize: 14,
    color: '#444',
  },
  processingBanner: {
    backgroundColor: 'rgba(196, 223, 196, 0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(196, 223, 196, 0.15)',
  },
  processingSteps: {
    gap: 12,
  },
  processingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  processingStepText: {
    fontSize: 14,
    color: '#666',
  },
  processingStepDone: {
    color: '#22c55e',
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineLoadingText: {
    fontSize: 12,
    color: '#c4dfc4',
    fontWeight: '500',
  },
  processingActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  processingActiveText: {
    fontSize: 13,
    color: '#888',
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
    backgroundColor: '#c4dfc4',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
