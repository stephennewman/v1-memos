import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '@/lib/auth-context';
import { 
  fetchForm, 
  submitForm, 
  startInstance,
  voiceFillForm,
  SimpleForm,
  FormField as FormFieldType,
} from '@/lib/forms';
import { FormField } from '@/components/FormField';
import { VoiceRecorder } from '@/components/VoiceRecorder';

// Field types that benefit from voice input
const VOICE_FIELD_TYPES = ['text', 'textarea', 'long_text', 'notes', 'comment', 'description'];
// Field types that are easier to tap
const TAP_FIELD_TYPES = ['thumbs', 'radio', 'checkbox', 'select', 'multi_select', 'multiselect', 'boolean', 'yes_no', 'date', 'time', 'number', 'integer', 'decimal'];

export default function FormFillScreen() {
  const { id, instanceId } = useLocalSearchParams<{ id: string; instanceId?: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [form, setForm] = useState<SimpleForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [startedAt] = useState(new Date().toISOString());
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Voice mode states
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState<string | null>(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [voiceFilledFields, setVoiceFilledFields] = useState<Set<string>>(new Set());
  const [showReviewScreen, setShowReviewScreen] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  
  // Submission confirmation
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  // Categorize fields
  const { voiceFields, tapFields, allFields } = useMemo(() => {
    const fields = form?.schema?.fields || [];
    const voice: FormFieldType[] = [];
    const tap: FormFieldType[] = [];
    
    fields.forEach((field: FormFieldType) => {
      // Check if it's a signature field (by type or label)
      const isSignature = field.type === 'signature' || 
                          field.type === 'esignature' || 
                          field.type === 'e_signature' ||
                          (field.label && field.label.toLowerCase().includes('signature'));
      
      // Signature fields are tap-only, not voice
      if (isSignature) {
        tap.push(field);
      } else if (VOICE_FIELD_TYPES.includes(field.type)) {
        voice.push(field);
      } else {
        tap.push(field);
      }
    });
    
    return { voiceFields: voice, tapFields: tap, allFields: fields };
  }, [form]);

  // Check if form has voice-friendly fields
  const hasVoiceFields = voiceFields.length > 0;

  useEffect(() => {
    loadForm();
  }, [id]);

  const loadForm = async () => {
    if (!id) return;
    
    setIsLoading(true);
    try {
      const formData = await fetchForm(id);
      setForm(formData);
      
      if (instanceId) {
        await startInstance(instanceId);
      }
    } catch (error) {
      console.error('[FormFill] Error loading form:', error);
      Alert.alert('Error', 'Failed to load form');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = useCallback((fieldName: string, value: any) => {
    console.log('[Form] Field change:', fieldName, typeof value === 'string' && value.length > 50 ? value.substring(0, 50) + '...' : value);
    setFormData(prev => ({ ...prev, [fieldName]: value }));
    if (errors[fieldName]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
    if (voiceFilledFields.has(fieldName)) {
      setVoiceFilledFields(prev => {
        const newSet = new Set(prev);
        newSet.delete(fieldName);
        return newSet;
      });
    }
    // If this is a signature field, scroll to bottom to keep it in view
    if (fieldName.toLowerCase().includes('signature')) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [errors, voiceFilledFields]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    allFields.forEach((field: FormFieldType) => {
      const fieldName = field.name || field.id;
      const value = formData[fieldName];
      
      if (field.required) {
        if (value === undefined || value === null || value === '') {
          newErrors[fieldName] = `${field.label} is required`;
        } else if (Array.isArray(value) && value.length === 0) {
          newErrors[fieldName] = `${field.label} is required`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    console.log('[Form] Submit pressed. Form:', !!form, 'User:', !!user);
    console.log('[Form] Current formData:', JSON.stringify(formData, null, 2));
    
    if (!form || !user) {
      Alert.alert('Error', 'Form or user not loaded');
      return;
    }
    
    if (!validateForm()) {
      console.log('[Form] Validation failed. Errors:', errors);
      Alert.alert('Validation Error', 'Please fill in all required fields');
      return;
    }

    console.log('[Form] Validation passed, submitting...');
    setIsSubmitting(true);
    try {
      const result = await submitForm(form.id, formData, {
        instanceId: instanceId,
        startedAt,
        deviceType: 'mobile',
      });

      console.log('[Form] Submit result:', result);
      
      if (result.success) {
        setSubmissionId(result.submissionId || null);
        setShowReviewScreen(false); // Clear review screen so confirmation shows
        setShowConfirmation(true);
      } else {
        Alert.alert('Error', result.error || 'Failed to submit form');
      }
    } catch (error: any) {
      console.error('[FormFill] Submit error:', error);
      Alert.alert('Error', error.message || 'Failed to submit form');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Voice Mode: Handle recording complete
  const handleVoiceModeComplete = async (uri: string, durationMs: number) => {
    if (!form) {
      Alert.alert('Error', 'Form not loaded');
      return;
    }
    
    setShowVoiceRecorder(false);
    setIsVoiceMode(false);
    setIsProcessingVoice(true);

    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        throw new Error('Audio file not found');
      }

      console.log('[VoiceMode] Reading audio file:', uri);
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!base64Audio || base64Audio.length === 0) {
        throw new Error('Audio file is empty');
      }

      console.log('[VoiceMode] Sending audio for processing, size:', base64Audio.length);
      
      const result = await voiceFillForm(base64Audio, form.schema, formData);
      
      console.log('[VoiceMode] API result:', JSON.stringify(result, null, 2));
      
      if (result.success) {
        // Store transcript for display
        if (result.transcript) {
          setVoiceTranscript(result.transcript);
        }
        
        if (result.field_updates && Object.keys(result.field_updates).length > 0) {
          // Apply field updates
          setFormData(prev => ({ ...prev, ...result.field_updates }));
          setVoiceFilledFields(new Set(Object.keys(result.field_updates)));
        }
        
        // Go to review screen
        setShowReviewScreen(true);
      } else {
        Alert.alert('Error', result.error || 'Failed to process voice input');
      }
    } catch (error: any) {
      console.error('[VoiceMode] Error:', error?.message || error);
      Alert.alert('Error', error?.message || 'Failed to process voice recording');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  // Single field voice recording complete
  const handleVoiceRecordingComplete = (uri: string, durationMs: number) => {
    if (activeVoiceField) {
      handleFieldChange(activeVoiceField, {
        type: 'voice_note',
        uri,
        duration: durationMs,
        recordedAt: new Date().toISOString(),
      });
    }
    setShowVoiceRecorder(false);
    setActiveVoiceField(null);
  };

  const openVoiceRecorder = (fieldName: string) => {
    setActiveVoiceField(fieldName);
    setIsVoiceMode(false);
    setShowVoiceRecorder(true);
  };

  const startVoiceMode = () => {
    setIsVoiceMode(true);
    setActiveVoiceField(null);
    setShowVoiceRecorder(true);
  };

  const exitReviewScreen = () => {
    console.log('[Form] exitReviewScreen called - going back to form');
    setShowReviewScreen(false);
    setVoiceTranscript('');
  };

  // Count unfilled required fields
  const unfilledRequiredCount = useMemo(() => {
    let count = 0;
    allFields.forEach((field: FormFieldType) => {
      const fieldName = field.name || field.id;
      const value = formData[fieldName];
      if (field.required && (value === undefined || value === null || value === '')) {
        count++;
      }
    });
    return count;
  }, [allFields, formData]);

  // Check if form is ready to submit (all required fields filled)
  const isFormReady = unfilledRequiredCount === 0;

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  // Error state
  if (!form) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="alert-circle" size={48} color="#ef4444" />
        <Text style={styles.errorText}>Form not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Voice Mode Recording Screen
  if (showVoiceRecorder && isVoiceMode) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        
        <View style={styles.voiceModeQuestionsContainer}>
          <View style={styles.voiceModeTopBar}>
            <TouchableOpacity 
              style={styles.voiceModeClose}
              onPress={() => {
                setShowVoiceRecorder(false);
                setIsVoiceMode(false);
              }}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            
            <View style={styles.voiceModeBadge}>
              <Ionicons name="mic" size={16} color="#22c55e" />
              <Text style={styles.voiceModeText}>Voice Mode</Text>
            </View>
            
            <View style={{ width: 40 }} />
          </View>
          
          <Text style={styles.voiceModeHint}>
            {hasVoiceFields 
              ? "Speak about these topics - we'll also capture any yes/no answers:"
              : "Describe your inspection - we'll try to fill in the answers:"}
          </Text>
          
          <ScrollView 
            style={styles.questionsScroll} 
            contentContainerStyle={styles.questionsContent}
            showsVerticalScrollIndicator={true}
          >
            {/* Show voice-friendly fields first */}
            {voiceFields.length > 0 && voiceFields.map((field: FormFieldType, index: number) => {
              const fieldName = field.name || field.id;
              const isFilled = formData[fieldName] !== undefined && formData[fieldName] !== null && formData[fieldName] !== '';
              return (
                <View key={fieldName || index} style={styles.questionItem}>
                  <View style={[styles.questionBullet, styles.questionBulletVoice, isFilled && styles.questionBulletFilled]}>
                    {isFilled ? (
                      <Ionicons name="checkmark" size={12} color="#22c55e" />
                    ) : (
                      <Ionicons name="mic" size={12} color="#22c55e" />
                    )}
                  </View>
                  <Text style={[styles.questionText, styles.questionTextVoice, isFilled && styles.questionTextFilled]} numberOfLines={2}>
                    {field.label}
                  </Text>
                </View>
              );
            })}
            
            {/* Show tap fields as secondary */}
            {tapFields.length > 0 && (
              <>
                <Text style={styles.tapFieldsLabel}>Quick answers (tap after voice):</Text>
                {tapFields.slice(0, 5).map((field: FormFieldType, index: number) => {
                  const fieldName = field.name || field.id;
                  const isFilled = formData[fieldName] !== undefined && formData[fieldName] !== null && formData[fieldName] !== '';
                  return (
                    <View key={fieldName || index} style={styles.questionItem}>
                      <View style={[styles.questionBullet, isFilled && styles.questionBulletFilled]}>
                        {isFilled ? (
                          <Ionicons name="checkmark" size={12} color="#22c55e" />
                        ) : (
                          <Text style={styles.questionNumber}>{index + 1}</Text>
                        )}
                      </View>
                      <Text style={[styles.questionText, isFilled && styles.questionTextFilled]} numberOfLines={1}>
                        {field.label}
                      </Text>
                    </View>
                  );
                })}
                {tapFields.length > 5 && (
                  <Text style={styles.moreFieldsText}>+{tapFields.length - 5} more questions</Text>
                )}
              </>
            )}
          </ScrollView>
        </View>
        
        <View style={styles.voiceRecorderWrapper}>
          <VoiceRecorder
            onRecordingComplete={handleVoiceModeComplete}
            onCancel={() => {
              setShowVoiceRecorder(false);
              setIsVoiceMode(false);
            }}
            maxDuration={120}
            autoStart
          />
        </View>
      </View>
    );
  }

  // Single field voice recording
  if (showVoiceRecorder && activeVoiceField) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <VoiceRecorder
          onRecordingComplete={handleVoiceRecordingComplete}
          onCancel={() => {
            setShowVoiceRecorder(false);
            setActiveVoiceField(null);
          }}
          maxDuration={300}
          autoStart
        />
      </View>
    );
  }

  // Processing voice overlay
  if (isProcessingVoice) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={styles.processingText}>Processing voice input...</Text>
        <Text style={styles.processingSubtext}>Transcribing and filling form</Text>
      </View>
    );
  }

  // Review Screen (after voice mode)
  if (showReviewScreen) {
    const filledCount = Object.keys(formData).filter(k => 
      formData[k] !== undefined && formData[k] !== null && formData[k] !== ''
    ).length;
    
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={exitReviewScreen}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Review & Complete</Text>
            <Text style={styles.headerSubtitle}>
              {filledCount}/{allFields.length} answered
            </Text>
          </View>
          <View style={styles.headerButton} />
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Voice transcript - only show if NO fields were filled (fallback info) */}
            {voiceTranscript && voiceFilledFields.size === 0 && (
              <View style={styles.transcriptContainer}>
                <View style={styles.transcriptHeader}>
                  <Ionicons name="mic" size={16} color="#f59e0b" />
                  <Text style={styles.transcriptLabel}>We heard but couldn't match:</Text>
                </View>
                <Text style={styles.transcriptText}>"{voiceTranscript}"</Text>
              </View>
            )}

            {/* Voice-filled fields section */}
            {voiceFilledFields.size > 0 && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>
                  <Ionicons name="checkmark-circle" size={16} color="#22c55e" /> Voice-filled answers
                </Text>
                {allFields
                  .filter((f: FormFieldType) => voiceFilledFields.has(f.name || f.id))
                  .map((field: FormFieldType) => {
                    const fieldName = field.name || field.id;
                    return (
                      <View key={fieldName} style={styles.voiceFilledWrapper}>
                        <FormField
                          field={field}
                          value={formData[fieldName]}
                          onChange={(value) => handleFieldChange(fieldName, value)}
                          error={errors[fieldName]}
                        />
                      </View>
                    );
                  })}
              </View>
            )}

            {/* Remaining fields to complete */}
            {unfilledRequiredCount > 0 && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>
                  <Ionicons name="hand-left" size={16} color="#f97316" /> Tap to complete ({unfilledRequiredCount} remaining)
                </Text>
                {allFields
                  .filter((f: FormFieldType) => {
                    const fieldName = f.name || f.id;
                    const value = formData[fieldName];
                    return !voiceFilledFields.has(fieldName) && 
                           (value === undefined || value === null || value === '');
                  })
                  .map((field: FormFieldType) => {
                    const fieldName = field.name || field.id;
                    return (
                      <FormField
                        key={fieldName}
                        field={field}
                        value={formData[fieldName]}
                        onChange={(value) => handleFieldChange(fieldName, value)}
                        error={errors[fieldName]}
                      />
                    );
                  })}
              </View>
            )}

            {/* Already answered (not voice-filled) */}
            {allFields.filter((f: FormFieldType) => {
              const fieldName = f.name || f.id;
              const value = formData[fieldName];
              return !voiceFilledFields.has(fieldName) && 
                     value !== undefined && value !== null && value !== '';
            }).length > 0 && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Previously answered</Text>
                {allFields
                  .filter((f: FormFieldType) => {
                    const fieldName = f.name || f.id;
                    const value = formData[fieldName];
                    return !voiceFilledFields.has(fieldName) && 
                           value !== undefined && value !== null && value !== '';
                  })
                  .map((field: FormFieldType) => {
                    const fieldName = field.name || field.id;
                    return (
                      <FormField
                        key={fieldName}
                        field={field}
                        value={formData[fieldName]}
                        onChange={(value) => handleFieldChange(fieldName, value)}
                        error={errors[fieldName]}
                      />
                    );
                  })}
              </View>
            )}
          </ScrollView>

          {/* Submit Button */}
          <View style={styles.submitContainer}>
            {!isFormReady && (
              <Text style={styles.submitHint}>
                {unfilledRequiredCount} required field{unfilledRequiredCount > 1 ? 's' : ''} remaining
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.submitButton, 
                !isFormReady && styles.submitButtonNotReady,
                isSubmitting && styles.submitButtonDisabled
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting || !isFormReady}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={[styles.submitText, !isFormReady && styles.submitTextNotReady]}>
                    {isFormReady ? 'Submit Form' : 'Complete Required Fields'}
                  </Text>
                  <Ionicons 
                    name={isFormReady ? "checkmark-circle" : "alert-circle"} 
                    size={20} 
                    color={isFormReady ? "#fff" : "#666"} 
                  />
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // Submission Confirmation Screen
  if (showConfirmation) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        
        <View style={styles.confirmationContainer}>
          {/* Success Icon */}
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color="#22c55e" />
          </View>
          
          <Text style={styles.confirmationTitle}>Form Submitted!</Text>
          <Text style={styles.confirmationSubtitle}>{form.title}</Text>
          
          {/* Summary of answers */}
          <ScrollView 
            style={styles.confirmationScroll}
            contentContainerStyle={styles.confirmationScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.summaryCard}>
              <Text style={styles.summaryHeader}>Your Responses</Text>
              {allFields.map((field: FormFieldType) => {
                const fieldName = field.name || field.id;
                const value = formData[fieldName];
                let displayValue = value;
                
                // Format display value
                if (value === undefined || value === null || value === '') {
                  displayValue = '—';
                } else if (Array.isArray(value)) {
                  displayValue = value.join(', ');
                } else if (typeof value === 'boolean') {
                  displayValue = value ? 'Yes' : 'No';
                } else if (value === 'yes' || value === 'up') {
                  displayValue = '👍 Yes';
                } else if (value === 'no' || value === 'down') {
                  displayValue = '👎 No';
                }
                
                return (
                  <View key={fieldName} style={styles.summaryRow}>
                    <Text style={styles.summaryLabel} numberOfLines={2}>{field.label}</Text>
                    <Text style={styles.summaryValue} numberOfLines={2}>{String(displayValue)}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
          
          {/* Actions */}
          <View style={styles.confirmationActions}>
            <TouchableOpacity 
              style={styles.confirmationPrimaryButton}
              onPress={() => router.replace('/forms')}
            >
              <Ionicons name="clipboard-outline" size={20} color="#fff" />
              <Text style={styles.confirmationPrimaryText}>View More Forms</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.confirmationSecondaryButton}
              onPress={() => router.replace('/')}
            >
              <Ionicons name="home-outline" size={18} color="#fff" />
              <Text style={styles.confirmationSecondaryText}>Return to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Main Form Screen
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{form.title}</Text>
          {instanceId && (
            <View style={styles.assignedBadge}>
              <Ionicons name="person" size={12} color="#22c55e" />
              <Text style={styles.assignedText}>Assigned</Text>
            </View>
          )}
        </View>
        {form.ai_voice_enabled ? (
          <TouchableOpacity style={styles.voiceModeButton} onPress={startVoiceMode}>
            <Ionicons name="mic" size={22} color="#22c55e" />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Description */}
          {form.description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.description}>{form.description}</Text>
            </View>
          )}

          {/* Voice Mode CTA */}
          {form.ai_voice_enabled && (
            <TouchableOpacity 
              style={styles.voiceModeCTA}
              onPress={startVoiceMode}
              activeOpacity={0.8}
            >
              <View style={styles.voiceModeIcon}>
                <Ionicons name="mic" size={24} color="#22c55e" />
              </View>
              <View style={styles.voiceModeCTAText}>
                <Text style={styles.voiceModeCTATitle}>Use Voice Mode</Text>
                <Text style={styles.voiceModeCTASubtitle}>
                  {hasVoiceFields 
                    ? `Speak about ${voiceFields.length} topic${voiceFields.length > 1 ? 's' : ''}, then tap the rest`
                    : 'Describe your inspection, then confirm answers'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#22c55e" />
            </TouchableOpacity>
          )}

          {/* Form Fields */}
          <View style={styles.fieldsContainer}>
            {allFields.map((field: FormFieldType) => {
              const fieldName = field.name || field.id;
              const isVoiceFilled = voiceFilledFields.has(fieldName);
              
              // Voice note field type
              if (field.type === 'voice_note' || field.type === 'audio') {
                const voiceValue = formData[fieldName];
                return (
                  <View key={fieldName} style={styles.voiceFieldContainer}>
                    <View style={styles.labelContainer}>
                      <Text style={styles.label}>{field.label}</Text>
                      {field.required && <Text style={styles.required}>*</Text>}
                    </View>
                    
                    {voiceValue ? (
                      <View style={styles.voiceRecorded}>
                        <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                        <Text style={styles.voiceRecordedText}>
                          Recording saved ({Math.round(voiceValue.duration / 1000)}s)
                        </Text>
                        <TouchableOpacity onPress={() => handleFieldChange(fieldName, null)}>
                          <Ionicons name="close-circle" size={20} color="#666" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.voiceRecordButton}
                        onPress={() => openVoiceRecorder(fieldName)}
                      >
                        <Ionicons name="mic" size={24} color="#22c55e" />
                        <Text style={styles.voiceRecordText}>Tap to record</Text>
                      </TouchableOpacity>
                    )}
                    
                    {errors[fieldName] && (
                      <Text style={styles.error}>{errors[fieldName]}</Text>
                    )}
                  </View>
                );
              }

              return (
                <View key={fieldName} style={isVoiceFilled ? styles.voiceFilledWrapper : undefined}>
                  {isVoiceFilled && (
                    <View style={styles.voiceFilledBadge}>
                      <Ionicons name="mic" size={12} color="#22c55e" />
                      <Text style={styles.voiceFilledText}>Voice filled</Text>
                    </View>
                  )}
                  <FormField
                    field={field}
                    value={formData[fieldName]}
                    onChange={(value) => handleFieldChange(fieldName, value)}
                    error={errors[fieldName]}
                  />
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Submit Button */}
        <View style={styles.submitContainer}>
          {!isFormReady && (
            <Text style={styles.submitHint}>
              {unfilledRequiredCount} required field{unfilledRequiredCount > 1 ? 's' : ''} remaining
            </Text>
          )}
          <TouchableOpacity
            style={[
              styles.submitButton, 
              !isFormReady && styles.submitButtonNotReady,
              isSubmitting && styles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting || !isFormReady}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={[styles.submitText, !isFormReady && styles.submitTextNotReady]}>
                  {isFormReady ? 'Submit' : 'Complete Required Fields'}
                </Text>
                <Ionicons 
                  name={isFormReady ? "checkmark-circle" : "alert-circle"} 
                  size={20} 
                  color={isFormReady ? "#fff" : "#666"} 
                />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 20,
  },
  processingSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    color: '#fff',
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#333',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceModeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#22c55e20',
    borderRadius: 20,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  assignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  assignedText: {
    fontSize: 12,
    color: '#22c55e',
    marginLeft: 4,
  },
  // Voice Mode Styles
  voiceModeQuestionsContainer: {
    backgroundColor: '#111',
    paddingTop: 50,
    maxHeight: '40%',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  voiceModeTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  voiceModeClose: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22c55e30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  voiceModeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22c55e',
    marginLeft: 6,
  },
  voiceModeHint: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  questionsScroll: {
    flexGrow: 0,
  },
  questionsContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  questionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  questionBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  questionBulletVoice: {
    backgroundColor: '#22c55e20',
  },
  questionBulletFilled: {
    backgroundColor: '#22c55e30',
  },
  questionNumber: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  questionText: {
    flex: 1,
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
  questionTextVoice: {
    color: '#ccc',
  },
  questionTextFilled: {
    color: '#22c55e',
  },
  tapFieldsLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 12,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  moreFieldsText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  voiceRecorderWrapper: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  // Review Screen Styles
  transcriptContainer: {
    backgroundColor: '#22c55e10',
    borderWidth: 1,
    borderColor: '#22c55e30',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  transcriptLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#22c55e',
    marginLeft: 6,
  },
  transcriptText: {
    fontSize: 14,
    color: '#aaa',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  // Main Form Styles
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  descriptionContainer: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: '#999',
    lineHeight: 20,
  },
  voiceModeCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22c55e15',
    borderWidth: 1,
    borderColor: '#22c55e40',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  voiceModeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#22c55e25',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  voiceModeCTAText: {
    flex: 1,
  },
  voiceModeCTATitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#22c55e',
  },
  voiceModeCTASubtitle: {
    fontSize: 13,
    color: '#22c55e',
    opacity: 0.7,
    marginTop: 2,
  },
  fieldsContainer: {
    gap: 4,
  },
  voiceFilledWrapper: {
    backgroundColor: '#22c55e10',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#22c55e30',
  },
  voiceFilledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  voiceFilledText: {
    fontSize: 11,
    color: '#22c55e',
    fontWeight: '600',
    marginLeft: 4,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  required: {
    color: '#ef4444',
    marginLeft: 4,
    fontSize: 15,
  },
  error: {
    color: '#ef4444',
    fontSize: 13,
    marginTop: 6,
  },
  voiceFieldContainer: {
    marginBottom: 20,
  },
  voiceRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e20',
    borderWidth: 1,
    borderColor: '#22c55e40',
    borderRadius: 12,
    padding: 20,
    gap: 10,
  },
  voiceRecordText: {
    fontSize: 15,
    color: '#22c55e',
    fontWeight: '500',
  },
  voiceRecorded: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  voiceRecordedText: {
    flex: 1,
    fontSize: 14,
    color: '#22c55e',
  },
  submitContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 34,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  submitHint: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginBottom: 8,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f97316',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  submitButtonNotReady: {
    backgroundColor: '#333',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  submitTextNotReady: {
    color: '#888',
  },
  // Confirmation Screen Styles
  confirmationContainer: {
    flex: 1,
    paddingTop: 80,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 20,
  },
  confirmationTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  confirmationSubtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmationScroll: {
    flex: 1,
    width: '100%',
  },
  confirmationScrollContent: {
    paddingBottom: 20,
  },
  summaryCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  summaryHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  summaryLabel: {
    flex: 1,
    fontSize: 14,
    color: '#888',
    marginRight: 12,
  },
  summaryValue: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
    textAlign: 'right',
  },
  confirmationActions: {
    width: '100%',
    paddingVertical: 20,
    paddingBottom: 40,
    gap: 12,
  },
  confirmationPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  confirmationPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  confirmationSecondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  confirmationSecondaryText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#888',
  },
});
