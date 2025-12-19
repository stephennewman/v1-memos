import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/lib/auth-context';
import { submitOnboarding, TransformationProfile, DAILY_CATEGORIES } from '@/lib/guy-talk';

type OnboardingStep = 'intro' | 'recording' | 'processing' | 'review' | 'categories' | 'complete';

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [step, setStep] = useState<OnboardingStep>('intro');
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [profile, setProfile] = useState<TransformationProfile | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRecording) {
      // Pulse animation while recording
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
      
      // Duration counter
      durationInterval.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
    } else {
      pulseAnim.setValue(1);
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    }
    
    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      setError(null);
      
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('Microphone permission is required');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);
      setStep('recording');
    } catch (err: any) {
      console.error('[Onboarding] Recording error:', err);
      setError('Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      setStep('processing');
      
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) {
        setError('No recording found');
        setStep('intro');
        return;
      }

      // Convert to base64
      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Submit to API
      const result = await submitOnboarding(audioBase64);

      if (!result.success || !result.profile) {
        setError(result.error || 'Failed to process recording');
        setStep('intro');
        return;
      }

      setProfile(result.profile);
      setSelectedCategories(result.profile.preferences.categories);
      setStep('review');

    } catch (err: any) {
      console.error('[Onboarding] Stop recording error:', err);
      setError('Failed to process recording');
      setStep('intro');
    }
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const completeOnboarding = () => {
    // Update profile with selected categories if changed
    // For now, just navigate to main app
    setStep('complete');
    setTimeout(() => {
      router.replace('/(tabs)');
    }, 1500);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Intro Screen
  if (step === 'intro') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Let's Get Started</Text>
            <Text style={styles.subtitle}>
              Tell me about yourself - who you are, what you're working on, and what you want to change.
            </Text>
          </View>

          <View style={styles.promptContainer}>
            <Text style={styles.promptLabel}>Talk about things like:</Text>
            <View style={styles.promptList}>
              <Text style={styles.promptItem}>• Your roles (father, entrepreneur, etc.)</Text>
              <Text style={styles.promptItem}>• What you're struggling with</Text>
              <Text style={styles.promptItem}>• What you want to transform</Text>
              <Text style={styles.promptItem}>• Your values and faith (if relevant)</Text>
              <Text style={styles.promptItem}>• Who you want to become</Text>
            </View>
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
            <Ionicons name="mic" size={32} color="#fff" />
            <Text style={styles.recordButtonText}>Start Talking</Text>
          </TouchableOpacity>

          <Text style={styles.tipText}>
            Just speak naturally for 1-2 minutes. The more you share, the better I can help.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Recording Screen
  if (step === 'recording') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.recordingHeader}>
            <Text style={styles.recordingTitle}>I'm Listening...</Text>
            <Text style={styles.recordingDuration}>{formatDuration(recordingDuration)}</Text>
          </View>

          <Animated.View style={[styles.recordingIndicator, { transform: [{ scale: pulseAnim }] }]}>
            <Ionicons name="mic" size={48} color="#fff" />
          </Animated.View>

          <Text style={styles.recordingHint}>
            Share what's on your mind. When you're done, tap the button below.
          </Text>

          <TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
            <Ionicons name="stop" size={24} color="#fff" />
            <Text style={styles.stopButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Processing Screen
  if (step === 'processing') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={styles.processingText}>Understanding your goals...</Text>
          <Text style={styles.processingSubtext}>This takes about 10 seconds</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Review Screen
  if (step === 'review' && profile) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.reviewTitle}>Here's What I Heard</Text>
          
          <View style={styles.profileSection}>
            <Text style={styles.sectionTitle}>Who You Are</Text>
            <View style={styles.tagRow}>
              {profile.current_state.roles.map((role, i) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{role}</Text>
                </View>
              ))}
            </View>
            {profile.current_state.faith && (
              <Text style={styles.sectionDetail}>Faith: {profile.current_state.faith}</Text>
            )}
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.sectionTitle}>Current Struggles</Text>
            <View style={styles.tagRow}>
              {profile.current_state.struggles.map((struggle, i) => (
                <View key={i} style={[styles.tag, styles.struggleTag]}>
                  <Text style={styles.tagText}>{struggle}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.sectionTitle}>What You Want to Change</Text>
            <View style={styles.tagRow}>
              {profile.desired_state.transformations.map((t, i) => (
                <View key={i} style={[styles.tag, styles.goalTag]}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.profileSection}>
            <Text style={styles.sectionTitle}>Who You Want to Become</Text>
            <Text style={styles.visionText}>"{profile.desired_state.who_i_want_to_become}"</Text>
          </View>

          <TouchableOpacity style={styles.continueButton} onPress={() => setStep('categories')}>
            <Text style={styles.continueButtonText}>Looks Good</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.redoButton} onPress={() => setStep('intro')}>
            <Text style={styles.redoButtonText}>Start Over</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Categories Screen
  if (step === 'categories') {
    const allCategories = Object.entries(DAILY_CATEGORIES);
    
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.reviewTitle}>Daily Content</Text>
          <Text style={styles.categoriesSubtitle}>
            Select 3-5 categories for your daily inspiration
          </Text>

          <View style={styles.categoriesGrid}>
            {allCategories.map(([key, cat]) => {
              const isSelected = selectedCategories.includes(key);
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.categoryCard,
                    isSelected && { borderColor: cat.color, backgroundColor: `${cat.color}20` }
                  ]}
                  onPress={() => toggleCategory(key)}
                >
                  <Text style={styles.categoryIcon}>{cat.icon}</Text>
                  <Text style={styles.categoryLabel}>{cat.label}</Text>
                  {isSelected && (
                    <View style={[styles.categoryCheck, { backgroundColor: cat.color }]}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity 
            style={[
              styles.continueButton,
              selectedCategories.length < 3 && styles.continueButtonDisabled
            ]} 
            onPress={completeOnboarding}
            disabled={selectedCategories.length < 3}
          >
            <Text style={styles.continueButtonText}>
              {selectedCategories.length < 3 
                ? `Select ${3 - selectedCategories.length} more` 
                : "Let's Go"}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Complete Screen
  if (step === 'complete') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.completeIcon}>
            <Ionicons name="checkmark-circle" size={80} color="#22c55e" />
          </View>
          <Text style={styles.completeTitle}>You're All Set</Text>
          <Text style={styles.completeSubtitle}>Let's start your transformation</Text>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24,
  },
  promptContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
    width: '100%',
  },
  promptLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f97316',
    marginBottom: 12,
  },
  promptList: {
    gap: 8,
  },
  promptItem: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 22,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef444420',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    gap: 8,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f97316',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 16,
    gap: 12,
    width: '100%',
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  tipText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
  },
  // Recording styles
  recordingHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  recordingTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  recordingDuration: {
    fontSize: 48,
    fontWeight: '300',
    color: '#f97316',
    fontVariant: ['tabular-nums'],
  },
  recordingIndicator: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f97316',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  recordingHint: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 40,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Processing styles
  processingText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 24,
  },
  processingSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  // Review styles
  reviewTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 24,
  },
  profileSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionDetail: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  struggleTag: {
    backgroundColor: '#7f1d1d40',
  },
  goalTag: {
    backgroundColor: '#14532d40',
  },
  tagText: {
    fontSize: 14,
    color: '#fff',
  },
  visionText: {
    fontSize: 16,
    color: '#f97316',
    fontStyle: 'italic',
    lineHeight: 24,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f97316',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    marginTop: 24,
  },
  continueButtonDisabled: {
    backgroundColor: '#333',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  redoButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  redoButtonText: {
    color: '#666',
    fontSize: 14,
  },
  // Categories styles
  categoriesSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: '47%',
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    position: 'relative',
  },
  categoryIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
    textAlign: 'center',
  },
  categoryCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Complete styles
  completeIcon: {
    marginBottom: 24,
  },
  completeTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  completeSubtitle: {
    fontSize: 16,
    color: '#888',
  },
});

