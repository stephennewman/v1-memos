import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrioritizedTask, PrioritizerResult } from '@/lib/prioritizer';
import { ModernLoader } from './ModernLoader';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PrioritizerModalProps {
  visible: boolean;
  onClose: () => void;
  result: PrioritizerResult | null;
  isLoading: boolean;
  onTaskPress: (taskId: string) => void;
  onTaskComplete: (taskId: string) => void;
}

// Score badge color based on score
function getScoreColor(score: number): string {
  if (score >= 80) return '#ef4444'; // Red - urgent
  if (score >= 65) return '#f97316'; // Orange - high
  if (score >= 50) return '#eab308'; // Yellow - medium
  return '#22c55e'; // Green - can wait
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'URGENT';
  if (score >= 65) return 'HIGH';
  if (score >= 50) return 'MODERATE';
  return 'LOW';
}

// Animated priority card
const PriorityCard = ({
  item,
  index,
  onPress,
  onComplete
}: {
  item: PrioritizedTask;
  index: number;
  onPress: () => void;
  onComplete: () => void;
}) => {
  const slideAnim = React.useRef(new Animated.Value(50)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const scoreColor = getScoreColor(item.score);
  const scoreLabel = getScoreLabel(item.score);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.cardContent,
          pressed && styles.cardPressed,
        ]}
      >
        {/* Rank badge */}
        <View style={[styles.rankBadge, { backgroundColor: scoreColor }]}>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>

        {/* Main content */}
        <View style={styles.cardMain}>
          <Text style={styles.taskText} numberOfLines={2}>
            {item.task.text}
          </Text>

          {/* Reasoning */}
          <Text style={styles.reasoning} numberOfLines={1}>
            {item.reasoning}
          </Text>

          {/* Factors */}
          <View style={styles.factorsRow}>
            {item.factors.slice(0, 3).map((factor, i) => (
              <View key={i} style={styles.factorChip}>
                <Text style={styles.factorText}>
                  {factor.name}: +{factor.impact}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Score */}
        <View style={styles.scoreSection}>
          <View style={[styles.scoreBadge, { backgroundColor: scoreColor }]}>
            <Text style={styles.scoreNumber}>{item.score}</Text>
          </View>
          <Text style={[styles.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
        </View>
      </Pressable>

      {/* Quick complete button */}
      <Pressable
        onPress={onComplete}
        style={({ pressed }) => [
          styles.completeBtn,
          pressed && styles.completeBtnPressed,
        ]}
      >
        <Ionicons name="checkmark-circle-outline" size={24} color="#22c55e" />
      </Pressable>
    </Animated.View>
  );
};

export function PrioritizerModal({
  visible,
  onClose,
  result,
  isLoading,
  onTaskPress,
  onTaskComplete,
}: PrioritizerModalProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = React.useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 20,
        stiffness: 150,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onClose());
  }, [onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.blurContainer}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [{ translateY: slideAnim }],
              paddingBottom: insets.bottom + 16,
            }
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <View style={styles.headerContent}>
              <View style={styles.headerLeft}>
                <Ionicons name="flash" size={24} color="#f59e0b" />
                <Text style={styles.title}>Today's Focus</Text>
              </View>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={24} color="#999" />
              </Pressable>
            </View>
            {result && (
              <Text style={styles.subtitle}>
                {result.topPriorities.length} priorities from {result.totalPendingTasks} pending tasks
              </Text>
            )}
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ModernLoader />
                <Text style={styles.loadingText}>Analyzing your tasks...</Text>
              </View>
            ) : result?.topPriorities.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="checkmark-done-circle" size={64} color="#22c55e" />
                <Text style={styles.emptyTitle}>All caught up!</Text>
                <Text style={styles.emptySubtitle}>
                  No pending tasks to prioritize
                </Text>
              </View>
            ) : (
              result?.topPriorities.map((item, index) => (
                <PriorityCard
                  key={item.task.id}
                  item={item}
                  index={index}
                  onPress={() => {
                    handleClose();
                    onTaskPress(item.task.id);
                  }}
                  onComplete={() => onTaskComplete(item.task.id)}
                />
              ))
            )}
          </ScrollView>

          {/* Footer */}
          {result && result.topPriorities.length > 0 && (
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Tap a task for details • ✓ to complete
              </Text>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  blurContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
    minHeight: SCREEN_HEIGHT * 0.5,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#666',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 12,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    color: '#888',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
  },
  card: {
    backgroundColor: '#252525',
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    padding: 14,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.7,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  cardMain: {
    flex: 1,
    gap: 6,
  },
  taskText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 20,
  },
  reasoning: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  factorsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  factorChip: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  factorText: {
    fontSize: 10,
    color: '#aaa',
    fontWeight: '500',
  },
  scoreSection: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  scoreBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  scoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  completeBtn: {
    backgroundColor: '#1f1f1f',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#333',
  },
  completeBtnPressed: {
    backgroundColor: '#2a2a2a',
  },
  footer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
  },
});
