import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type QuickActionContext = 'home' | 'topics' | 'voice' | 'tasks' | 'notes' | 'other';

interface QuickActionsProps {
  onVoice: () => void;
  onTask: () => void;
  onTopic: () => void;
  onNote: () => void;
  context?: QuickActionContext;
}

export function QuickActions({ onVoice, onTask, onTopic, onNote, context = 'home' }: QuickActionsProps) {
  // Topics page: only show Topic button (full width)
  if (context === 'topics') {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.actionButton, styles.topicButton, styles.fullWidth]}
          onPress={onTopic}
          activeOpacity={0.85}
        >
          <View style={styles.iconWrapper}>
            <Ionicons name="bookmark" size={18} color="#fff" />
          </View>
          <Text style={styles.buttonLabel}>New Topic</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Voice page: only show Voice button (full width)
  if (context === 'voice') {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.actionButton, styles.voiceButton, styles.fullWidth]}
          onPress={onVoice}
          activeOpacity={0.85}
        >
          <View style={styles.iconWrapper}>
            <Ionicons name="mic" size={18} color="#fff" />
          </View>
          <Text style={styles.buttonLabel}>Record Voice Note</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Tasks page: only show Task button (full width)
  if (context === 'tasks') {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.actionButton, styles.taskButton, styles.fullWidth]}
          onPress={onTask}
          activeOpacity={0.85}
        >
          <View style={styles.iconWrapper}>
            <Ionicons name="add" size={18} color="#fff" />
          </View>
          <Text style={styles.buttonLabel}>New Task</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Notes page: only show Note button (full width)
  if (context === 'notes') {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.actionButton, styles.noteButton, styles.fullWidth]}
          onPress={onNote}
          activeOpacity={0.85}
        >
          <View style={styles.iconWrapper}>
            <Ionicons name="document-text" size={18} color="#fff" />
          </View>
          <Text style={styles.buttonLabel}>New Note</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Home & other: show all 4 buttons
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.actionButton, styles.topicButton]}
        onPress={onTopic}
        activeOpacity={0.85}
      >
        <View style={styles.iconWrapper}>
          <Ionicons name="bookmark" size={16} color="#fff" />
        </View>
        <Text style={styles.buttonLabelSmall}>Topic</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.voiceButton]}
        onPress={onVoice}
        activeOpacity={0.85}
      >
        <View style={styles.iconWrapper}>
          <Ionicons name="mic" size={16} color="#fff" />
        </View>
        <Text style={styles.buttonLabelSmall}>Voice</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.taskButton]}
        onPress={onTask}
        activeOpacity={0.85}
      >
        <View style={styles.iconWrapper}>
          <Ionicons name="add" size={16} color="#fff" />
        </View>
        <Text style={styles.buttonLabelSmall}>Task</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.noteButton]}
        onPress={onNote}
        activeOpacity={0.85}
      >
        <View style={styles.iconWrapper}>
          <Ionicons name="document-text" size={16} color="#fff" />
        </View>
        <Text style={styles.buttonLabelSmall}>Note</Text>
      </TouchableOpacity>
    </View>
  );
}

// Legacy single button for backwards compatibility
interface CreateButtonProps {
  onPress: () => void;
  isOpen?: boolean;
}

export function CreateButton({ onPress, isOpen = false }: CreateButtonProps) {
  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons name="add" size={28} color="#0a0a0a" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 85,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    zIndex: 100,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 6,
  },
  fullWidth: {
    paddingVertical: 12,
  },
  iconWrapper: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  buttonLabelSmall: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  voiceButton: {
    backgroundColor: '#22c55e',
  },
  taskButton: {
    backgroundColor: '#3b82f6',
  },
  topicButton: {
    backgroundColor: '#f59e0b',
  },
  noteButton: {
    backgroundColor: '#a78bfa',
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#c4dfc4',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
});
