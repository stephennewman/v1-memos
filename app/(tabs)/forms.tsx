import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth-context';
import {
  fetchAssignedForms,
  fetchQuickAccessForms,
  fetchCompletedForms,
  FormInstance,
  SimpleForm,
  CompletedFormItem,
} from '@/lib/forms';
import { TabHeader } from '@/components/TabHeader';

type TabType = 'todo' | 'completed';

export default function FormsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('todo');
  const [assignedForms, setAssignedForms] = useState<FormInstance[]>([]);
  const [quickAccessForms, setQuickAccessForms] = useState<SimpleForm[]>([]);
  const [completedForms, setCompletedForms] = useState<CompletedFormItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadForms = useCallback(async (showRefreshing = false) => {
    if (!user) return;

    if (showRefreshing) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [assigned, quick, completed] = await Promise.all([
        fetchAssignedForms(user.id),
        fetchQuickAccessForms(),
        fetchCompletedForms(user.id),
      ]);
      setAssignedForms(assigned);
      setQuickAccessForms(quick);
      setCompletedForms(completed);
    } catch (error) {
      console.error('[Forms] Error loading forms:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadForms();
    }, [loadForms])
  );

  const handleFormPress = (formId: string, instanceId?: string) => {
    if (instanceId) {
      router.push(`/form/${formId}?instanceId=${instanceId}`);
    } else {
      router.push(`/form/${formId}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return '#22c55e';
      case 'in_progress': return '#f59e0b';
      case 'pending': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready': return 'Ready';
      case 'in_progress': return 'In Progress';
      case 'pending': return 'Upcoming';
      default: return status;
    }
  };

  const formatDueDate = (dueAt: string) => {
    const due = new Date(dueAt);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMs < 0) {
      return { text: 'Overdue', color: '#ef4444' };
    } else if (diffHours < 1) {
      return { text: 'Due soon', color: '#f59e0b' };
    } else if (diffHours < 24) {
      return { text: `${diffHours}h left`, color: '#f59e0b' };
    } else if (diffDays === 1) {
      return { text: 'Due tomorrow', color: '#22c55e' };
    } else {
      return { text: `${diffDays} days`, color: '#6b7280' };
    }
  };

  const renderAssignedItem = (instance: FormInstance) => {
    const formTitle = instance.form?.title || instance.instance_name;
    const dueInfo = formatDueDate(instance.due_at);

    return (
      <TouchableOpacity
        style={styles.formCard}
        onPress={() => handleFormPress(instance.form_id, instance.id)}
        activeOpacity={0.7}
      >
        <View style={styles.formHeader}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(instance.status) + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(instance.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(instance.status) }]}>
              {getStatusLabel(instance.status)}
            </Text>
          </View>
          <Text style={[styles.dueText, { color: dueInfo.color }]}>{dueInfo.text}</Text>
        </View>

        <Text style={styles.formTitle}>{formTitle}</Text>

        {instance.form?.description && (
          <Text style={styles.formDescription} numberOfLines={2}>
            {instance.form.description}
          </Text>
        )}

        <View style={styles.formFooter}>
          {instance.form?.ai_voice_enabled && (
            <View style={styles.featureBadge}>
              <Ionicons name="mic" size={12} color="#22c55e" />
              <Text style={styles.featureText}>Voice</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color="#666" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderQuickAccessItem = (form: SimpleForm) => {
    return (
      <TouchableOpacity
        style={styles.quickCard}
        onPress={() => handleFormPress(form.id)}
        activeOpacity={0.7}
      >
        <View style={styles.quickIcon}>
          <Ionicons name="flash" size={20} color="#f97316" />
        </View>
        <View style={styles.quickContent}>
          <Text style={styles.quickTitle}>{form.title}</Text>
          {form.description && (
            <Text style={styles.quickDescription} numberOfLines={1}>
              {form.description}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color="#666" />
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = (title: string, count: number) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.countBadge}>
        <Text style={styles.countText}>{count}</Text>
      </View>
    </View>
  );

  const formatCompletedDate = (completedAt: string) => {
    const date = new Date(completedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      return 'Just now';
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const renderCompletedItem = (item: CompletedFormItem) => {
    const completedDate = formatCompletedDate(item.completed_at);

    return (
      <View style={styles.completedCard} key={item.id}>
        <View style={styles.completedHeader}>
          <View style={styles.completedBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
            <Text style={styles.completedBadgeText}>Completed</Text>
          </View>
          <Text style={styles.completedDate}>{completedDate}</Text>
        </View>
        <Text style={styles.formTitle}>{item.form_title}</Text>
        {item.form_description && (
          <Text style={styles.formDescription} numberOfLines={1}>
            {item.form_description}
          </Text>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <TabHeader title="Forms" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      </View>
    );
  }

  const hasAssigned = assignedForms.length > 0;
  const hasQuickAccess = quickAccessForms.length > 0;
  const hasCompleted = completedForms.length > 0;
  const todoCount = assignedForms.length + quickAccessForms.length;
  const isTodoEmpty = !hasAssigned && !hasQuickAccess;
  const isCompletedEmpty = !hasCompleted;

  return (
    <View style={styles.container}>
      <TabHeader title="Forms" />

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'todo' && styles.tabActive]}
          onPress={() => setActiveTab('todo')}
        >
          <Text style={[styles.tabText, activeTab === 'todo' && styles.tabTextActive]}>
            To Do
          </Text>
          {todoCount > 0 && (
            <View style={[styles.tabBadge, activeTab === 'todo' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'todo' && styles.tabBadgeTextActive]}>
                {todoCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>
            Completed
          </Text>
          {completedForms.length > 0 && (
            <View style={[styles.tabBadge, activeTab === 'completed' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === 'completed' && styles.tabBadgeTextActive]}>
                {completedForms.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {activeTab === 'todo' ? (
        isTodoEmpty ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color="#22c55e" />
            </View>
            <Text style={styles.emptyTitle}>All Caught Up!</Text>
            <Text style={styles.emptyText}>
              No pending forms. Check the Completed tab to see your submissions.
            </Text>
          </View>
        ) : (
          <FlatList
            data={[]}
            renderItem={() => null}
            ListHeaderComponent={() => (
              <View style={styles.content}>
                {hasAssigned && (
                  <View style={styles.section}>
                    {renderSectionHeader('Assigned', assignedForms.length)}
                    {assignedForms.map((instance) => (
                      <View key={instance.id}>
                        {renderAssignedItem(instance)}
                      </View>
                    ))}
                  </View>
                )}

                {hasQuickAccess && (
                  <View style={styles.section}>
                    {renderSectionHeader('Quick Access', quickAccessForms.length)}
                    {quickAccessForms.map((form) => (
                      <View key={form.id}>
                        {renderQuickAccessItem(form)}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadForms(true)}
                tintColor="#f97316"
              />
            }
            contentContainerStyle={styles.listContent}
          />
        )
      ) : (
        isCompletedEmpty ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="clipboard-outline" size={48} color="#444" />
            </View>
            <Text style={styles.emptyTitle}>No Completed Forms</Text>
            <Text style={styles.emptyText}>
              Your completed form submissions will appear here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={completedForms}
            renderItem={({ item }) => renderCompletedItem(item)}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadForms(true)}
                tintColor="#f97316"
              />
            }
            contentContainerStyle={styles.completedList}
          />
        )
      )}
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
  },
  listContent: {
    flexGrow: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  countBadge: {
    backgroundColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
  },
  formCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dueText: {
    fontSize: 12,
    fontWeight: '500',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  formDescription: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },
  formFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  featureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22c55e20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  featureText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22c55e',
    marginLeft: 4,
  },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f9731620',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  quickContent: {
    flex: 1,
  },
  quickTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  quickDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
  },
  tabActive: {
    backgroundColor: '#f97316',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  tabTextActive: {
    color: '#fff',
  },
  tabBadge: {
    backgroundColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
  },
  tabBadgeTextActive: {
    color: '#fff',
  },
  // Completed styles
  completedList: {
    padding: 16,
  },
  completedCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1a3d1a',
  },
  completedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22c55e20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  completedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22c55e',
    marginLeft: 4,
  },
  completedDate: {
    fontSize: 12,
    color: '#666',
  },
});

