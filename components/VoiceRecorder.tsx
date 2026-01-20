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
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_COUNT = 40;
const BAR_WIDTH = 3;
const BAR_GAP = 3;
const MAX_BAR_HEIGHT = 120;
const MIN_BAR_HEIGHT = 4;

interface VoiceRecorderProps {
  onRecordingComplete: (uri: string, durationMs: number) => void;
  onCancel?: () => void;
  maxDuration?: number;
  autoStart?: boolean;
}

export function VoiceRecorder({ 
  onRecordingComplete, 
  onCancel,
  maxDuration = 1800,
  autoStart = false,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(autoStart);
  const [isInitializing, setIsInitializing] = useState(autoStart);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoStartedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const wasRecordingBeforeBackground = useRef(false);
  
  // Waveform data - array of heights for each bar
  const [waveformData, setWaveformData] = useState<number[]>(
    Array(BAR_COUNT).fill(MIN_BAR_HEIGHT)
  );
  
  // Animated values for each bar
  const barAnimations = useRef<Animated.Value[]>(
    Array(BAR_COUNT).fill(null).map(() => new Animated.Value(MIN_BAR_HEIGHT))
  ).current;

  // Glow animation for the stop button
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      console.log('[VoiceRecorder] App state changed:', appStateRef.current, '->', nextAppState);
      
      if (appStateRef.current === 'active' && nextAppState.match(/inactive|background/)) {
        // App going to background - recording should continue with background audio mode
        if (isRecording && recordingRef.current) {
          wasRecordingBeforeBackground.current = true;
          console.log('[VoiceRecorder] App backgrounded while recording - continuing in background');
        }
      } else if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App coming back to foreground
        if (wasRecordingBeforeBackground.current && recordingRef.current) {
          console.log('[VoiceRecorder] App foregrounded - checking recording status');
          try {
            const status = await recordingRef.current.getStatusAsync();
            if (!status.isRecording) {
              console.log('[VoiceRecorder] Recording stopped while in background, attempting to recover');
              // Recording was interrupted - save what we have
              await handleInterruptedRecording();
            } else {
              console.log('[VoiceRecorder] Recording still active after returning from background');
            }
          } catch (e) {
            console.error('[VoiceRecorder] Error checking recording status:', e);
            await handleInterruptedRecording();
          }
        }
        wasRecordingBeforeBackground.current = false;
      }
      
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isRecording]);

  // Handle interrupted recording - save what we have
  const handleInterruptedRecording = async () => {
    if (!recordingRef.current) return;
    
    console.log('[VoiceRecorder] Handling interrupted recording...');
    setIsPaused(true);
    
    try {
      // Try to get what was recorded
      const uri = recordingRef.current.getURI();
      
      // Stop and unload
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {
        console.log('[VoiceRecorder] Recording already stopped');
      }
      
      // Clear intervals
      if (timerRef.current) clearInterval(timerRef.current);
      if (meteringRef.current) clearInterval(meteringRef.current);
      if (statusCheckRef.current) clearInterval(statusCheckRef.current);
      timerRef.current = null;
      meteringRef.current = null;
      statusCheckRef.current = null;
      
      recordingRef.current = null;
      setIsRecording(false);
      setIsPaused(false);
      
      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      
      // Allow screen to sleep again
      try {
        deactivateKeepAwake('voice-recording');
      } catch (e) {}
      
      // If we have a recording with some duration, save it
      if (uri && duration >= 1) {
        console.log('[VoiceRecorder] Saving interrupted recording:', uri);
        Alert.alert(
          'Recording Interrupted',
          'Your recording was interrupted but has been saved.',
          [{ text: 'OK' }]
        );
        onRecordingComplete(uri, duration * 1000);
      } else {
        Alert.alert(
          'Recording Interrupted',
          'The recording was interrupted and could not be saved. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      console.error('[VoiceRecorder] Error handling interrupted recording:', err);
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  // Request permissions and auto-start
  useEffect(() => {
    let mounted = true;
    
    (async () => {
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
        await startRecordingInternal();
      }
    })();
    
    return () => { mounted = false; };
  }, [autoStart]);

  // Glow animation loop while recording
  useEffect(() => {
    if (isRecording) {
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
  }, [isRecording, glowAnim]);

  // Auto-stop at max duration
  useEffect(() => {
    if (duration >= maxDuration && isRecording) {
      stopRecording();
    }
  }, [duration, maxDuration, isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (meteringRef.current) clearInterval(meteringRef.current);
      if (statusCheckRef.current) clearInterval(statusCheckRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      // Ensure screen can sleep when component unmounts
      try {
        deactivateKeepAwake('voice-recording');
      } catch (e) {}
    };
  }, []);

  // Update metering and animate bars
  const updateMetering = useCallback(async () => {
    if (!recordingRef.current) return;
    
    try {
      const status = await recordingRef.current.getStatusAsync();
      if (status.isRecording && status.metering !== undefined) {
        // Metering is in dB, typically -160 to 0
        // Convert to a 0-1 scale
        const db = status.metering;
        const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
        
        // Add some randomization for visual interest
        const baseHeight = MIN_BAR_HEIGHT + normalized * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
        
        setWaveformData(prev => {
          const newData = [...prev];
          // Shift all bars to the left
          for (let i = 0; i < BAR_COUNT - 1; i++) {
            newData[i] = prev[i + 1];
          }
          // Add new bar on the right with some variation
          const variation = 0.7 + Math.random() * 0.6;
          newData[BAR_COUNT - 1] = Math.max(MIN_BAR_HEIGHT, baseHeight * variation);
          return newData;
        });
      }
    } catch (e) {
      // Ignore metering errors
    }
  }, []);

  // Animate bars when waveform data changes
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

  const startRecordingInternal = async () => {
    try {
      console.log('[VoiceRecorder] Setting audio mode...');
      
      // Keep screen awake during recording to prevent iOS from suspending
      try {
        await activateKeepAwakeAsync('voice-recording');
        console.log('[VoiceRecorder] Screen keep-awake activated');
      } catch (e) {
        console.log('[VoiceRecorder] Keep-awake failed (non-critical):', e);
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: false,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        playThroughEarpieceAndroid: false,
      });

      console.log('[VoiceRecorder] Creating recording...');
      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        }
      );
      
      console.log('[VoiceRecorder] Recording started successfully');
      recordingRef.current = recording;
      setIsRecording(true);
      setIsInitializing(false);
      setIsPaused(false);
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

      // Start metering updates - 100ms for better performance (was 50ms)
      meteringRef.current = setInterval(updateMetering, 100);

      // Start recording status monitor - check every 2 seconds if recording is still active
      statusCheckRef.current = setInterval(async () => {
        if (!recordingRef.current) return;
        
        try {
          const status = await recordingRef.current.getStatusAsync();
          if (!status.isRecording && isRecording) {
            console.log('[VoiceRecorder] Recording stopped unexpectedly, status:', status);
            // Recording stopped unexpectedly (interruption, error, etc.)
            await handleInterruptedRecording();
          }
        } catch (e) {
          console.error('[VoiceRecorder] Status check error:', e);
        }
      }, 2000);

    } catch (err: any) {
      console.error('[VoiceRecorder] Failed to start recording:', err);
      console.error('[VoiceRecorder] Error details:', JSON.stringify(err, null, 2));
      setIsRecording(false);
      setIsInitializing(false);
      
      // More specific error message
      let errorMessage = 'Failed to start recording. Please try again.';
      if (err?.message?.includes('permission')) {
        errorMessage = 'Microphone permission was denied. Please enable it in Settings.';
      } else if (err?.message?.includes('session')) {
        errorMessage = 'Audio session error. Please restart the app and try again.';
      }
      
      Alert.alert('Recording Error', errorMessage);
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

    await startRecordingInternal();
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
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
      setIsPaused(false);
      await recordingRef.current.stopAndUnloadAsync();
      
      const uri = recordingRef.current.getURI();
      const status = await recordingRef.current.getStatusAsync();
      
      recordingRef.current = null;

      // Reset waveform
      setWaveformData(Array(BAR_COUNT).fill(MIN_BAR_HEIGHT));

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      // Allow screen to sleep again
      try {
        deactivateKeepAwake('voice-recording');
        console.log('[VoiceRecorder] Screen keep-awake deactivated');
      } catch (e) {}

      if (uri && duration >= 1) {
        onRecordingComplete(uri, status.durationMillis || duration * 1000);
      } else if (duration < 1) {
        Alert.alert('Recording Too Short', 'Please record for at least 1 second.');
      }

    } catch (err) {
      console.error('Failed to stop recording:', err);
      Alert.alert('Error', 'Failed to save recording.');
    }
  };

  const cancelRecording = async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {}
      recordingRef.current = null;
    }
    
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
    setIsPaused(false);
    setDuration(0);
    setWaveformData(Array(BAR_COUNT).fill(MIN_BAR_HEIGHT));
    
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
    
    // Allow screen to sleep again
    try {
      deactivateKeepAwake('voice-recording');
    } catch (e) {}
    
    onCancel?.();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
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
              {isPaused ? 'PAUSED' : 'REC'}
            </Text>
          </View>
        )}
        <Text style={styles.timer}>{formatTime(duration)}</Text>
        <Text style={styles.maxDuration}>/ {formatTime(maxDuration)}</Text>
      </View>

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
                  backgroundColor: isRecording 
                    ? `rgba(196, 223, 196, ${0.4 + (index / BAR_COUNT) * 0.6})`
                    : '#333',
                },
              ]}
            />
          ))}
        </View>
        
        {/* Center line */}
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
        {isInitializing ? 'Starting...' : isRecording ? 'Tap to stop recording' : 'Tap to start recording'}
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
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 6,
  },
  recordingLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ef4444',
    letterSpacing: 1,
  },
  pausedBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  pausedDot: {
    backgroundColor: '#fbbf24',
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
