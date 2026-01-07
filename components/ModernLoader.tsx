import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';

interface ModernLoaderProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
}

export function ModernLoader({ 
  size = 'medium', 
  color = '#c4dfc4' 
}: ModernLoaderProps) {
  const anim = useRef(new Animated.Value(0)).current;

  const dotSize = size === 'small' ? 6 : size === 'medium' ? 8 : 10;
  const spacing = size === 'small' ? 4 : size === 'medium' ? 6 : 8;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    animation.start();
    return () => animation.stop();
  }, [anim]);

  // Simple wave effect - each dot offset by 0.33 of the cycle
  const getDotStyle = (index: number) => ({
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 0.33, 0.66, 1],
          outputRange: index === 0 
            ? [-6, 0, 0, -6]
            : index === 1 
              ? [0, -6, 0, 0]
              : [0, 0, -6, 0],
        }),
      },
    ],
    opacity: anim.interpolate({
      inputRange: [0, 0.33, 0.66, 1],
      outputRange: index === 0 
        ? [1, 0.4, 0.4, 1]
        : index === 1 
          ? [0.4, 1, 0.4, 0.4]
          : [0.4, 0.4, 1, 0.4],
    }),
  });

  return (
    <View style={styles.container}>
      <View style={[styles.dotsContainer, { gap: spacing }]}>
        {[0, 1, 2].map(index => (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              { width: dotSize, height: dotSize, backgroundColor: color },
              getDotStyle(index),
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// Simple pulse circle
export function PulseLoader({ 
  size = 40, 
  color = '#c4dfc4' 
}: { size?: number; color?: string }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
  },
  dot: {
    borderRadius: 50,
  },
});
