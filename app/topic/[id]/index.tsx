import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { generateMemos, respondToMemo } from '@/lib/api';
import type { MemoTopic, Memo } from '@/lib/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;

export default function TopicFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: topicId } = useLocalSearchParams<{ id: string }>();

  const [topic, setTopic] = useState<MemoTopic | null>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Progress tracking - count completed in this session
  const [sessionTotal, setSessionTotal] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  // Animation values (using RN Animated)
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  
  // Refs to access current state in PanResponder
  const isAnimatingRef = useRef(isAnimating);
  const memosRef = useRef(memos);
  const currentIndexRef = useRef(currentIndex);
  
  // Keep refs in sync
  useEffect(() => { isAnimatingRef.current = isAnimating; }, [isAnimating]);
  useEffect(() => { memosRef.current = memos; }, [memos]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  useEffect(() => {
    loadData();
  }, [topicId]);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !topicId) {
        router.back();
        return;
      }

      const { data: topicData } = await supabase
        .from('memo_topics')
        .select('*')
        .eq('id', topicId)
        .eq('user_id', user.id)
        .single();

      if (!topicData) {
        router.back();
        return;
      }
      setTopic(topicData);

      const { data: memosData } = await supabase
        .from('memos')
        .select('*')
        .eq('topic_id', topicId)
        .eq('status', 'active')
        .order('created_at', { ascending: true });

      const loadedMemos = memosData || [];
      setMemos(loadedMemos);
      
      // Initialize session progress
      if (loadedMemos.length > 0) {
        setSessionTotal(loadedMemos.length);
        setCompletedCount(0);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const performSwipe = useCallback((action: 'keep' | 'kick') => {
    const currentMemos = memosRef.current;
    const idx = currentIndexRef.current;
    const memo = currentMemos[idx];
    
    if (!memo || isAnimatingRef.current) return;

    setIsAnimating(true);
    isAnimatingRef.current = true;
    
    // Animate card flying off screen
    const toValue = action === 'keep' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    
    Animated.timing(translateX, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      // Reset position instantly
      translateX.setValue(0);
      translateY.setValue(0);
      
      // Remove card from list
      setMemos(prev => prev.filter((_, i) => i !== idx));
      
      // Update progress
      setCompletedCount(prev => prev + 1);
      
      setIsAnimating(false);
      isAnimatingRef.current = false;
    });

    // API call (fire and forget)
    respondToMemo(memo.id, action).catch(console.error);
  }, [translateX, translateY]);
  
  // Keep handleAction for button presses
  const handleAction = useCallback((action: 'keep' | 'kick') => {
    performSwipe(action);
  }, [performSwipe]);

  // Pan responder for swipe gestures - uses refs to access current state
  const panResponder = useMemo(() => 
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isAnimatingRef.current,
      onMoveShouldSetPanResponder: (_, gestureState) => 
        !isAnimatingRef.current && Math.abs(gestureState.dx) > 5,
      onPanResponderGrant: () => {
        translateX.stopAnimation();
        translateY.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (!isAnimatingRef.current) {
          translateX.setValue(gestureState.dx);
          translateY.setValue(gestureState.dy * 0.2);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isAnimatingRef.current) return;
        
        // Check velocity and distance
        const shouldKeep = gestureState.dx > SWIPE_THRESHOLD || 
          (gestureState.dx > 40 && gestureState.vx > 0.3);
        const shouldKick = gestureState.dx < -SWIPE_THRESHOLD || 
          (gestureState.dx < -40 && gestureState.vx < -0.3);
        
        if (shouldKeep) {
          performSwipe('keep');
        } else if (shouldKick) {
          performSwipe('kick');
        } else {
          // Spring back
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              friction: 7,
              tension: 100,
              useNativeDriver: true,
            }),
            Animated.spring(translateY, {
              toValue: 0,
              friction: 7,
              tension: 100,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    }), [translateX, translateY, performSwipe]);

  const cardRotation = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  const keepIndicatorOpacity = translateX.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const kickIndicatorOpacity = translateX.interpolate({
    inputRange: [-100, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const handleGenerateMore = async () => {
    if (!topicId) return;
    setIsGenerating(true);
    try {
      console.log('[Feed] Generating more memos for topic:', topicId);
      const data = await generateMemos(topicId, 10);
      console.log('[Feed] Response data:', JSON.stringify(data));
      
      if (data.memos && data.memos.length > 0) {
        setMemos(prev => [...prev, ...data.memos]);
        // Add new memos to session total, reset completed
        setSessionTotal(prev => prev + data.memos.length);
        setCompletedCount(0);
      } else {
        alert('No new memos were generated. Try again.');
      }
    } catch (error: any) {
      console.error('Error generating:', error?.message || error);
      alert(`Generation failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  const currentMemo = memos[currentIndex];
  const hasMore = currentIndex < memos.length && currentMemo;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{topic?.title}</Text>
        <TouchableOpacity 
          onPress={() => router.push(`/topic/${topicId}/keeps`)} 
          style={styles.keepsButton}
        >
          <Ionicons name="bookmark" size={20} color="#c4dfc4" />
        </TouchableOpacity>
      </View>

      {/* Card Area */}
      <View style={styles.cardArea}>
        {hasMore ? (
          <Animated.View 
            {...panResponder.panHandlers}
            style={[
              styles.card, 
              {
                transform: [
                  { translateX },
                  { translateY },
                  { rotate: cardRotation },
                ],
              }
            ]}
          >
            {/* Swipe Indicators */}
            <Animated.View style={[styles.indicator, styles.keepIndicator, { opacity: keepIndicatorOpacity }]}>
              <Ionicons name="bookmark" size={24} color="#c4dfc4" />
            </Animated.View>
            <Animated.View style={[styles.indicator, styles.kickIndicator, { opacity: kickIndicatorOpacity }]}>
              <Ionicons name="close" size={24} color="#ff6b6b" />
            </Animated.View>

            <Text style={styles.cardText}>{currentMemo.content}</Text>
            
            {currentMemo.source === 'user' && (
              <Text style={styles.cardMeta}>Added by you</Text>
            )}
          </Animated.View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="bookmark-outline" size={48} color="#333" />
            <Text style={styles.emptyTitle}>All done!</Text>
            <TouchableOpacity
              style={styles.generateButton}
              onPress={handleGenerateMore}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <ActivityIndicator color="#c4dfc4" />
              ) : (
                <>
                  <Ionicons name="refresh" size={18} color="#c4dfc4" />
                  <Text style={styles.generateButtonText}>Generate More</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.keepsLinkButton}
              onPress={() => router.push(`/topic/${topicId}/keeps`)}
            >
              <Ionicons name="bookmark" size={18} color="#666" />
              <Text style={styles.keepsLinkText}>View Saved Memos</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      {hasMore && (
        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={[styles.actionButton, styles.kickButton]}
            onPress={() => handleAction('kick')}
          >
            <Ionicons name="close" size={24} color="#666" />
            <Text style={styles.kickButtonText}>Kick</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.keepButton]}
            onPress={() => handleAction('keep')}
          >
            <Ionicons name="bookmark" size={24} color="#c4dfc4" />
            <Text style={styles.keepButtonText}>Keep</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Progress Bar - fills up as you swipe */}
      {sessionTotal > 0 && (
        <View style={styles.progress}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${(completedCount / sessionTotal) * 100}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            {completedCount} of {sessionTotal} reviewed
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  keepsButton: {
    padding: 8,
    marginRight: -8,
  },
  cardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#111',
    borderRadius: 20,
    padding: 32,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    minHeight: 200,
    justifyContent: 'center',
  },
  cardText: {
    fontSize: 20,
    lineHeight: 30,
    color: '#fff',
    textAlign: 'center',
  },
  cardMeta: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
  },
  indicator: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keepIndicator: {
    right: -20,
    backgroundColor: 'rgba(196, 223, 196, 0.2)',
  },
  kickIndicator: {
    left: -20,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
  },
  emptyState: {
    alignItems: 'center',
    gap: 16,
  },
  emptyTitle: {
    fontSize: 18,
    color: '#666',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(196, 223, 196, 0.1)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  generateButtonText: {
    color: '#c4dfc4',
    fontSize: 15,
    fontWeight: '600',
  },
  keepsLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  keepsLinkText: {
    color: '#666',
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  kickButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#222',
  },
  kickButtonText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  keepButton: {
    backgroundColor: 'rgba(196, 223, 196, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(196, 223, 196, 0.3)',
  },
  keepButtonText: {
    color: '#c4dfc4',
    fontSize: 16,
    fontWeight: '600',
  },
  progress: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(196, 223, 196, 0.5)',
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
});

