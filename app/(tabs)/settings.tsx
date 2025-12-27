import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth, MAX_FREE_TOPICS } from '@/lib/auth-context';
import { useSettings, TabSettings, ButtonSettings, TabKey, ButtonKey, ButtonBarScreenKey, ButtonLabels } from '@/lib/settings-context';

// Label presets for each button type
const labelPresets: Record<ButtonKey, string[]> = {
  topic: ['Snippet', 'New Snippet', '+ Snippet'],
  voice: ['Memo', 'New Memo', '+ Memo'],
  task: ['Task', 'New Task', '+ Task', 'To-Do'],
  note: ['Note', 'New Note', '+ Note'],
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, topicCount, signOut } = useAuth();
  const { 
    tabs, toggleTab, tabOrder, reorderTab, 
    buttons, toggleButton, buttonOrder, reorderButton,
    buttonBarVisibility, toggleButtonBarScreen,
    buttonLabels, updateButtonLabel,
    isLoading 
  } = useSettings();

  const [labelModalVisible, setLabelModalVisible] = useState(false);
  const [editingButton, setEditingButton] = useState<ButtonKey | null>(null);

  const navigationItemsMap: Record<TabKey, { icon: string; label: string }> = {
    home: { icon: 'home', label: 'Home' },
    voice: { icon: 'mic', label: 'Memos' },
    tasks: { icon: 'checkbox-outline', label: 'Tasks' },
    notes: { icon: 'document-text', label: 'Notes' },
    topics: { icon: 'bookmark', label: 'Snippets' },
    insights: { icon: 'analytics', label: 'Insights' },
    forms: { icon: 'reader-outline', label: 'Forms' },
  };

  const buttonItemsMap: Record<ButtonKey, { icon: string; label: string; color: string }> = {
    topic: { icon: 'bookmark', label: buttonLabels?.topic || 'Snippet', color: '#f59e0b' },
    voice: { icon: 'mic', label: buttonLabels?.voice || 'Memo', color: '#22c55e' },
    task: { icon: 'add', label: buttonLabels?.task || 'Task', color: '#3b82f6' },
    note: { icon: 'document-text', label: buttonLabels?.note || 'Note', color: '#a78bfa' },
  };

  const screenVisibilityMap: Record<ButtonBarScreenKey, { icon: string; label: string }> = {
    home: { icon: 'home', label: 'Home' },
    voice: { icon: 'mic', label: 'Memos' },
    tasks: { icon: 'checkbox-outline', label: 'Tasks' },
    notes: { icon: 'document-text', label: 'Notes' },
    topics: { icon: 'bookmark', label: 'Snippets' },
    insights: { icon: 'analytics', label: 'Insights' },
    detailPages: { icon: 'reader-outline', label: 'Detail Pages' },
  };

  // Get ordered items
  const orderedNavItems = tabOrder.map(key => ({ key, ...navigationItemsMap[key] }));
  const orderedButtonItems = buttonOrder.map(key => ({ key, ...buttonItemsMap[key] }));

  const openLabelPicker = (buttonKey: ButtonKey) => {
    setEditingButton(buttonKey);
    setLabelModalVisible(true);
  };

  const selectLabel = (label: string) => {
    if (editingButton) {
      updateButtonLabel(editingButton, label);
    }
    setLabelModalVisible(false);
    setEditingButton(null);
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: signOut,
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Navigation Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Navigation</Text>
          <Text style={styles.sectionHint}>Toggle tabs on/off • Use arrows to reorder</Text>
          <View style={styles.card}>
            {orderedNavItems.map((item, index) => {
              const isEnabled = tabs?.[item.key] ?? true;
              const isFirst = index === 0;
              const isLast = index === orderedNavItems.length - 1;
              return (
                <View
                  key={item.key}
                  style={[
                    styles.navRow,
                    index < orderedNavItems.length - 1 && styles.navRowBorder,
                  ]}
                >
                  <View style={styles.reorderButtons}>
                    <TouchableOpacity
                      onPress={() => !isFirst && reorderTab(index, index - 1)}
                      style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
                      disabled={isFirst}
                    >
                      <Ionicons name="chevron-up" size={16} color={isFirst ? '#333' : '#666'} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => !isLast && reorderTab(index, index + 1)}
                      style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
                      disabled={isLast}
                    >
                      <Ionicons name="chevron-down" size={16} color={isLast ? '#333' : '#666'} />
                    </TouchableOpacity>
                  </View>
                  <Ionicons
                    name={item.icon as any}
                    size={20}
                    color={isEnabled ? '#c4dfc4' : '#444'}
                  />
                  <Text style={[
                    styles.navLabel,
                    !isEnabled && styles.navLabelDisabled
                  ]}>
                    {item.label}
                  </Text>
                  <Switch
                    value={isEnabled}
                    onValueChange={() => toggleTab(item.key)}
                    trackColor={{ false: '#333', true: '#4a6b4a' }}
                    thumbColor={isEnabled ? '#c4dfc4' : '#666'}
                    ios_backgroundColor="#333"
                  />
                </View>
              );
            })}
          </View>
        </View>

        {/* Quick Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <Text style={styles.sectionHint}>Toggle buttons • Tap label to customize • Use arrows to reorder</Text>
          <View style={styles.card}>
            {orderedButtonItems.map((item, index) => {
              const isEnabled = buttons?.[item.key] ?? true;
              const isFirst = index === 0;
              const isLast = index === orderedButtonItems.length - 1;
              return (
                <View
                  key={item.key}
                  style={[
                    styles.navRow,
                    index < orderedButtonItems.length - 1 && styles.navRowBorder,
                  ]}
                >
                  <View style={styles.reorderButtons}>
                    <TouchableOpacity
                      onPress={() => !isFirst && reorderButton(index, index - 1)}
                      style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
                      disabled={isFirst}
                    >
                      <Ionicons name="chevron-up" size={16} color={isFirst ? '#333' : '#666'} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => !isLast && reorderButton(index, index + 1)}
                      style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
                      disabled={isLast}
                    >
                      <Ionicons name="chevron-down" size={16} color={isLast ? '#333' : '#666'} />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.buttonPreview, { backgroundColor: item.color }]}>
                    <Ionicons
                      name={item.icon as any}
                      size={14}
                      color="#fff"
                    />
                  </View>
                  <TouchableOpacity 
                    style={styles.labelButton}
                    onPress={() => openLabelPicker(item.key)}
                  >
                    <Text style={[
                      styles.navLabel,
                      !isEnabled && styles.navLabelDisabled
                    ]}>
                      {item.label}
                    </Text>
                    <Ionicons name="pencil" size={12} color="#555" />
                  </TouchableOpacity>
                  <Switch
                    value={isEnabled}
                    onValueChange={() => toggleButton(item.key)}
                    trackColor={{ false: '#333', true: '#4a6b4a' }}
                    thumbColor={isEnabled ? '#c4dfc4' : '#666'}
                    ios_backgroundColor="#333"
                  />
                </View>
              );
            })}
          </View>
        </View>

        {/* Button Bar Visibility Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Button Bar Visibility</Text>
          <Text style={styles.sectionHint}>Choose which screens show the quick action buttons</Text>
          <View style={styles.card}>
            {(Object.keys(screenVisibilityMap) as ButtonBarScreenKey[]).map((screen, index, arr) => {
              const config = screenVisibilityMap[screen];
              const isEnabled = buttonBarVisibility?.[screen] ?? true;
              return (
                <View
                  key={screen}
                  style={[
                    styles.navRow,
                    index < arr.length - 1 && styles.navRowBorder,
                  ]}
                >
                  <Ionicons
                    name={config.icon as any}
                    size={20}
                    color={isEnabled ? '#c4dfc4' : '#444'}
                  />
                  <Text style={[
                    styles.navLabel,
                    !isEnabled && styles.navLabelDisabled
                  ]}>
                    {config.label}
                  </Text>
                  <Switch
                    value={isEnabled}
                    onValueChange={() => toggleButtonBarScreen(screen)}
                    trackColor={{ false: '#333', true: '#4a6b4a' }}
                    thumbColor={isEnabled ? '#c4dfc4' : '#666'}
                    ios_backgroundColor="#333"
                  />
                </View>
              );
            })}
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="person-outline" size={20} color="#666" />
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{user?.email || 'Unknown'}</Text>
            </View>
          </View>
        </View>

        {/* Usage Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Usage</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="bookmark-outline" size={20} color="#666" />
              <Text style={styles.rowLabel}>Snippets</Text>
              <Text style={styles.rowValue}>{topicCount} / {MAX_FREE_TOPICS}</Text>
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(topicCount / MAX_FREE_TOPICS) * 100}%` }
                ]}
              />
            </View>
            <Text style={styles.usageHint}>
              {topicCount >= MAX_FREE_TOPICS
                ? 'Snippet limit reached. More coming soon!'
                : `${MAX_FREE_TOPICS - topicCount} topics remaining`
              }
            </Text>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="information-circle-outline" size={20} color="#666" />
              <Text style={styles.rowLabel}>Version</Text>
              <Text style={styles.rowValue}>1.0.0</Text>
            </View>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#ff6b6b" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footer}>
          Memos by Outcome View
        </Text>
      </ScrollView>

      {/* Label Picker Modal */}
      <Modal
        visible={labelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLabelModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setLabelModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Choose Label for {editingButton ? buttonItemsMap[editingButton].label : ''}
            </Text>
            {editingButton && labelPresets[editingButton].map((label) => (
              <TouchableOpacity
                key={label}
                style={[
                  styles.labelOption,
                  buttonLabels?.[editingButton] === label && styles.labelOptionActive
                ]}
                onPress={() => selectLabel(label)}
              >
                <Text style={[
                  styles.labelOptionText,
                  buttonLabels?.[editingButton] === label && styles.labelOptionTextActive
                ]}>
                  {label}
                </Text>
                {buttonLabels?.[editingButton] === label && (
                  <Ionicons name="checkmark" size={18} color="#c4dfc4" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginLeft: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: '#555',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  rowValue: {
    fontSize: 16,
    color: '#666',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  navRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  navLabel: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  navLabelDisabled: {
    color: '#555',
  },
  buttonPreview: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reorderButtons: {
    flexDirection: 'column',
    marginRight: 4,
  },
  reorderBtn: {
    padding: 2,
  },
  reorderBtnDisabled: {
    opacity: 0.3,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#c4dfc4',
    borderRadius: 2,
  },
  usageHint: {
    fontSize: 13,
    color: '#666',
    padding: 16,
    paddingTop: 12,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff6b6b',
  },
  footer: {
    textAlign: 'center',
    color: '#333',
    fontSize: 13,
    marginTop: 32,
    marginBottom: 16,
  },
  labelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  labelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#222',
    marginBottom: 8,
  },
  labelOptionActive: {
    backgroundColor: '#2a3a2a',
    borderWidth: 1,
    borderColor: '#4a6b4a',
  },
  labelOptionText: {
    fontSize: 15,
    color: '#aaa',
  },
  labelOptionTextActive: {
    color: '#c4dfc4',
    fontWeight: '500',
  },
});


