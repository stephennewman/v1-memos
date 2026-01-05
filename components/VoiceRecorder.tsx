import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Animated,
  Alert,
  Dimensions,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

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
  const [duration, setDuration] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoStartedRef = useRef(false);
  
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
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        interruptionModeIOS: 1, // DoNotMix - continue recording even when app goes to background
        shouldDuckAndroid: false,
        interruptionModeAndroid: 1, // DoNotMix
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
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

      // Start metering updates
      meteringRef.current = setInterval(updateMetering, 50);

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

      setIsRecording(false);
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
    
    setIsRecording(false);
    setDuration(0);
    setWaveformData(Array(BAR_COUNT).fill(MIN_BAR_HEIGHT));
    
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });
    
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
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingLabel}>REC</Text>
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
