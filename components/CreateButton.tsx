import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type QuickActionContext = 'home' | 'voice' | 'settings' | 'other';

interface QuickActionsProps {
  onVoice: () => void;
  onTask: () => void;
  context?: QuickActionContext;
}

export function QuickActions({ onVoice, onTask, context = 'home' }: QuickActionsProps) {
  // Don't show on settings
  if (context === 'settings') return null;

  // Voice/Memo page: only show Memo button (full width)
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
          <Text style={styles.buttonLabel}>Add Memo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Home & other: show only Memo button (full width)
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
        <Text style={styles.buttonLabel}>Add Memo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 34,
    gap: 8,
    backgroundColor: '#111111',
    borderTopWidth: 1,
    borderTopColor: '#222222',
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
});
