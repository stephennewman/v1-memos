import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { ChunkedVoiceRecorder } from '@/components/ChunkedVoiceRecorder';
import { ProcessingAnimation } from '@/components/ProcessingAnimation';

type RecordingState = 'loading' | 'recording' | 'processing';

export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoading } = useAuth();
  const params = useLocalSearchParams<{ autoStart?: string }>();

  // Wait for user to load before recording
  const [state, setState] = useState<RecordingState>('loading');
  const [processingStep, setProcessingStep] = useState('');

  // Start recording once user is loaded
  useEffect(() => {
    if (!isLoading && user) {
      setState('recording');
    } else if (!isLoading && !user) {
      Alert.alert('Error', 'Please sign in to record');
      router.back();
    }
  }, [isLoading, user]);

  const handleRecordingComplete = async (chunkUrls: string[], totalDurationMs: number, sessionId: string) => {
    if (!user) {
      Alert.alert('Error', 'Not authenticated');
      return;
    }

    setState('processing');
    setProcessingStep('Saving recording...');

    try {
      // Use first chunk URL as the main audio URL
      const audioUrl = chunkUrls[0];

      setProcessingStep('Creating entry...');

      // Create voice entry record with chunk info
      const { data: entry, error: entryError } = await supabase
        .from('voice_entries')
        .insert({
          user_id: user.id,
          audio_url: audioUrl,
          audio_duration_seconds: Math.round(totalDurationMs / 1000),
          entry_type: 'freeform', // Default type - AI will categorize
          is_processed: false,
          metadata: {
            session_id: sessionId,
            chunk_urls: chunkUrls,
            chunk_count: chunkUrls.length,
            is_chunked: chunkUrls.length > 1,
          },
        })
        .select()
        .single();

      if (entryError) throw entryError;

      // Navigate IMMEDIATELY - entry page will show progress
      router.replace(`/entry/${entry.id}`);

      // Start transcription in background (fire and forget)
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://www.outcomeview.com';

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session && chunkUrls.length > 0) {
          // Use chunked transcription endpoint if multiple chunks
          const endpoint = chunkUrls.length > 1 
            ? `${apiUrl}/api/voice/transcribe-chunked`
            : `${apiUrl}/api/voice/transcribe`;

          const body = chunkUrls.length > 1
            ? {
                chunk_urls: chunkUrls,
                entry_id: entry.id,
                session_id: sessionId,
              }
            : {
                audio_url: audioUrl,
                entry_id: entry.id,
              };

          // Don't await - let it run in background
          fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(body),
          }).catch(err => console.log('Background transcription error:', err));
        }
      } catch (apiError) {
        console.log('AI processing skipped:', apiError);
      }

    } catch (error) {
      console.error('Error saving recording:', error);
      Alert.alert('Error', 'Failed to save recording. Please try again.');
      router.back();
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (state === 'loading') {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
        <Text style={styles.loadingText}>Preparing...</Text>
      </View>
    );
  }

  if (state === 'processing') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ProcessingAnimation step={processingStep} />
      </View>
    );
  }

  // Recording state - simple, clean interface
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Minimal Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recording</Text>
        <View style={{ width: 40 }} />
      </View>

      <ChunkedVoiceRecorder
        onRecordingComplete={handleRecordingComplete}
        onCancel={handleCancel}
        maxDuration={7200}
        autoStart={true}
        userId={user?.id || ''}
      />
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
  loadingText: {
    color: '#666',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
});
