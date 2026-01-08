import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Platform,
  Vibration,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

// Simple haptic feedback using Vibration API
const triggerHaptic = () => {
  if (Platform.OS === 'ios') {
    Vibration.vibrate(20);
  } else {
    Vibration.vibrate(25);
  }
};

interface SwipeableItemProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftAction?: {
    icon: string;
    color: string;
    backgroundColor: string;
    label?: string;
  };
  rightAction?: {
    icon: string;
    color: string;
    backgroundColor: string;
    label?: string;
  };
  disabled?: boolean;
  style?: any;
}

export function SwipeableItem({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction = {
    icon: 'trash-outline',
    color: '#fff',
    backgroundColor: '#ef4444',
    label: 'Delete',
  },
  rightAction = {
    icon: 'checkmark',
    color: '#fff',
    backgroundColor: '#22c55e',
    label: 'Done',
  },
  disabled = false,
  style,
}: SwipeableItemProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSwipeRight = () => {
    triggerHaptic();
    if (onSwipeRight) {
      onSwipeRight();
    }
    setTimeout(() => swipeableRef.current?.close(), 10);
  };

  const handleSwipeLeft = async () => {
    triggerHaptic();
    setIsDeleting(true);
    if (onSwipeLeft) {
      onSwipeLeft();
    }
    // Small delay to show the loader, then close
    setTimeout(() => {
      swipeableRef.current?.close();
      setIsDeleting(false);
    }, 300);
  };

  // Render right actions (shown when swiping left) - DELETE
  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (!onSwipeLeft) return null;

    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0.5],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity
        style={[styles.actionContainer, { backgroundColor: leftAction.backgroundColor }]}
        onPress={handleSwipeLeft}
        activeOpacity={0.8}
        disabled={isDeleting}
      >
        <Animated.View style={[styles.actionContent, { transform: [{ scale }] }]}>
          {isDeleting ? (
            <ActivityIndicator size="small" color={leftAction.color} />
          ) : (
            <>
              <Ionicons name={leftAction.icon as any} size={22} color={leftAction.color} />
              {leftAction.label && (
                <Text style={[styles.actionLabel, { color: leftAction.color }]}>{leftAction.label}</Text>
              )}
            </>
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  };

  // Render left actions (shown when swiping right) - COMPLETE
  const renderLeftActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (!onSwipeRight) return null;

    const scale = dragX.interpolate({
      inputRange: [0, 100],
      outputRange: [0.5, 1],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity
        style={[styles.actionContainer, { backgroundColor: rightAction.backgroundColor }]}
        onPress={handleSwipeRight}
        activeOpacity={0.8}
      >
        <Animated.View style={[styles.actionContent, { transform: [{ scale }] }]}>
          <Ionicons name={rightAction.icon as any} size={22} color={rightAction.color} />
          {rightAction.label && (
            <Text style={[styles.actionLabel, { color: rightAction.color }]}>{rightAction.label}</Text>
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  };

  // Auto-execute swipe-right when threshold passed (if enabled)
  const onSwipeableWillOpen = (direction: 'left' | 'right') => {
    if (direction === 'left' && onSwipeRight) {
      handleSwipeRight();
    }
    // Swipe left (delete) requires tap to confirm
  };

  if (disabled) {
    return <View style={[styles.content, style]}>{children}</View>;
  }

  return (
    <View style={style}>
      <Swipeable
        ref={swipeableRef}
        renderLeftActions={onSwipeRight ? renderLeftActions : undefined}
        renderRightActions={renderRightActions}
        onSwipeableWillOpen={onSwipeRight ? onSwipeableWillOpen : undefined}
        leftThreshold={60}
        rightThreshold={60}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
      >
        <View style={styles.content}>{children}</View>
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: '#0a0a0a',
  },
  actionContainer: {
    width: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionContent: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
