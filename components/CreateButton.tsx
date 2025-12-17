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
        style={[styles.actionButton, styles.voiceButton]}
        onPress={onVoice}
        activeOpacity={0.8}
      >
        <Ionicons name="mic" size={22} color="#fff" />
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.actionButton, styles.taskButton]}
        onPress={onTask}
        activeOpacity={0.8}
      >
        <Ionicons name="checkbox-outline" size={22} color="#fff" />
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.actionButton, styles.topicButton]}
        onPress={onTopic}
        activeOpacity={0.8}
      >
        <Ionicons name="bookmark-outline" size={22} color="#fff" />
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
    bottom: 100,
    right: 16,
    flexDirection: 'column',
    gap: 12,
    zIndex: 100,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  voiceButton: {
    backgroundColor: '#4ade80',
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

