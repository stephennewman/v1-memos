import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Animated,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

interface VoiceRecorderProps {
  onRecordingComplete: (uri: string, durationMs: number) => void;
  onCancel?: () => void;
  maxDuration?: number; // seconds
  autoStart?: boolean; // Start recording automatically
}

export function VoiceRecorder({ 
  onRecordingComplete, 
  onCancel,
  maxDuration = 300, // 5 minutes default
  autoStart = false,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasAutoStartedRef = useRef(false);

  // Request permissions on mount and auto-start if requested
  useEffect(() => {
    let mounted = true;
    
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (!mounted) return;
      
      const granted = status === 'granted';
      setPermissionGranted(granted);
      
      if (!granted) {
        Alert.alert(
          'Microphone Permission Required',
          'Please enable microphone access in your device settings to record voice notes.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Auto-start recording immediately after permission granted
      if (autoStart && !hasAutoStartedRef.current) {
        hasAutoStartedRef.current = true;
        // Configure audio and start recording
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
          });

          const { recording } = await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
          );
          
          if (!mounted) {
            await recording.stopAndUnloadAsync();
            return;
          }
          
          recordingRef.current = recording;
          setIsRecording(true);
          setDuration(0);

          timerRef.current = setInterval(() => {
            setDuration(d => d + 1);
          }, 1000);
        } catch (err) {
          console.error('Auto-start recording failed:', err);
        }
      }
    })();
    
    return () => { mounted = false; };
  }, [autoStart]);

  // Pulse animation while recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { 
            toValue: 1.15, 
            duration: 600, 
            useNativeDriver: true 
          }),
          Animated.timing(pulseAnim, { 
            toValue: 1, 
            duration: 600, 
            useNativeDriver: true 
          }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

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
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  const startRecording = async () => {
    if (!permissionGranted) {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed to record.');
        return;
      }
      setPermissionGranted(true);
    }

    try {
      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      // Create and start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      recordingRef.current = recording;
      setIsRecording(true);
      setDuration(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Recording Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Stop and get recording
      setIsRecording(false);
      await recordingRef.current.stopAndUnloadAsync();
      
      const uri = recordingRef.current.getURI();
      const status = await recordingRef.current.getStatusAsync();
      
      recordingRef.current = null;

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      // Only callback if we have valid audio
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
      } catch (e) {
        // Ignore errors during cancel
      }
      recordingRef.current = null;
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setIsRecording(false);
    setDuration(0);
    
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

  const progressPercent = Math.min((duration / maxDuration) * 100, 100);

  return (
    <View style={styles.container}>
      {/* Timer */}
      <Text style={styles.timer}>{formatTime(duration)}</Text>
      
      {/* Progress indicator */}
      {isRecording && (
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
        </View>
      )}

      {/* Record Button */}
      <Animated.View 
        style={[
          styles.recordButtonOuter, 
          { transform: [{ scale: pulseAnim }] }
        ]}
      >
        <TouchableOpacity
          style={[
            styles.recordButton, 
            isRecording && styles.recordButtonActive
          ]}
          onPress={isRecording ? stopRecording : startRecording}
          activeOpacity={0.8}
        >
          <Ionicons 
            name={isRecording ? 'stop' : 'mic'} 
            size={36} 
            color={isRecording ? '#fff' : '#0a0a0a'} 
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Hint Text */}
      <Text style={styles.hint}>
        {isRecording ? 'Tap to stop' : 'Tap to record'}
      </Text>

      {/* Recording indicator */}
      {isRecording && (
        <View style={styles.recordingIndicator}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Recording</Text>
        </View>
      )}

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
    padding: 40,
  },
  timer: {
    fontSize: 56,
    fontWeight: '200',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    marginBottom: 16,
    letterSpacing: 2,
  },
  progressContainer: {
    width: '60%',
    height: 3,
    backgroundColor: '#222',
    borderRadius: 2,
    marginBottom: 40,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#c4dfc4',
    borderRadius: 2,
  },
  recordButtonOuter: {
    marginBottom: 24,
  },
  recordButton: {
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
  recordButtonActive: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
  },
  hint: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 8,
  },
  recordingText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '500',
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

