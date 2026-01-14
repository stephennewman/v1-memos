import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useTheme } from '@/lib/theme-context';

interface ProcessingAnimationProps {
  step?: string;
}

const DOT_COUNT = 5;
const WAVE_BAR_COUNT = 12;

export function ProcessingAnimation({ step = 'Processing...' }: ProcessingAnimationProps) {
  const { colors, isDark } = useTheme();
  // Pulsing center circle
  const pulseAnim = useRef(new Animated.Value(0)).current;
  
  // Wave bars animation
  const waveAnims = useRef<Animated.Value[]>(
    Array(WAVE_BAR_COUNT).fill(null).map(() => new Animated.Value(0))
  ).current;
  
  // Rotating ring
  const rotateAnim = useRef(new Animated.Value(0)).current;
  
  // Dots animation
  const dotAnims = useRef<Animated.Value[]>(
    Array(DOT_COUNT).fill(null).map(() => new Animated.Value(0))
  ).current;

  useEffect(() => {
    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Rotation animation
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Wave bars staggered animation
    waveAnims.forEach((anim, index) => {
      const delay = index * 80;
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    });

    // Dots sequential animation
    dotAnims.forEach((anim, index) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 200),
          Animated.timing(anim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay((DOT_COUNT - index - 1) * 200),
        ])
      ).start();
    });
  }, []);

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Centered content wrapper */}
      <View style={styles.centeredContent}>
        {/* Animated visualization */}
        <View style={styles.visualizer}>
          {/* Rotating outer ring */}
          <Animated.View 
            style={[
              styles.outerRing,
              { transform: [{ rotate: rotation }] }
            ]}
          >
            {Array(8).fill(null).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.ringDot,
                  {
                    backgroundColor: isDark ? '#333' : '#ddd',
                    transform: [
                      { rotate: `${i * 45}deg` },
                      { translateY: -60 },
                    ],
                  },
                ]}
              />
            ))}
          </Animated.View>

          {/* Wave bars in circular pattern */}
          <View style={styles.waveContainer}>
            {waveAnims.map((anim, index) => {
              const angle = (index / WAVE_BAR_COUNT) * 360;
              const scaleY = anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.4, 1],
              });
              
              return (
                <Animated.View
                  key={index}
                  style={[
                    styles.waveBar,
                    {
                      transform: [
                        { rotate: `${angle}deg` },
                        { translateY: -35 },
                        { scaleY },
                      ],
                    },
                  ]}
                />
              );
            })}
          </View>

          {/* Pulsing center */}
          <Animated.View
            style={[
              styles.centerPulse,
              {
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />
          <View style={styles.centerCore} />
        </View>

        {/* Status text */}
        <View style={styles.statusContainer}>
          <Text style={[styles.statusText, { color: colors.text }]}>{step}</Text>
          <View style={styles.dotsContainer}>
            {dotAnims.map((anim, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  {
                    opacity: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 1],
                    }),
                    transform: [{
                      scale: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.8, 1.2],
                      }),
                    }],
                  },
                ]}
              />
            ))}
          </View>
        </View>

        {/* Hint */}
        <Text style={[styles.hint, { color: colors.textSecondary }]}>This will only take a moment</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  centeredContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualizer: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  outerRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#333',
  },
  waveContainer: {
    position: 'absolute',
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveBar: {
    position: 'absolute',
    width: 4,
    height: 24,
    borderRadius: 2,
    backgroundColor: '#c4dfc4',
    transformOrigin: 'center bottom',
  },
  centerPulse: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(196, 223, 196, 0.3)',
  },
  centerCore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#c4dfc4',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#fff',
    marginRight: 8,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#c4dfc4',
  },
  hint: {
    fontSize: 14,
    color: '#555',
  },
});

