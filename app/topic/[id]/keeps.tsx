import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import type { Memo } from '@/lib/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;

export default function KeepsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: topicId } = useLocalSearchParams<{ id: string }>();

  const [topicTitle, setTopicTitle] = useState('');
  const [keeps, setKeeps] = useState<Memo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showAddMemo, setShowAddMemo] = useState(false);
  const [newMemoContent, setNewMemoContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Progress tracking
  const [sessionTotal, setSessionTotal] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);

  // Animation values
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Refs for pan responder
  const isAnimatingRef = useRef(isAnimating);
  const keepsRef = useRef(keeps);
  const currentIndexRef = useRef(currentIndex);

  useEffect(() => { isAnimatingRef.current = isAnimating; }, [isAnimating]);
  useEffect(() => { keepsRef.current = keeps; }, [keeps]);
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

      const { data: topic } = await supabase
        .from('memo_topics')
        .select('title')
        .eq('id', topicId)
        .single();

      setTopicTitle(topic?.title || '');

      const { data: keepsData } = await supabase
        .from('memos')
        .select('*')
        .eq('topic_id', topicId)
        .eq('status', 'kept')
        .order('actioned_at', { ascending: false });

      const loadedKeeps = keepsData || [];
      setKeeps(loadedKeeps);
      setCurrentIndex(0);
      
      if (loadedKeeps.length > 0) {
        setSessionTotal(loadedKeeps.length);
        setReviewedCount(0);
      }

      const { count } = await supabase
        .from('memos')
        .select('*', { count: 'exact', head: true })
        .eq('topic_id', topicId)
        .eq('status', 'active');

      setActiveCount(count || 0);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const performSwipe = useCallback((action: 'keep' | 'remove') => {
    const currentKeeps = keepsRef.current;
    const idx = currentIndexRef.current;
    const memo = currentKeeps[idx];

    if (!memo || isAnimatingRef.current) return;

    setIsAnimating(true);
    isAnimatingRef.current = true;

    const toValue = action === 'keep' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;

    Animated.timing(translateX, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      translateX.setValue(0);
      translateY.setValue(0);

      if (action === 'remove') {
        // Kick the memo
        supabase
          .from('memos')
          .update({ status: 'kicked', actioned_at: new Date().toISOString() })
          .eq('id', memo.id)
          .then(() => {});
        
        setKeeps(prev => prev.filter((_, i) => i !== idx));
      } else {
        // Just move to next card
        setCurrentIndex(prev => prev + 1);
      }

      setReviewedCount(prev => prev + 1);
      setIsAnimating(false);
      isAnimatingRef.current = false;
    });
  }, [translateX, translateY]);

  const handleAction = useCallback((action: 'keep' | 'remove') => {
    performSwipe(action);
  }, [performSwipe]);

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

        const shouldKeep = gestureState.dx > SWIPE_THRESHOLD ||
          (gestureState.dx > 40 && gestureState.vx > 0.3);
        const shouldRemove = gestureState.dx < -SWIPE_THRESHOLD ||
          (gestureState.dx < -40 && gestureState.vx < -0.3);

        if (shouldKeep) {
          performSwipe('keep');
        } else if (shouldRemove) {
          performSwipe('remove');
        } else {
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

  const removeIndicatorOpacity = translateX.interpolate({
    inputRange: [-100, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const addMemo = async () => {
    if (!newMemoContent.trim() || !topicId) return;

    setIsAdding(true);
    try {
      const { data, error } = await supabase
        .from('memos')
        .insert({
          topic_id: topicId,
          content: newMemoContent.trim(),
          source: 'user',
          status: 'kept',
          actioned_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!error && data) {
        setKeeps(prev => [data, ...prev]);
        setCurrentIndex(0);
        setSessionTotal(prev => prev + 1);
      }
      setNewMemoContent('');
      setShowAddMemo(false);
    } catch (error) {
      console.error('Error adding memo:', error);
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#f5a623" />
      </View>
    );
  }

  const currentMemo = keeps[currentIndex];
  const hasMore = currentIndex < keeps.length && currentMemo;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{topicTitle}</Text>
          <Text style={styles.headerSubtitle}>Saved Memos</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => setShowAddMemo(true)} style={styles.addButton}>
            <Ionicons name="add" size={24} color="#f5a623" />
          </TouchableOpacity>
          {activeCount > 0 && (
            <TouchableOpacity
              onPress={() => router.replace(`/topic/${topicId}`)}
              style={styles.activeButton}
            >
              <Text style={styles.activeButtonText}>{activeCount} new</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Add Memo Modal */}
      <Modal
        visible={showAddMemo}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddMemo(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddMemo(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Memo</Text>
            <TouchableOpacity onPress={addMemo} disabled={!newMemoContent.trim() || isAdding}>
              <Text style={[styles.modalSave, (!newMemoContent.trim() || isAdding) && styles.modalSaveDisabled]}>
                {isAdding ? 'Adding...' : 'Add'}
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalInput}
            placeholder="Type a quote, fact, or insight..."
            placeholderTextColor="#666"
            value={newMemoContent}
            onChangeText={setNewMemoContent}
            multiline
            autoFocus
          />
        </View>
      </Modal>

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
              <Ionicons name="bookmark" size={24} color="#f5a623" />
            </Animated.View>
            <Animated.View style={[styles.indicator, styles.removeIndicator, { opacity: removeIndicatorOpacity }]}>
              <Ionicons name="close" size={24} color="#ff6b6b" />
            </Animated.View>

            <Text style={styles.cardText}>{currentMemo.content}</Text>

            {currentMemo.source === 'user' && (
              <Text style={styles.cardMeta}>Added by you</Text>
            )}
          </Animated.View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="bookmark" size={48} color="rgba(245, 166, 35, 0.3)" />
            <Text style={styles.emptyTitle}>
              {keeps.length === 0 ? 'No saved memos yet' : 'All reviewed!'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {keeps.length === 0 ? 'Swipe right on memos to save them here' : 'Great job reinforcing your learning'}
            </Text>
            <TouchableOpacity
              style={styles.backToFeedButton}
              onPress={() => router.replace(`/topic/${topicId}`)}
            >
              <Ionicons name="arrow-back" size={18} color="#c4dfc4" />
              <Text style={styles.backToFeedText}>Back to Feed</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      {hasMore && (
        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity
            style={[styles.actionButton, styles.removeButton]}
            onPress={() => handleAction('remove')}
          >
            <Ionicons name="close" size={24} color="#666" />
            <Text style={styles.removeButtonText}>Remove</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.keepButton]}
            onPress={() => handleAction('keep')}
          >
            <Ionicons name="bookmark" size={24} color="#f5a623" />
            <Text style={styles.keepButtonText}>Keep</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Progress */}
      {sessionTotal > 0 && (
        <View style={styles.progress}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${(reviewedCount / sessionTotal) * 100}%` }
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {reviewedCount} of {sessionTotal} reviewed
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
  headerCenter: {
    flex: 1,
    marginHorizontal: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#f5a623',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButton: {
    padding: 8,
  },
  activeButton: {
    backgroundColor: 'rgba(196, 223, 196, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  activeButtonText: {
    color: '#c4dfc4',
    fontSize: 13,
    fontWeight: '600',
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
    backgroundColor: 'rgba(245, 166, 35, 0.05)',
    borderRadius: 20,
    padding: 32,
    borderWidth: 2,
    borderColor: 'rgba(245, 166, 35, 0.3)',
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
    backgroundColor: 'rgba(245, 166, 35, 0.2)',
  },
  removeIndicator: {
    left: -20,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
  },
  emptyState: {
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  backToFeedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(196, 223, 196, 0.1)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  backToFeedText: {
    color: '#c4dfc4',
    fontSize: 15,
    fontWeight: '600',
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
  removeButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#222',
  },
  removeButtonText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  keepButton: {
    backgroundColor: 'rgba(245, 166, 35, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 166, 35, 0.3)',
  },
  keepButtonText: {
    color: '#f5a623',
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
    backgroundColor: 'rgba(245, 166, 35, 0.5)',
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  modalCancel: {
    fontSize: 16,
    color: '#666',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  modalSave: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f5a623',
  },
  modalSaveDisabled: {
    opacity: 0.5,
  },
  modalInput: {
    flex: 1,
    padding: 16,
    fontSize: 18,
    color: '#fff',
    textAlignVertical: 'top',
  },
});
