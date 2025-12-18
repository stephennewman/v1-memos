import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface QuickActionsProps {
  onVoice: () => void;
  onTask: () => void;
  onTopic: () => void;
}

export function QuickActions({ onVoice, onTask, onTopic }: QuickActionsProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.actionButton, styles.topicButton]}
        onPress={onTopic}
        activeOpacity={0.85}
      >
        <View style={styles.iconWrapper}>
          <Ionicons name="bookmark" size={18} color="#fff" />
        </View>
        <Text style={styles.buttonLabel}>Topic</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.voiceButton]}
        onPress={onVoice}
        activeOpacity={0.85}
      >
        <View style={styles.iconWrapper}>
          <Ionicons name="mic" size={18} color="#fff" />
        </View>
        <Text style={styles.buttonLabel}>Voice</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, styles.taskButton]}
        onPress={onTask}
        activeOpacity={0.85}
      >
        <View style={styles.iconWrapper}>
          <Ionicons name="add" size={18} color="#fff" />
        </View>
        <Text style={styles.buttonLabel}>Task</Text>
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
    bottom: 85, // Just above the tab bar
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
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
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
    fontSize: 13,
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

