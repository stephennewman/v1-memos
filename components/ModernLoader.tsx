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
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  const dotSize = size === 'small' ? 6 : size === 'medium' ? 8 : 10;
  const spacing = size === 'small' ? 4 : size === 'medium' ? 6 : 8;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(400 - delay),
        ])
      );
    };

    const anim1 = animateDot(dot1, 0);
    const anim2 = animateDot(dot2, 150);
    const anim3 = animateDot(dot3, 300);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  const getAnimatedStyle = (dot: Animated.Value) => ({
    transform: [
      {
        scale: dot.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.4],
        }),
      },
      {
        translateY: dot.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -8],
        }),
      },
    ],
    opacity: dot.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4, 1],
    }),
  });

  return (
    <View style={styles.container}>
      <View style={[styles.dotsContainer, { gap: spacing }]}>
        <Animated.View
          style={[
            styles.dot,
            { width: dotSize, height: dotSize, backgroundColor: color },
            getAnimatedStyle(dot1),
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            { width: dotSize, height: dotSize, backgroundColor: color },
            getAnimatedStyle(dot2),
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            { width: dotSize, height: dotSize, backgroundColor: color },
            getAnimatedStyle(dot3),
          ]}
        />
      </View>
    </View>
  );
}

// Pulse loader - single circle that pulses
export function PulseLoader({ 
  size = 40, 
  color = '#c4dfc4' 
}: { size?: number; color?: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.3,
            duration: 600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 600,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.6,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    anim.start();
    return () => anim.stop();
  }, [scale, opacity]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.pulse,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            transform: [{ scale }],
            opacity,
          },
        ]}
      />
    </View>
  );
}

// Bar loader - animated progress bar
export function BarLoader({ 
  width = 120, 
  color = '#c4dfc4' 
}: { width?: number; color?: string }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ])
    );

    anim.start();
    return () => anim.stop();
  }, [progress]);

  const animatedWidth = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, width, 0],
  });

  const animatedLeft = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, width],
  });

  return (
    <View style={[styles.barContainer, { width }]}>
      <Animated.View
        style={[
          styles.bar,
          {
            backgroundColor: color,
            width: animatedWidth,
            left: animatedLeft,
          },
        ]}
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
  pulse: {
    // styles applied inline
  },
  barContainer: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  bar: {
    position: 'absolute',
    height: '100%',
    borderRadius: 2,
  },
});

