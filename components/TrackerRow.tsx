import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { logTracker, getTodayTrackers, TRACKER_EMOJIS, UserTracker } from '@/lib/guy-talk';

interface TrackerRowProps {
  onTrackerLogged?: (tracker: UserTracker) => void;
}

export function TrackerRow({ onTrackerLogged }: TrackerRowProps) {
  const [latestTrackers, setLatestTrackers] = useState<Record<string, UserTracker>>({});
  const [loading, setLoading] = useState(false);
  const [feedbackEmoji, setFeedbackEmoji] = useState<string | null>(null);
  const feedbackAnim = new Animated.Value(0);

  useEffect(() => {
    loadTrackers();
  }, []);

  const loadTrackers = async () => {
    const { latest } = await getTodayTrackers();
    setLatestTrackers(latest);
  };

  const handleTrackerPress = async (
    type: keyof typeof TRACKER_EMOJIS,
    emoji: string,
    numeric: number
  ) => {
    if (loading) return;
    
    setLoading(true);
    setFeedbackEmoji(emoji);
    
    // Animate feedback
    Animated.sequence([
      Animated.timing(feedbackAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(feedbackAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    const result = await logTracker(type, emoji, numeric, 'tap');
    
    if (result.success && result.tracker) {
      setLatestTrackers(prev => ({
        ...prev,
        [type]: result.tracker!,
      }));
      onTrackerLogged?.(result.tracker);
    }
    
    setLoading(false);
    setTimeout(() => setFeedbackEmoji(null), 500);
  };

  const renderTrackerSection = (
    type: keyof typeof TRACKER_EMOJIS,
    label: string
  ) => {
    const emojis = TRACKER_EMOJIS[type];
    const currentValue = latestTrackers[type]?.value;

    return (
      <View style={styles.trackerSection}>
        <Text style={styles.trackerLabel}>{label}</Text>
        <View style={styles.emojiRow}>
          {Object.entries(emojis).map(([emoji, data]) => {
            const isSelected = currentValue === emoji;
            return (
              <TouchableOpacity
                key={emoji}
                style={[
                  styles.emojiButton,
                  isSelected && styles.emojiButtonSelected,
                ]}
                onPress={() => handleTrackerPress(type, emoji, data.numeric)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.emoji,
                  isSelected && styles.emojiSelected,
                ]}>
                  {emoji}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>How are you?</Text>
        {feedbackEmoji && (
          <Animated.Text
            style={[
              styles.feedbackEmoji,
              {
                opacity: feedbackAnim,
                transform: [{ scale: feedbackAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1.2],
                })}],
              },
            ]}
          >
            {feedbackEmoji}
          </Animated.Text>
        )}
      </View>
      
      <View style={styles.trackersContainer}>
        {renderTrackerSection('mood', 'Mood')}
        {renderTrackerSection('energy', 'Energy')}
        {renderTrackerSection('stress', 'Stress')}
      </View>
    </View>
  );
}

export function CompactTrackerRow({ onTrackerLogged }: TrackerRowProps) {
  const [latestTrackers, setLatestTrackers] = useState<Record<string, UserTracker>>({});

  useEffect(() => {
    loadTrackers();
  }, []);

  const loadTrackers = async () => {
    const { latest } = await getTodayTrackers();
    setLatestTrackers(latest);
  };

  const handleTrackerPress = async (
    type: keyof typeof TRACKER_EMOJIS,
    emoji: string,
    numeric: number
  ) => {
    const result = await logTracker(type, emoji, numeric, 'tap');
    
    if (result.success && result.tracker) {
      setLatestTrackers(prev => ({
        ...prev,
        [type]: result.tracker!,
      }));
      onTrackerLogged?.(result.tracker);
    }
  };

  return (
    <View style={styles.compactContainer}>
      {(['mood', 'energy', 'stress'] as const).map((type) => {
        const emojis = TRACKER_EMOJIS[type];
        const currentValue = latestTrackers[type]?.value;
        
        return (
          <View key={type} style={styles.compactSection}>
            {Object.entries(emojis).map(([emoji, data]) => {
              const isSelected = currentValue === emoji;
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.compactButton,
                    isSelected && styles.compactButtonSelected,
                  ]}
                  onPress={() => handleTrackerPress(type, emoji, data.numeric)}
                >
                  <Text style={styles.compactEmoji}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  feedbackEmoji: {
    fontSize: 24,
  },
  trackersContainer: {
    gap: 16,
  },
  trackerSection: {
    gap: 8,
  },
  trackerLabel: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emojiRow: {
    flexDirection: 'row',
    gap: 8,
  },
  emojiButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0a0a0a',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiButtonSelected: {
    borderColor: '#f97316',
    backgroundColor: '#f9731620',
  },
  emoji: {
    fontSize: 24,
    opacity: 0.7,
  },
  emojiSelected: {
    opacity: 1,
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  compactSection: {
    flexDirection: 'row',
    gap: 4,
  },
  compactButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  compactButtonSelected: {
    borderColor: '#f97316',
    backgroundColor: '#f9731620',
  },
  compactEmoji: {
    fontSize: 18,
  },
});


