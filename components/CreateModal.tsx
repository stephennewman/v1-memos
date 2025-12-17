import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type CreateType = 'voice' | 'task' | 'topic';

interface CreateOption {
  type: CreateType;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  color: string;
}

const CREATE_OPTIONS: CreateOption[] = [
  {
    type: 'voice',
    icon: 'mic',
    label: 'Voice Note',
    description: 'Record and transcribe',
    color: '#c4dfc4',
  },
  {
    type: 'task',
    icon: 'checkbox-outline',
    label: 'Task',
    description: 'Add something to do',
    color: '#a78bfa',
  },
  {
    type: 'topic',
    icon: 'bookmark-outline',
    label: 'Topic',
    description: 'Create a memo topic',
    color: '#fcd34d',
  },
];

interface CreateModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: CreateType) => void;
}

export function CreateModal({ visible, onClose, onSelect }: CreateModalProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = React.useRef(new Animated.Value(300)).current;
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleSelect = (type: CreateType) => {
    onSelect(type);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
      </Pressable>

      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + 20,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.handle} />
        <Text style={styles.title}>Create</Text>

        <View style={styles.options}>
          {CREATE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.type}
              style={styles.option}
              onPress={() => handleSelect(option.type)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${option.color}20` }]}>
                <Ionicons name={option.icon} size={24} color={option.color} />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#444" />
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 20,
  },
  options: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  optionDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
});

