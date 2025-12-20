import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserDaily, updateDailyEngagement, DAILY_CATEGORIES } from '@/lib/guy-talk';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface DailyCardProps {
  daily: UserDaily;
  onEngagementChange?: (daily: UserDaily) => void;
}

export function DailyCard({ daily, onEngagementChange }: DailyCardProps) {
  const [isExpanded, setIsExpanded] = useState(daily.expanded);
  const [isSaved, setIsSaved] = useState(daily.saved);
  const [isDismissed, setIsDismissed] = useState(daily.dismissed);

  const category = DAILY_CATEGORIES[daily.category as keyof typeof DAILY_CATEGORIES];
  const categoryColor = category?.color || '#666';
  const categoryIcon = category?.icon || '💬';

  const handleExpand = async () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    
    if (newExpanded && !daily.expanded) {
      await updateDailyEngagement(daily.id, { expanded: true });
      onEngagementChange?.({ ...daily, expanded: true });
    }
  };

  const handleSave = async () => {
    const newSaved = !isSaved;
    setIsSaved(newSaved);
    await updateDailyEngagement(daily.id, { saved: newSaved });
    onEngagementChange?.({ ...daily, saved: newSaved });
  };

  const handleDismiss = async () => {
    setIsDismissed(true);
    await updateDailyEngagement(daily.id, { dismissed: true });
    onEngagementChange?.({ ...daily, dismissed: true });
  };

  if (isDismissed) {
    return null;
  }

  return (
    <TouchableOpacity 
      style={[styles.card, { borderLeftColor: categoryColor }]}
      onPress={handleExpand}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryIcon}>{categoryIcon}</Text>
          <Text style={[styles.categoryLabel, { color: categoryColor }]}>
            {category?.label || daily.category}
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={handleSave}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons 
              name={isSaved ? 'bookmark' : 'bookmark-outline'} 
              size={18} 
              color={isSaved ? '#f97316' : '#666'} 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      {daily.title && (
        <Text style={styles.title}>{daily.title}</Text>
      )}

      <Text 
        style={styles.content}
        numberOfLines={isExpanded ? undefined : 2}
      >
        {daily.content}
      </Text>

      {!isExpanded && daily.content.length > 100 && (
        <Text style={styles.expandHint}>Tap to read more</Text>
      )}
    </TouchableOpacity>
  );
}

interface ChallengeCardProps {
  challenge: {
    id: string;
    challenge_text: string;
    challenge_category?: string;
    difficulty: string;
    status: string;
    streak_count: number;
  };
  onStatusChange?: (status: 'accepted' | 'completed' | 'skipped') => void;
  onRequestNew?: () => void;
  onDismiss?: () => void;
}

export function ChallengeCard({ challenge, onStatusChange, onRequestNew, onDismiss }: ChallengeCardProps) {
  const [status, setStatus] = useState(challenge.status);
  const [showTryAnother, setShowTryAnother] = useState(false);
  const [fullyDismissed, setFullyDismissed] = useState(false);
  const streak = challenge.streak_count;

  const handleAccept = () => {
    setStatus('accepted');
    onStatusChange?.('accepted');
  };

  const handleComplete = () => {
    setStatus('completed');
    onStatusChange?.('completed');
  };

  const handleSkip = () => {
    setStatus('skipped');
    onStatusChange?.('skipped');
    // Show try another option after skipping
    setTimeout(() => setShowTryAnother(true), 300);
  };

  const handleTryAnother = () => {
    setShowTryAnother(false);
    onRequestNew?.();
  };

  const handleDismiss = () => {
    setFullyDismissed(true);
    onDismiss?.();
  };

  const difficultyColor = {
    easy: '#22c55e',
    moderate: '#f97316',
    hard: '#ef4444',
    extreme: '#dc2626',
  }[challenge.difficulty] || '#f97316';

  // Fully dismissed - hide completely
  if (fullyDismissed) {
    return null;
  }

  // Show "try another" option after skipping
  if (showTryAnother) {
    return (
      <View style={styles.tryAnotherContainer}>
        <TouchableOpacity 
          style={styles.tryAnotherCard}
          onPress={handleTryAnother}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={20} color="#f97316" />
          <Text style={styles.tryAnotherText}>Try a different challenge</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.dismissButton}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.dismissText}>Not today</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.challengeCard}>
      <View style={styles.challengeHeader}>
        <View style={styles.challengeLeft}>
          <Text style={styles.challengeEmoji}>⚡</Text>
          <Text style={styles.challengeLabel}>Today's Challenge</Text>
        </View>
        <View style={styles.challengeRight}>
          {streak > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {streak}</Text>
            </View>
          )}
          <TouchableOpacity 
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.challengeText}>{challenge.challenge_text}</Text>

      <View style={styles.challengeMeta}>
        <View style={[styles.difficultyBadge, { backgroundColor: `${difficultyColor}20` }]}>
          <Text style={[styles.difficultyText, { color: difficultyColor }]}>
            {challenge.difficulty}
          </Text>
        </View>
        {challenge.challenge_category && (
          <Text style={styles.challengeCategory}>{challenge.challenge_category}</Text>
        )}
      </View>

      {status === 'shown' && (
        <View style={styles.challengeActions}>
          <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
            <Text style={styles.acceptButtonText}>Accept Challenge</Text>
            <Ionicons name="flash" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'accepted' && (
        <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={styles.completeButtonText}>Mark Complete</Text>
        </TouchableOpacity>
      )}

      {status === 'completed' && (
        <View style={styles.completedBadge}>
          <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
          <Text style={styles.completedText}>Completed!</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Daily Card styles
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryIcon: {
    fontSize: 16,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  content: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 22,
  },
  expandHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  // Challenge Card styles
  challengeCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f9731640',
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  challengeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  challengeEmoji: {
    fontSize: 20,
  },
  challengeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f97316',
  },
  streakBadge: {
    backgroundColor: '#f9731620',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f97316',
  },
  challengeText: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
    marginBottom: 12,
  },
  challengeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  difficultyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  difficultyText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  challengeCategory: {
    fontSize: 12,
    color: '#666',
  },
  challengeActions: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f97316',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  skipButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#333',
  },
  skipButtonText: {
    fontSize: 14,
    color: '#888',
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  completeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  completedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22c55e',
  },
  skippedBadge: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skippedText: {
    fontSize: 14,
    color: '#666',
  },
  challengeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tryAnotherContainer: {
    marginBottom: 12,
  },
  tryAnotherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  tryAnotherText: {
    fontSize: 14,
    color: '#f97316',
    fontWeight: '500',
  },
  dismissButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  dismissText: {
    fontSize: 13,
    color: '#666',
  },
});


