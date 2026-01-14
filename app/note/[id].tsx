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
import { useTheme } from '@/lib/theme-context';
import type { VoiceNote } from '@/lib/types';
import { getTagColor } from '@/lib/auto-tags';

export default function NoteDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  
  const [note, setNote] = useState<VoiceNote | null>(null);
  const [relatedNotes, setRelatedNotes] = useState<VoiceNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [newTagText, setNewTagText] = useState('');

  useEffect(() => {
    loadNote();
  }, [id]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadNote();
    setIsRefreshing(false);
  };

  const loadNote = async (retryCount = 0) => {
    if (!id) return;
    
    // Don't try to load temp IDs - wait for real ID
    if (id.startsWith('temp-')) {
      if (retryCount < 3) {
        setTimeout(() => loadNote(retryCount + 1), 500);
        return;
      }
      setIsLoading(false);
      Alert.alert('Error', 'Note is still being saved. Please try again.');
      router.back();
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('voice_notes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        // Retry a few times in case of timing issues
        if (retryCount < 2) {
          setTimeout(() => loadNote(retryCount + 1), 300);
          return;
        }
        throw error;
      }
      setNote(data);
      setEditedText(data.text);
      setEditedTags(data.tags || []);
      
      // Find related notes
      await loadRelatedNotes(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading note:', error);
      setIsLoading(false);
      Alert.alert('Error', 'Failed to load note');
      router.back();
    }
  };
  
  const loadRelatedNotes = async (currentNote: VoiceNote) => {
    try {
      // Get keywords from the note text (words > 3 chars, lowercase)
      const keywords = currentNote.text
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
        .map(word => word.replace(/[^a-z0-9]/g, ''))
        .filter(word => word.length > 3);
      
      if (keywords.length === 0) {
        setRelatedNotes([]);
        return;
      }
      
      // Query for notes containing any of these keywords
      const { data: allNotes } = await supabase
        .from('voice_notes')
        .select('*')
        .eq('user_id', currentNote.user_id)
        .neq('id', currentNote.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (!allNotes) {
        setRelatedNotes([]);
        return;
      }
      
      // Score and filter notes by keyword matches
      const scoredNotes = allNotes.map(note => {
        const noteWords = note.text.toLowerCase().split(/\s+/);
        const matchCount = keywords.filter(keyword => 
          noteWords.some(word => word.includes(keyword) || keyword.includes(word))
        ).length;
        return { note, score: matchCount };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => item.note);
      
      setRelatedNotes(scoredNotes);
    } catch (error) {
      console.error('Error loading related notes:', error);
      setRelatedNotes([]);
    }
  };

  const saveChanges = async () => {
    if (!note) return;
    
    try {
      const { error } = await supabase
        .from('voice_notes')
        .update({ 
          text: editedText,
          tags: editedTags,
          updated_at: new Date().toISOString(),
        })
        .eq('id', note.id);

      if (error) throw error;
      
      setNote({ ...note, text: editedText, tags: editedTags });
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert('Error', 'Failed to save changes');
    }
  };

  const archiveNote = () => {
    Alert.alert(
      'Archive Note',
      'This will move the note to archive. You can restore it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('voice_notes')
                .update({ is_archived: true })
                .eq('id', note?.id);

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

  const deleteNotePermanently = () => {
    Alert.alert(
      'Delete Permanently',
      'This will permanently delete this note. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('voice_notes')
                .delete()
                .eq('id', note?.id);

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

  const convertToTask = () => {
    Alert.alert(
      'Convert to Task',
      'This will archive the note and create a task with the same text. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Convert',
          onPress: async () => {
            if (!note) return;
            
            try {
              // Get user_id from the note
              const { data: noteData } = await supabase
                .from('voice_notes')
                .select('user_id')
                .eq('id', note.id)
                .single();
              
              if (!noteData) throw new Error('Note not found');
              
              // Create the task with the same created_at date as the note
              const { error: taskError } = await supabase
                .from('voice_todos')
                .insert({
                  user_id: noteData.user_id,
                  text: note.text,
                  entry_id: note.entry_id || null,
                  status: 'pending',
                  created_at: note.created_at, // Preserve original date
                  tags: note.tags || [],
                });

              if (taskError) throw taskError;

              // Archive the note
              const { error: archiveError } = await supabase
                .from('voice_notes')
                .update({ is_archived: true })
                .eq('id', note.id);

              if (archiveError) throw archiveError;

              Alert.alert('Success', 'Note converted to task');
              router.back();
            } catch (error) {
              console.error('Error converting:', error);
              Alert.alert('Error', 'Failed to convert note');
            }
          },
        },
      ]
    );
  };

  if (isLoading || !note) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
      </View>
    );
  }

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
        <Text style={[styles.headerTitle, { color: colors.notesPurple }]}>Note</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={archiveNote} style={styles.actionButton}>
            <Ionicons name="archive-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={deleteNotePermanently} style={styles.actionButton}>
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
        {/* Note Text */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>NOTE</Text>
          </View>
          {isEditingText ? (
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.cardBorder }]}
              value={editedText}
              onChangeText={setEditedText}
              multiline
              autoFocus
              placeholder="Enter note..."
              placeholderTextColor={colors.textMuted}
              onBlur={() => { saveChanges(); setIsEditingText(false); }}
            />
          ) : (
            <TouchableOpacity onPress={() => setIsEditingText(true)}>
              <Text style={[styles.noteText, { color: colors.text }]}>
                {note.text}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tags */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>TAGS</Text>
            {isEditingTags && (
              <TouchableOpacity onPress={() => { saveChanges(); setIsEditingTags(false); }}>
                <Text style={[styles.doneText, { color: colors.taskBlue }]}>Done</Text>
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
                  style={[styles.tagInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.cardBorder }]}
                  value={newTagText}
                  onChangeText={setNewTagText}
                  placeholder="Add tag..."
                  placeholderTextColor={colors.textMuted}
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
                  style={[styles.addTagBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                  onPress={() => {
                    const tag = newTagText.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (tag && !editedTags.includes(tag)) {
                      setEditedTags([...editedTags, tag]);
                    }
                    setNewTagText('');
                  }}
                >
                  <Ionicons name="add" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.tagsContainer}
              onPress={() => setIsEditingTags(true)}
            >
              {note.tags && note.tags.length > 0 ? (
                note.tags.map(tag => (
                  <View
                    key={tag}
                    style={[styles.tagChip, { backgroundColor: `${getTagColor(tag)}20`, borderColor: getTagColor(tag) }]}
                  >
                    <Text style={[styles.tagChipText, { color: getTagColor(tag) }]}>#{tag}</Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.noTagsText, { color: colors.textMuted }]}>Tap to add tags</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Source Entry */}
        {note.entry_id && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>SOURCE</Text>
            </View>
            <TouchableOpacity 
              style={[styles.sourceRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              onPress={() => router.push(`/entry/${note.entry_id}`)}
            >
              <Ionicons name="play" size={16} color={colors.success} />
              <Text style={[styles.sourceText, { color: colors.textSecondary }]}>View original memo</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Metadata */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>INFO</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Created</Text>
            <Text style={[styles.metaValue, { color: colors.textSecondary }]}>
              {new Date(note.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          </View>
          {note.updated_at !== note.created_at && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Updated</Text>
              <Text style={[styles.metaValue, { color: colors.textSecondary }]}>
                {new Date(note.updated_at).toLocaleDateString('en-US', {
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

        {/* Related Notes */}
        {relatedNotes.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>RELATED NOTES</Text>
              <Text style={[styles.relatedCount, { color: colors.textSecondary }]}>({relatedNotes.length})</Text>
            </View>
            {relatedNotes.map(relatedNote => (
              <TouchableOpacity 
                key={relatedNote.id}
                style={[styles.relatedRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                onPress={() => router.push(`/note/${relatedNote.id}`)}
              >
                <Ionicons name="ellipse" size={10} color={colors.notesPurple} style={{ marginHorizontal: 3 }} />
                <Text style={[styles.relatedText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {relatedNote.text}
                </Text>
                <Text style={[styles.relatedDate, { color: colors.textMuted }]}>
                  {new Date(relatedNote.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ACTIONS</Text>
          </View>
          <TouchableOpacity style={[styles.convertRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]} onPress={convertToTask}>
            <Ionicons name="checkbox-outline" size={18} color={colors.taskBlue} />
            <Text style={[styles.convertText, { color: colors.taskBlue }]}>Convert to Task</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
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
    color: '#a78bfa',
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
  doneText: {
    fontSize: 13,
    color: '#3b82f6',
  },
  noteText: {
    fontSize: 18,
    color: '#fff',
    lineHeight: 26,
  },
  textInput: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 100,
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
    color: '#3b82f6',
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
    backgroundColor: '#a78bfa',
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
});

