import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Animated,
  Alert,
  Dimensions,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_COUNT = 40;
const BAR_WIDTH = 3;
const BAR_GAP = 3;
const MAX_BAR_HEIGHT = 120;
const MIN_BAR_HEIGHT = 4;

// Chunk duration in seconds (5 minutes)
const CHUNK_DURATION_SECONDS = 300;

interface ChunkedVoiceRecorderProps {
  onRecordingComplete: (chunkUrls: string[], totalDurationMs: number, sessionId: string) => void;
  onCancel?: () => void;
  maxDuration?: number; // Total max duration in seconds (default: unlimited)
  autoStart?: boolean;
  userId: string;
}

interface ChunkInfo {
  url: string;
  durationMs: number;
  index: number;
}

export function ChunkedVoiceRecorder({ 
  onRecordingComplete, 
  onCancel,
  maxDuration = 7200, // 2 hours default max
  autoStart = false,
  userId,
}: ChunkedVoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(autoStart);
  const [isInitializing, setIsInitializing] = useState(autoStart);
  const [isPaused, setIsPaused] = useState(false);
  const [isUploadingChunk, setIsUploadingChunk] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);
  const [currentChunkDuration, setCurrentChunkDuration] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoStartedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const wasRecordingBeforeBackground = useRef(false);
  
  // Session tracking
  const sessionIdRef = useRef<string>(`${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const chunksRef = useRef<ChunkInfo[]>([]);
  const isStoppingRef = useRef(false);
  const chunkStartTimeRef = useRef<number>(0);
  
  // Waveform data
  const [waveformData, setWaveformData] = useState<number[]>(
    Array(BAR_COUNT).fill(MIN_BAR_HEIGHT)
  );
  
  const barAnimations = useRef<Animated.Value[]>(
    Array(BAR_COUNT).fill(null).map(() => new Animated.Value(MIN_BAR_HEIGHT))
  ).current;

  const glowAnim = useRef(new Animated.Value(0)).current;

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      console.log('[ChunkedRecorder] App state changed:', appStateRef.current, '->', nextAppState);
      
      if (appStateRef.current === 'active' && nextAppState.match(/inactive|background/)) {
        if (isRecording && recordingRef.current) {
          wasRecordingBeforeBackground.current = true;
          console.log('[ChunkedRecorder] App backgrounded while recording - continuing');
        }
      } else if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        if (wasRecordingBeforeBackground.current && recordingRef.current) {
          console.log('[ChunkedRecorder] App foregrounded - checking recording status');
          try {
            const status = await recordingRef.current.getStatusAsync();
            if (!status.isRecording) {
              console.log('[ChunkedRecorder] Recording stopped in background - saving chunk and continuing');
              await handleChunkInterrupted();
            }
          } catch (e) {
            console.error('[ChunkedRecorder] Error checking status:', e);
            await handleChunkInterrupted();
          }
        }
        wasRecordingBeforeBackground.current = false;
      }
      
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isRecording]);

  // Handle chunk interruption - save what we have and start new chunk
  const handleChunkInterrupted = async () => {
    if (!recordingRef.current || isStoppingRef.current) return;
    
    console.log('[ChunkedRecorder] Handling interrupted chunk...');
    setIsPaused(true);
    
    try {
      const uri = recordingRef.current.getURI();
      
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {
        console.log('[ChunkedRecorder] Recording already stopped');
      }
      
      recordingRef.current = null;
      
      // Upload the interrupted chunk if we have it
      if (uri) {
        const chunkDuration = Date.now() - chunkStartTimeRef.current;
        if (chunkDuration > 1000) { // At least 1 second
          await uploadChunk(uri, chunkDuration);
        }
      }
      
      // Start a new chunk
      setIsPaused(false);
      await startNewChunk();
      
    } catch (err) {
      console.error('[ChunkedRecorder] Error handling interrupted chunk:', err);
      setIsPaused(false);
    }
  };

  // Upload a completed chunk with retry
  const uploadChunk = async (uri: string, durationMs: number, retryCount = 0): Promise<string | null> => {
    const MAX_RETRIES = 3;
    const chunkIndex = chunksRef.current.length;
    
    console.log(`[ChunkedRecorder] Uploading chunk ${chunkIndex}... (attempt ${retryCount + 1})`);
    setIsUploadingChunk(true);
    
    // Validate userId
    if (!userId) {
      console.error('[ChunkedRecorder] No userId - cannot upload');
      setIsUploadingChunk(false);
      return null;
    }
    
    try {
      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      
      const fileName = `${userId}/${sessionIdRef.current}/chunk_${chunkIndex}.m4a`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('voice_recordings')
        .upload(fileName, decode(audioBase64), {
          contentType: 'audio/m4a',
        });
      
      if (uploadError) {
        console.error('[ChunkedRecorder] Chunk upload error:', uploadError);
        
        // Retry on failure
        if (retryCount < MAX_RETRIES) {
          console.log(`[ChunkedRecorder] Retrying upload... (${retryCount + 1}/${MAX_RETRIES})`);
          await new Promise(r => setTimeout(r, 1000 * (retryCount + 1))); // Exponential backoff
          return uploadChunk(uri, durationMs, retryCount + 1);
        }
        
        setIsUploadingChunk(false);
        return null;
      }
      
      const { data: urlData } = supabase.storage
        .from('voice_recordings')
        .getPublicUrl(fileName);
      
      const chunkUrl = urlData.publicUrl;
      
      chunksRef.current.push({
        url: chunkUrl,
        durationMs,
        index: chunkIndex,
      });
      
      setChunkCount(chunksRef.current.length);
      console.log('[ChunkedRecorder] Chunk uploaded successfully:', chunkIndex);
      
      setIsUploadingChunk(false);
      return chunkUrl;
      
    } catch (err) {
      console.error('[ChunkedRecorder] Error uploading chunk:', err);
      
      // Retry on failure
      if (retryCount < MAX_RETRIES) {
        console.log(`[ChunkedRecorder] Retrying upload... (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
        return uploadChunk(uri, durationMs, retryCount + 1);
      }
      
      setIsUploadingChunk(false);
      return null;
    }
  };

  // Helper to decode base64
  const decode = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  // Request permissions and auto-start
  useEffect(() => {
    let mounted = true;
    
    (async () => {
      // Wait for userId before starting
      if (!userId) {
        console.log('[ChunkedRecorder] Waiting for userId...');
        return;
      }
      
      const { status } = await Audio.requestPermissionsAsync();
      if (!mounted) return;
      
      const granted = status === 'granted';
      setPermissionGranted(granted);
      
      if (!granted) {
        setIsRecording(false);
        setIsInitializing(false);
        Alert.alert(
          'Microphone Permission Required',
          'Please enable microphone access in your device settings to record voice notes.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      if (autoStart && !hasAutoStartedRef.current) {
        hasAutoStartedRef.current = true;
        await startNewChunk();
      }
    })();
    
    return () => { mounted = false; };
  }, [autoStart, userId]);

  // Glow animation
  useEffect(() => {
    if (isRecording && !isPaused) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else {
      glowAnim.stopAnimation();
      glowAnim.setValue(0);
    }
  }, [isRecording, isPaused, glowAnim]);

  // Auto-chunk at CHUNK_DURATION_SECONDS
  useEffect(() => {
    if (currentChunkDuration >= CHUNK_DURATION_SECONDS && isRecording && !isStoppingRef.current) {
      console.log('[ChunkedRecorder] Chunk duration reached, rotating...');
      rotateChunk();
    }
  }, [currentChunkDuration, isRecording]);

  // Auto-stop at max duration
  useEffect(() => {
    if (totalDuration >= maxDuration && isRecording) {
      console.log('[ChunkedRecorder] Max duration reached, stopping');
      stopRecording();
    }
  }, [totalDuration, maxDuration, isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (meteringRef.current) clearInterval(meteringRef.current);
      if (statusCheckRef.current) clearInterval(statusCheckRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // Update metering
  const updateMetering = useCallback(async () => {
    if (!recordingRef.current) return;
    
    try {
      const status = await recordingRef.current.getStatusAsync();
      if (status.isRecording && status.metering !== undefined) {
        const db = status.metering;
        const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
        const baseHeight = MIN_BAR_HEIGHT + normalized * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
        
        setWaveformData(prev => {
          const newData = [...prev];
          for (let i = 0; i < BAR_COUNT - 1; i++) {
            newData[i] = prev[i + 1];
          }
          const variation = 0.7 + Math.random() * 0.6;
          newData[BAR_COUNT - 1] = Math.max(MIN_BAR_HEIGHT, baseHeight * variation);
          return newData;
        });
      }
    } catch (e) {
      // Ignore
    }
  }, []);

  // Animate bars
  useEffect(() => {
    waveformData.forEach((height, index) => {
      Animated.spring(barAnimations[index], {
        toValue: height,
        friction: 8,
        tension: 100,
        useNativeDriver: false,
      }).start();
    });
  }, [waveformData, barAnimations]);

  // Start a new chunk
  const startNewChunk = async () => {
    try {
      console.log('[ChunkedRecorder] Starting new chunk...');
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: false,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        playThroughEarpieceAndroid: false,
      });

      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        }
      );
      
      console.log('[ChunkedRecorder] Chunk started');
      recordingRef.current = recording;
      chunkStartTimeRef.current = Date.now();
      setIsRecording(true);
      setIsInitializing(false);
      setCurrentChunkDuration(0);

      // Clear existing timers
      if (timerRef.current) clearInterval(timerRef.current);
      if (meteringRef.current) clearInterval(meteringRef.current);
      if (statusCheckRef.current) clearInterval(statusCheckRef.current);

      // Start timer
      timerRef.current = setInterval(() => {
        setTotalDuration(d => d + 1);
        setCurrentChunkDuration(d => d + 1);
      }, 1000);

      // Start metering
      meteringRef.current = setInterval(updateMetering, 50);

      // Status check
      statusCheckRef.current = setInterval(async () => {
        if (!recordingRef.current || isStoppingRef.current) return;
        
        try {
          const status = await recordingRef.current.getStatusAsync();
          if (!status.isRecording && isRecording) {
            console.log('[ChunkedRecorder] Chunk stopped unexpectedly');
            await handleChunkInterrupted();
          }
        } catch (e) {
          console.error('[ChunkedRecorder] Status check error:', e);
        }
      }, 2000);

    } catch (err: any) {
      console.error('[ChunkedRecorder] Failed to start chunk:', err);
      setIsRecording(false);
      setIsInitializing(false);
      Alert.alert('Recording Error', 'Failed to start recording. Please try again.');
    }
  };

  // Rotate to next chunk (seamless)
  const rotateChunk = async () => {
    if (!recordingRef.current || isStoppingRef.current) return;
    
    console.log('[ChunkedRecorder] Rotating chunk...');
    
    try {
      // Stop current chunk
      if (timerRef.current) clearInterval(timerRef.current);
      if (meteringRef.current) clearInterval(meteringRef.current);
      if (statusCheckRef.current) clearInterval(statusCheckRef.current);
      
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      const chunkDuration = Date.now() - chunkStartTimeRef.current;
      
      recordingRef.current = null;
      
      // Upload in background, start new chunk immediately
      if (uri) {
        uploadChunk(uri, chunkDuration).catch(err => {
          console.error('[ChunkedRecorder] Background upload error:', err);
        });
      }
      
      // Start new chunk
      setCurrentChunkDuration(0);
      await startNewChunk();
      
    } catch (err) {
      console.error('[ChunkedRecorder] Error rotating chunk:', err);
      // Try to recover by starting new chunk
      await startNewChunk();
    }
  };

  const startRecording = async () => {
    if (!permissionGranted) {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed to record.');
        return;
      }
      setPermissionGranted(true);
    }

    // Reset session
    sessionIdRef.current = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    chunksRef.current = [];
    setChunkCount(0);
    setTotalDuration(0);
    
    await startNewChunk();
  };

  const stopRecording = async () => {
    if (!recordingRef.current || isStoppingRef.current) return;
    
    isStoppingRef.current = true;
    console.log('[ChunkedRecorder] Stopping recording...');

    try {
      // Clear all intervals
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (meteringRef.current) {
        clearInterval(meteringRef.current);
        meteringRef.current = null;
      }
      if (statusCheckRef.current) {
        clearInterval(statusCheckRef.current);
        statusCheckRef.current = null;
      }

      setIsRecording(false);
      
      // Stop and save final chunk
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      const chunkDuration = Date.now() - chunkStartTimeRef.current;
      
      recordingRef.current = null;

      // Reset waveform
      setWaveformData(Array(BAR_COUNT).fill(MIN_BAR_HEIGHT));

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      // Upload final chunk (wait for it)
      if (uri && chunkDuration > 1000) {
        console.log('[ChunkedRecorder] Uploading final chunk...');
        const finalUrl = await uploadChunk(uri, chunkDuration);
        if (!finalUrl) {
          console.warn('[ChunkedRecorder] Final chunk upload failed');
        }
      }

      // Calculate total duration from chunks
      const totalMs = chunksRef.current.reduce((sum, c) => sum + c.durationMs, 0);
      const chunkUrls = chunksRef.current.map(c => c.url);
      
      console.log('[ChunkedRecorder] Recording complete:', {
        chunks: chunkUrls.length,
        totalMs,
        sessionId: sessionIdRef.current,
      });

      if (chunkUrls.length > 0) {
        onRecordingComplete(chunkUrls, totalMs, sessionIdRef.current);
      } else {
        // No chunks uploaded - critical error
        Alert.alert(
          'Upload Failed', 
          'Could not save your recording. Please check your internet connection and try again.',
          [{ text: 'OK', onPress: onCancel }]
        );
      }

    } catch (err) {
      console.error('[ChunkedRecorder] Failed to stop recording:', err);
      Alert.alert('Error', 'Failed to save recording.');
    } finally {
      isStoppingRef.current = false;
    }
  };

  const cancelRecording = async () => {
    isStoppingRef.current = true;
    
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {}
      recordingRef.current = null;
    }
    
    if (timerRef.current) clearInterval(timerRef.current);
    if (meteringRef.current) clearInterval(meteringRef.current);
    if (statusCheckRef.current) clearInterval(statusCheckRef.current);
    timerRef.current = null;
    meteringRef.current = null;
    statusCheckRef.current = null;
    
    setIsRecording(false);
    setTotalDuration(0);
    setCurrentChunkDuration(0);
    setWaveformData(Array(BAR_COUNT).fill(MIN_BAR_HEIGHT));
    
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
    
    // Clean up uploaded chunks
    // Note: In production, you might want to delete the uploaded chunks from storage
    chunksRef.current = [];
    setChunkCount(0);
    
    isStoppingRef.current = false;
    onCancel?.();
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  return (
    <View style={styles.container}>
      {/* Timer */}
      <View style={styles.timerContainer}>
        {isRecording && (
          <View style={[styles.recordingBadge, isPaused && styles.pausedBadge]}>
            <View style={[styles.recordingDot, isPaused && styles.pausedDot]} />
            <Text style={[styles.recordingLabel, isPaused && styles.pausedLabel]}>
              {isPaused ? 'SAVING...' : 'REC'}
            </Text>
          </View>
        )}
        <Text style={styles.timer}>{formatTime(totalDuration)}</Text>
        {maxDuration < 99999 && (
          <Text style={styles.maxDuration}>/ {formatTime(maxDuration)}</Text>
        )}
      </View>

      {/* Chunk indicator */}
      {isRecording && chunkCount > 0 && (
        <View style={styles.chunkIndicator}>
          <Ionicons name="cloud-done" size={14} color="#4ade80" />
          <Text style={styles.chunkText}>
            {chunkCount} chunk{chunkCount !== 1 ? 's' : ''} saved
          </Text>
          {isUploadingChunk && (
            <Text style={styles.uploadingText}>uploading...</Text>
          )}
        </View>
      )}

      {/* Waveform Visualizer */}
      <View style={styles.waveformContainer}>
        <View style={styles.waveform}>
          {barAnimations.map((anim, index) => (
            <Animated.View
              key={index}
              style={[
                styles.bar,
                {
                  height: anim,
                  backgroundColor: isRecording && !isPaused
                    ? `rgba(196, 223, 196, ${0.4 + (index / BAR_COUNT) * 0.6})`
                    : '#333',
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.centerLine} />
      </View>

      {/* Stop/Start Button */}
      <View style={styles.buttonContainer}>
        {isRecording ? (
          <TouchableOpacity
            style={styles.stopButtonWrapper}
            onPress={stopRecording}
            activeOpacity={0.8}
          >
            <Animated.View
              style={[
                styles.stopButtonGlow,
                {
                  opacity: glowOpacity,
                  transform: [{ scale: glowScale }],
                },
              ]}
            />
            <View style={styles.stopButton}>
              <View style={styles.stopIcon} />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.startButton}
            onPress={startRecording}
            activeOpacity={0.8}
          >
            <Ionicons name="mic" size={32} color="#0a0a0a" />
          </TouchableOpacity>
        )}
      </View>

      {/* Hint */}
      <Text style={styles.hint}>
        {isInitializing 
          ? 'Starting...' 
          : isRecording 
            ? 'Tap to stop • Recording saves in chunks' 
            : 'Tap to start recording'}
      </Text>

      {/* Cancel Button */}
      {onCancel && (
        <TouchableOpacity 
          style={styles.cancelButton} 
          onPress={cancelRecording}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 24,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 12,
  },
  pausedBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 6,
  },
  pausedDot: {
    backgroundColor: '#fbbf24',
  },
  recordingLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ef4444',
    letterSpacing: 1,
  },
  pausedLabel: {
    color: '#fbbf24',
  },
  timer: {
    fontSize: 48,
    fontWeight: '200',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  maxDuration: {
    fontSize: 16,
    color: '#444',
    marginLeft: 8,
    fontVariant: ['tabular-nums'],
  },
  chunkIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 16,
  },
  chunkText: {
    fontSize: 12,
    color: '#4ade80',
    fontWeight: '500',
  },
  uploadingText: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
  },
  waveformContainer: {
    width: '100%',
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 32,
    position: 'relative',
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: MAX_BAR_HEIGHT,
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    minHeight: MIN_BAR_HEIGHT,
  },
  centerLine: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: '#222',
  },
  buttonContainer: {
    marginBottom: 24,
  },
  stopButtonWrapper: {
    width: 88,
    height: 88,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButtonGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#ef4444',
  },
  stopButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  stopIcon: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  startButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#c4dfc4',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#c4dfc4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  hint: {
    fontSize: 15,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
  },
  cancelButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  cancelText: {
    color: '#666',
    fontSize: 16,
  },
});
