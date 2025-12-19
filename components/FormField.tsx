import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Modal,
  FlatList,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import SignatureScreen from 'react-native-signature-canvas';
import { FormField as FormFieldType } from '@/lib/forms';

const { width: screenWidth } = Dimensions.get('window');

interface FormFieldProps {
  field: FormFieldType;
  value: any;
  onChange: (value: any) => void;
  error?: string;
}

export function FormField({ field, value, onChange, error }: FormFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const signatureRef = useRef<any>(null);

  const renderLabel = () => (
    <View style={styles.labelContainer}>
      <Text style={styles.label}>{field.label}</Text>
      {field.required && <Text style={styles.required}>*</Text>}
    </View>
  );

  const renderError = () => {
    if (!error) return null;
    return <Text style={styles.error}>{error}</Text>;
  };

  // Check if this is a signature field (by type OR label) - must check before text input
  const isSignatureField = field.type === 'signature' || 
                           field.type === 'esignature' || 
                           field.type === 'e_signature' ||
                           (field.label && field.label.toLowerCase().includes('signature'));

  // Text Input (but NOT signature fields)
  if ((field.type === 'text' || field.type === 'email' || field.type === 'phone') && !isSignatureField) {
    return (
      <View style={styles.fieldContainer}>
        {renderLabel()}
        <TextInput
          style={[styles.textInput, error && styles.inputError]}
          value={value || ''}
          onChangeText={onChange}
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          placeholderTextColor="#555"
          keyboardType={
            field.type === 'email' ? 'email-address' :
            field.type === 'phone' ? 'phone-pad' : 'default'
          }
          autoCapitalize={field.type === 'email' ? 'none' : 'sentences'}
        />
        {renderError()}
      </View>
    );
  }

  // Textarea
  if (field.type === 'textarea' || field.type === 'long_text') {
    return (
      <View style={styles.fieldContainer}>
        {renderLabel()}
        <TextInput
          style={[styles.textInput, styles.textArea, error && styles.inputError]}
          value={value || ''}
          onChangeText={onChange}
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          placeholderTextColor="#555"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        {renderError()}
      </View>
    );
  }

  // Number
  if (field.type === 'number' || field.type === 'integer' || field.type === 'decimal') {
    return (
      <View style={styles.fieldContainer}>
        {renderLabel()}
        <TextInput
          style={[styles.textInput, error && styles.inputError]}
          value={value?.toString() || ''}
          onChangeText={(text) => {
            const num = field.type === 'integer' ? parseInt(text) : parseFloat(text);
            onChange(isNaN(num) ? '' : num);
          }}
          placeholder={field.placeholder || 'Enter number'}
          placeholderTextColor="#555"
          keyboardType="numeric"
        />
        {renderError()}
      </View>
    );
  }

  // Checkbox / Boolean
  if (field.type === 'checkbox' || field.type === 'boolean') {
    return (
      <View style={styles.fieldContainer}>
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => onChange(!value)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, value && styles.checkboxChecked]}>
            {value && <Ionicons name="checkmark" size={16} color="#fff" />}
          </View>
          <Text style={styles.checkboxLabel}>{field.label}</Text>
          {field.required && <Text style={styles.required}>*</Text>}
        </TouchableOpacity>
        {renderError()}
      </View>
    );
  }

  // Select / Dropdown
  if (field.type === 'select' || field.type === 'dropdown') {
    // Handle both string[] and {label, value}[] formats
    const normalizedOptions = field.options?.map((opt: any) => 
      typeof opt === 'string' ? { label: opt, value: opt } : opt
    ) || [];
    const selectedOption = normalizedOptions.find(opt => opt.value === value);
    
    return (
      <View style={styles.fieldContainer}>
        {renderLabel()}
        <TouchableOpacity
          style={[styles.selectButton, error && styles.inputError]}
          onPress={() => setShowSelectModal(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.selectText, !selectedOption && styles.placeholder]}>
            {selectedOption?.label || field.placeholder || 'Select an option'}
          </Text>
          <Ionicons name="chevron-down" size={20} color="#666" />
        </TouchableOpacity>

        <Modal
          visible={showSelectModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowSelectModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{field.label}</Text>
                <TouchableOpacity onPress={() => setShowSelectModal(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={normalizedOptions}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      item.value === value && styles.optionSelected
                    ]}
                    onPress={() => {
                      onChange(item.value);
                      setShowSelectModal(false);
                    }}
                  >
                    <Text style={[
                      styles.optionText,
                      item.value === value && styles.optionTextSelected
                    ]}>
                      {item.label}
                    </Text>
                    {item.value === value && (
                      <Ionicons name="checkmark" size={20} color="#f97316" />
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>
        {renderError()}
      </View>
    );
  }

  // Multi-select
  if (field.type === 'multi_select' || field.type === 'multiselect') {
    // Handle both string[] and {label, value}[] formats
    const normalizedOptions = field.options?.map((opt: any) => 
      typeof opt === 'string' ? { label: opt, value: opt } : opt
    ) || [];
    const selectedValues = Array.isArray(value) ? value : [];
    
    return (
      <View style={styles.fieldContainer}>
        {renderLabel()}
        <View style={styles.multiSelectContainer}>
          {normalizedOptions.map((option) => {
            const isSelected = selectedValues.includes(option.value);
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.multiSelectOption, isSelected && styles.multiSelectSelected]}
                onPress={() => {
                  if (isSelected) {
                    onChange(selectedValues.filter((v: string) => v !== option.value));
                  } else {
                    onChange([...selectedValues, option.value]);
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={styles.multiSelectLabel}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {renderError()}
      </View>
    );
  }

  // Radio buttons - Fixed height card for rapid tapping
  if (field.type === 'radio') {
    // Handle both string[] and {label, value}[] formats
    const normalizedOptions = field.options?.map((opt: any) => 
      typeof opt === 'string' ? { label: opt, value: opt } : opt
    ) || [];
    
    // For 2-3 options, show horizontally for rapid tapping
    const isCompact = normalizedOptions.length <= 3;
    
    return (
      <View style={styles.radioCard}>
        <View style={styles.radioLabelContainer}>
          <Text style={styles.radioCardLabel} numberOfLines={3}>
            {field.label}
          </Text>
          {field.required && <Text style={styles.required}> *</Text>}
        </View>
        <View style={isCompact ? styles.radioRowHorizontal : styles.radioRowVertical}>
          {normalizedOptions.map((option) => {
            const isSelected = value === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  isCompact ? styles.radioButtonCompact : styles.radioButtonVertical,
                  isSelected && styles.radioButtonSelected
                ]}
                onPress={() => onChange(option.value)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.radioButtonText,
                  isSelected && styles.radioButtonTextSelected
                ]} numberOfLines={2}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {renderError()}
      </View>
    );
  }

  // Date picker
  if (field.type === 'date') {
    const dateValue = value ? new Date(value) : new Date();
    
    return (
      <View style={styles.fieldContainer}>
        {renderLabel()}
        <TouchableOpacity
          style={[styles.selectButton, error && styles.inputError]}
          onPress={() => setShowPicker(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.selectText, !value && styles.placeholder]}>
            {value ? new Date(value).toLocaleDateString() : 'Select date'}
          </Text>
          <Ionicons name="calendar" size={20} color="#666" />
        </TouchableOpacity>

        {showPicker && (
          <DateTimePicker
            value={dateValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selectedDate) => {
              setShowPicker(Platform.OS === 'ios');
              if (selectedDate) {
                onChange(selectedDate.toISOString().split('T')[0]);
              }
            }}
            themeVariant="dark"
          />
        )}
        {renderError()}
      </View>
    );
  }

  // Time picker
  if (field.type === 'time') {
    const timeValue = value ? new Date(`2000-01-01T${value}`) : new Date();
    
    return (
      <View style={styles.fieldContainer}>
        {renderLabel()}
        <TouchableOpacity
          style={[styles.selectButton, error && styles.inputError]}
          onPress={() => setShowPicker(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.selectText, !value && styles.placeholder]}>
            {value || 'Select time'}
          </Text>
          <Ionicons name="time" size={20} color="#666" />
        </TouchableOpacity>

        {showPicker && (
          <DateTimePicker
            value={timeValue}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selectedTime) => {
              setShowPicker(Platform.OS === 'ios');
              if (selectedTime) {
                const hours = selectedTime.getHours().toString().padStart(2, '0');
                const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
                onChange(`${hours}:${minutes}`);
              }
            }}
            themeVariant="dark"
          />
        )}
        {renderError()}
      </View>
    );
  }

  // Thumbs up/down (yes/no with icons) - Fixed height card for rapid tapping
  if (field.type === 'thumbs' || field.type === 'thumbs_up_down' || field.type === 'yes_no') {
    return (
      <View style={styles.thumbsCard}>
        <View style={styles.thumbsCardContent}>
          {/* Question text - fixed height with scroll if needed */}
          <View style={styles.thumbsLabelContainer}>
            <Text style={styles.thumbsLabel} numberOfLines={3}>
              {field.label}
            </Text>
            {field.required && <Text style={styles.required}> *</Text>}
          </View>
          
          {/* Buttons - always at bottom, fixed position */}
          <View style={styles.thumbsButtonRow}>
            <TouchableOpacity
              style={[
                styles.thumbButtonCompact,
                value === 'yes' && styles.thumbButtonYesActive
              ]}
              onPress={() => onChange('yes')}
              activeOpacity={0.7}
            >
              <Ionicons 
                name="thumbs-up" 
                size={22} 
                color={value === 'yes' ? '#fff' : '#22c55e'} 
              />
              <Text style={[
                styles.thumbTextCompact,
                value === 'yes' && styles.thumbTextActive
              ]}>Yes</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.thumbButtonCompact,
                value === 'no' && styles.thumbButtonNoActive
              ]}
              onPress={() => onChange('no')}
              activeOpacity={0.7}
            >
              <Ionicons 
                name="thumbs-down" 
                size={22} 
                color={value === 'no' ? '#fff' : '#ef4444'} 
              />
              <Text style={[
                styles.thumbTextCompact,
                value === 'no' && styles.thumbTextActive
              ]}>No</Text>
            </TouchableOpacity>
          </View>
        </View>
        {renderError()}
      </View>
    );
  }

  // Signature pad - uses isSignatureField defined at top
  if (isSignatureField) {
    const handleSignature = (signature: string) => {
      // signature comes as data:image/png;base64,...
      onChange(signature);
      setShowSignaturePad(false);
    };
    
    const handleClear = () => {
      signatureRef.current?.clearSignature();
    };
    
    return (
      <View style={styles.fieldContainer}>
        {renderLabel()}
        
        {/* Show current signature or prompt */}
        {value ? (
          <View style={styles.signaturePreviewContainer}>
            <View style={styles.signaturePreview}>
              <Text style={styles.signatureConfirmed}>✓ Signature captured</Text>
            </View>
            <TouchableOpacity 
              style={styles.signatureEditButton}
              onPress={() => setShowSignaturePad(true)}
            >
              <Ionicons name="create-outline" size={18} color="#f97316" />
              <Text style={styles.signatureEditText}>Re-sign</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.signatureButton}
            onPress={() => setShowSignaturePad(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={24} color="#f97316" />
            <Text style={styles.signatureButtonText}>Tap to sign</Text>
          </TouchableOpacity>
        )}
        
        {/* Full screen signature modal */}
        <Modal
          visible={showSignaturePad}
          animationType="slide"
          onRequestClose={() => setShowSignaturePad(false)}
        >
          <View style={styles.signatureModalContainer}>
            <View style={styles.signatureModalHeader}>
              <TouchableOpacity onPress={() => setShowSignaturePad(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.signatureModalTitle}>Sign Below</Text>
              <TouchableOpacity onPress={handleClear}>
                <Text style={styles.signatureClearText}>Clear</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.signatureCanvasContainer}>
              <SignatureScreen
                ref={signatureRef}
                onOK={handleSignature}
                onEmpty={() => {}}
                onBegin={() => console.log('Signature started')}
                autoClear={false}
                descriptionText=""
                clearText="Clear"
                confirmText="Save"
                webStyle={`
                  .m-signature-pad {
                    box-shadow: none;
                    border: none;
                    background-color: #1a1a1a;
                    height: 100%;
                    width: 100%;
                  }
                  .m-signature-pad--body {
                    border: 2px dashed #444;
                    border-radius: 12px;
                    background-color: #1a1a1a;
                  }
                  .m-signature-pad--body canvas {
                    background-color: #1a1a1a;
                  }
                  .m-signature-pad--footer {
                    display: none;
                  }
                  body {
                    background-color: #1a1a1a;
                  }
                `}
                backgroundColor="#1a1a1a"
                penColor="#ffffff"
                minWidth={2}
                maxWidth={4}
              />
            </View>
            
            <View style={styles.signatureModalFooter}>
              <Text style={styles.signatureHint}>
                Draw your signature above
              </Text>
              <TouchableOpacity 
                style={styles.signatureConfirmButton}
                onPress={() => signatureRef.current?.readSignature()}
              >
                <Text style={styles.signatureConfirmText}>Confirm Signature</Text>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        
        {renderError()}
      </View>
    );
  }

  // Unsupported field type - show fallback
  return (
    <View style={styles.fieldContainer}>
      {renderLabel()}
      <View style={styles.unsupportedContainer}>
        <Ionicons name="warning" size={20} color="#f59e0b" />
        <Text style={styles.unsupportedText}>
          Field type "{field.type}" not supported on mobile. Complete on web.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldContainer: {
    marginBottom: 20,
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
  textInput: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  error: {
    color: '#ef4444',
    fontSize: 13,
    marginTop: 6,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#444',
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#f97316',
    borderColor: '#f97316',
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#fff',
  },
  selectButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectText: {
    fontSize: 15,
    color: '#fff',
  },
  placeholder: {
    color: '#555',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  optionSelected: {
    backgroundColor: '#f9731610',
  },
  optionText: {
    fontSize: 16,
    color: '#fff',
  },
  optionTextSelected: {
    color: '#f97316',
    fontWeight: '600',
  },
  multiSelectContainer: {
    gap: 8,
  },
  multiSelectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    padding: 12,
  },
  multiSelectSelected: {
    borderColor: '#f97316',
    backgroundColor: '#f9731610',
  },
  multiSelectLabel: {
    fontSize: 15,
    color: '#fff',
    marginLeft: 10,
  },
  // Fixed-height radio card for rapid tapping
  radioCard: {
    minHeight: 120,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
    padding: 14,
  },
  radioLabelContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    minHeight: 44,
  },
  radioCardLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    lineHeight: 20,
    flex: 1,
  },
  radioRowHorizontal: {
    flexDirection: 'row',
    gap: 8,
  },
  radioRowVertical: {
    flexDirection: 'column',
    gap: 8,
  },
  radioButtonCompact: {
    flex: 1,
    backgroundColor: '#252525',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  radioButtonVertical: {
    backgroundColor: '#252525',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  radioButtonSelected: {
    backgroundColor: '#f97316',
    borderColor: '#f97316',
  },
  radioButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#aaa',
    textAlign: 'center',
  },
  radioButtonTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  unsupportedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f59e0b20',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  unsupportedText: {
    flex: 1,
    fontSize: 13,
    color: '#f59e0b',
  },
  // Fixed-height thumbs card for rapid tapping
  thumbsCard: {
    minHeight: 120, // Fixed height so buttons don't jump
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
    padding: 14,
  },
  thumbsCardContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  thumbsLabelContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    minHeight: 44, // Reserve space for up to ~3 lines
  },
  thumbsLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    lineHeight: 20,
    flex: 1,
  },
  thumbsButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  thumbButtonCompact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252525',
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 6,
  },
  thumbButtonYesActive: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  thumbButtonNoActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  thumbTextCompact: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  thumbTextActive: {
    color: '#fff',
  },
  // Signature styles
  signatureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#f9731640',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 24,
    gap: 10,
  },
  signatureButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#f97316',
  },
  signaturePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#22c55e40',
    borderRadius: 12,
    padding: 16,
  },
  signaturePreview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signatureConfirmed: {
    fontSize: 15,
    fontWeight: '500',
    color: '#22c55e',
  },
  signatureEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  signatureEditText: {
    fontSize: 14,
    color: '#f97316',
    fontWeight: '500',
  },
  signatureModalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  signatureModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#0a0a0a',
  },
  signatureModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  signatureClearText: {
    fontSize: 16,
    color: '#f97316',
    fontWeight: '500',
  },
  signatureCanvasContainer: {
    flex: 1,
    minHeight: 300,
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  signatureModalFooter: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  signatureHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  signatureConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f97316',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  signatureConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

