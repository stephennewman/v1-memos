import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import type { VoiceEntryType } from '@/lib/types';
import { ENTRY_TYPE_CONFIG } from '@/lib/types';

type RecordingState = 'idle' | 'recording' | 'processing';

export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ type?: VoiceEntryType; autoStart?: string }>();
  
  // Auto-start recording if param is passed
  const shouldAutoStart = params.autoStart === 'true';
  const [state, setState] = useState<RecordingState>('idle');
  const [selectedType, setSelectedType] = useState<VoiceEntryType>(
    params.type || 'freeform'
  );
  const [processingStep, setProcessingStep] = useState('');
  const [createdEntryId, setCreatedEntryId] = useState<string | null>(null);

  // Handle autoStart param - skip type picker and go straight to recording
  React.useEffect(() => {
    if (shouldAutoStart && state === 'idle') {
      setState('recording');
    }
  }, [shouldAutoStart]);

  const handleRecordingComplete = async (uri: string, durationMs: number) => {
    if (!user) {
      Alert.alert('Error', 'Not authenticated');
      return;
    }

    setState('processing');
    setProcessingStep('Uploading audio...');

    try {
      // Read the audio file as base64
      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // Generate unique filename
      const fileName = `${user.id}/${Date.now()}.m4a`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('voice_recordings')
        .upload(fileName, decode(audioBase64), {
          contentType: 'audio/m4a',
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        // Continue without audio URL - we can still save the entry
      }

      // Get public URL if upload succeeded
      let audioUrl: string | undefined;
      if (uploadData) {
        const { data: urlData } = supabase.storage
          .from('voice_recordings')
          .getPublicUrl(fileName);
        audioUrl = urlData.publicUrl;
      }

      setProcessingStep('Creating entry...');

      // Create voice entry record
      const { data: entry, error: entryError } = await supabase
        .from('voice_entries')
        .insert({
          user_id: user.id,
          audio_url: audioUrl,
          audio_duration_seconds: Math.round(durationMs / 1000),
          entry_type: selectedType,
          is_processed: false,
        })
        .select()
        .single();

      if (entryError) throw entryError;
      
      setCreatedEntryId(entry.id);
      setProcessingStep('Processing...');

      // Navigate to entry detail page immediately (1-2 second delay for UX)
      // The detail page has skeleton loaders and polls for updates
      setTimeout(() => {
        router.replace(`/entry/${entry.id}`);
      }, 1500);

      // Start transcription in background (fire and forget)
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://www.outcomeview.com';
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session && audioUrl) {
          // Don't await - let it run in background
          fetch(`${apiUrl}/api/voice/transcribe`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              audio_url: audioUrl,
              entry_id: entry.id,
            }),
          }).catch(err => console.log('Background transcription error:', err));
        }
      } catch (apiError) {
        console.log('AI processing skipped:', apiError);
      }

    } catch (error) {
      console.error('Error saving recording:', error);
      Alert.alert('Error', 'Failed to save recording. Please try again.');
      setState('idle');
    }
  };

  const handleCancel = () => {
    router.back();
  };

  // Helper to decode base64 to Uint8Array for upload
  const decode = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  if (state === 'processing') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#c4dfc4" />
          <Text style={styles.processingText}>{processingStep}</Text>
        </View>
      </View>
    );
  }


  if (state === 'recording') {
    const isPersonal = selectedType !== 'meeting';
    
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          
          {/* Type Toggle */}
          <View style={styles.typeToggle}>
            <TouchableOpacity
              style={[
                styles.toggleOption,
                isPersonal && styles.toggleOptionActive,
              ]}
              onPress={() => setSelectedType('freeform')}
            >
              <Ionicons name="mic" size={14} color={isPersonal ? '#0a0a0a' : '#666'} />
              <Text style={[styles.toggleText, isPersonal && styles.toggleTextActive]}>
                Individual
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleOption,
                !isPersonal && styles.toggleOptionActive,
                !isPersonal && { backgroundColor: '#60a5fa' },
              ]}
              onPress={() => setSelectedType('meeting')}
            >
              <Ionicons name="people" size={14} color={!isPersonal ? '#0a0a0a' : '#666'} />
              <Text style={[styles.toggleText, !isPersonal && styles.toggleTextActive]}>
                Group
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <VoiceRecorder
          onRecordingComplete={handleRecordingComplete}
          onCancel={handleCancel}
          maxDuration={1800}
          autoStart={shouldAutoStart}
        />
      </View>
    );
  }

  // Idle state - show type picker
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Voice Note</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Type Selection */}
        <Text style={styles.sectionTitle}>What kind of note?</Text>
        <View style={styles.typeGrid}>
          {(Object.keys(ENTRY_TYPE_CONFIG) as VoiceEntryType[]).map((type) => {
            const config = ENTRY_TYPE_CONFIG[type];
            const isSelected = selectedType === type;
            
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeCard,
                  isSelected && styles.typeCardSelected,
                  isSelected && { borderColor: config.color },
                ]}
                onPress={() => setSelectedType(type)}
              >
                <View style={[styles.typeIcon, { backgroundColor: `${config.color}20` }]}>
                  <Ionicons name={config.icon as any} size={24} color={config.color} />
                </View>
                <Text style={styles.typeLabel}>{config.label}</Text>
                {isSelected && (
                  <View style={[styles.checkmark, { backgroundColor: config.color }]}>
                    <Ionicons name="checkmark" size={12} color="#0a0a0a" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Start Recording Button */}
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => setState('recording')}
        >
          <Ionicons name="mic" size={28} color="#0a0a0a" />
          <Text style={styles.startButtonText}>Start Recording</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Speak naturally. We'll extract tasks, dates, and questions automatically.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
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
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  typeText: {
    fontSize: 13,
    fontWeight: '500',
  },
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 3,
  },
  toggleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 17,
  },
  toggleOptionActive: {
    backgroundColor: '#c4dfc4',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  toggleTextActive: {
    color: '#0a0a0a',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 15,
    color: '#888',
    marginBottom: 16,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  typeCard: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: '#111',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeCardSelected: {
    backgroundColor: '#151515',
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeLabel: {
    fontSize: 12,
    color: '#888',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#c4dfc4',
    paddingVertical: 18,
    borderRadius: 16,
    marginBottom: 16,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  hint: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  processingText: {
    fontSize: 16,
    color: '#888',
    marginTop: 16,
  },
});

