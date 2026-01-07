import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  FlatList,
  Animated,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOnboarding } from '@/lib/onboarding-context';

const { width } = Dimensions.get('window');

interface OnboardingSlide {
  id: string;
  iconType: 'image' | 'cloud' | 'calendar' | 'flow';
  title: string;
  subtitle: string;
  isLast?: boolean;
}

// Define slides without JSX to avoid styles reference issue
const SLIDE_DATA: OnboardingSlide[] = [
  {
    id: '1',
    iconType: 'image',
    title: 'MemoTalk',
    subtitle: 'Your voice. Organized.',
  },
  {
    id: '2',
    iconType: 'cloud',
    title: "Your mind wasn't meant\nto hold everything",
    subtitle: 'Ideas vanish mid-thought. Tasks pile up.\nThe important stuff slips through the cracks.',
  },
  {
    id: '3',
    iconType: 'calendar',
    title: 'Track your days',
    subtitle: 'See today clearly. Look back anytime.\nWatch your patterns emerge.',
  },
  {
    id: '4',
    iconType: 'flow',
    title: "Talk. That's it.",
    subtitle: "We capture your thoughts, extract the tasks,\nand tag everything automatically.\nYou just show up.",
    isLast: true,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useOnboarding();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleNext = () => {
    if (currentIndex < SLIDE_DATA.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    completeOnboarding();
    router.replace('/(tabs)');
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index || 0);
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  // Render icon based on type
  const renderIcon = (iconType: string) => {
    switch (iconType) {
      case 'image':
        return (
          <Image
            source={require('@/assets/images/icon.png')}
            style={{ width: 120, height: 120, borderRadius: 28 }}
          />
        );
      case 'cloud':
        return (
          <View style={styles.iconContainer}>
            <Ionicons name="cloud-outline" size={48} color="#E91E63" />
            <View style={styles.thoughtBubbles}>
              <View style={[styles.bubble, styles.bubble1]} />
              <View style={[styles.bubble, styles.bubble2]} />
              <View style={[styles.bubble, styles.bubble3]} />
            </View>
          </View>
        );
      case 'calendar':
        return (
          <View style={styles.iconContainer}>
            <Ionicons name="calendar-outline" size={56} color="#E91E63" />
          </View>
        );
      case 'flow':
        return (
          <View style={styles.flowContainer}>
            <View style={styles.flowItem}>
              <Ionicons name="mic" size={32} color="#E91E63" />
            </View>
            <Ionicons name="arrow-forward" size={20} color="#666" />
            <View style={styles.flowItem}>
              <Ionicons name="document-text" size={32} color="#E91E63" />
            </View>
            <Ionicons name="arrow-forward" size={20} color="#666" />
            <View style={styles.flowItem}>
              <Ionicons name="pricetag" size={32} color="#E91E63" />
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  const renderSlide = ({ item }: { item: OnboardingSlide }) => (
    <TouchableOpacity 
      style={styles.slide} 
      activeOpacity={1}
      onPress={handleNext}
    >
      <View style={styles.slideContent}>
        <View style={styles.iconWrapper}>
          {renderIcon(item.iconType)}
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle}>{item.subtitle}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderDots = () => (
    <View style={styles.dotsContainer}>
      {SLIDE_DATA.map((_, index) => {
        const inputRange = [
          (index - 1) * width,
          index * width,
          (index + 1) * width,
        ];
        
        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [8, 24, 8],
          extrapolate: 'clamp',
        });
        
        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.3, 1, 0.3],
          extrapolate: 'clamp',
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              {
                width: dotWidth,
                opacity,
              },
            ]}
          />
        );
      })}
    </View>
  );

  const isLastSlide = currentIndex === SLIDE_DATA.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      {/* Skip button */}
      {!isLastSlide && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <Animated.FlatList
        ref={flatListRef}
        data={SLIDE_DATA}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
      />

      {/* Bottom section */}
      <View style={styles.bottomContainer}>
        {renderDots()}
        
        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>
            {isLastSlide ? 'Start Fresh' : 'Next'}
          </Text>
          <Ionicons 
            name={isLastSlide ? 'arrow-forward' : 'chevron-forward'} 
            size={20} 
            color="#0a0a0a" 
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    fontSize: 16,
    color: '#666',
  },
  slide: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  slideContent: {
    alignItems: 'center',
    marginTop: -60,
  },
  iconWrapper: {
    marginBottom: 40,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thoughtBubbles: {
    position: 'absolute',
    width: 100,
    height: 100,
  },
  bubble: {
    position: 'absolute',
    backgroundColor: '#E91E63',
    borderRadius: 50,
    opacity: 0.3,
  },
  bubble1: {
    width: 12,
    height: 12,
    top: -20,
    right: -10,
  },
  bubble2: {
    width: 8,
    height: 8,
    top: -5,
    left: -25,
  },
  bubble3: {
    width: 10,
    height: 10,
    bottom: 10,
    right: -20,
  },
  flowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flowItem: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 17,
    color: '#888',
    textAlign: 'center',
    lineHeight: 26,
  },
  bottomContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 24,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E91E63',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E91E63',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    gap: 8,
  },
  nextButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0a0a0a',
  },
});
