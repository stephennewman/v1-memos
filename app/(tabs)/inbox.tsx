import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { InboxItem, InboxItemType } from '@/lib/types';
import { PRIORITY_CONFIG } from '@/lib/types';

const INBOX_TYPE_CONFIG: Record<InboxItemType, { icon: string; color: string; label: string }> = {
  course_assignment: { icon: 'book', color: '#93c5fd', label: 'Course' },
  assessment: { icon: 'document-text', color: '#a78bfa', label: 'Assessment' },
  form_request: { icon: 'clipboard', color: '#fcd34d', label: 'Form' },
  notification: { icon: 'notifications', color: '#9ca3af', label: 'Notice' },
  reminder: { icon: 'alarm', color: '#fb923c', label: 'Reminder' },
};

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();
  
  const [items, setItems] = useState<InboxItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadInbox = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_inbox')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        // Table might not be in schema cache yet
        console.log('Could not load inbox:', error.message);
        setItems([]);
      } else {
        setItems(data || []);
      }
    } catch (error) {
      console.error('Error loading inbox:', error);
      setItems([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (user && !authLoading) {
        loadInbox(user.id);
      } else if (!authLoading && !user) {
        setIsLoading(false);
      }
    }, [user, authLoading, loadInbox])
  );

  const onRefresh = useCallback(() => {
    if (!user) return;
    setIsRefreshing(true);
    loadInbox(user.id);
  }, [user, loadInbox]);

  const markAsRead = async (item: InboxItem) => {
    if (item.is_read) return;

    try {
      await supabase
        .from('user_inbox')
        .update({ is_read: true })
        .eq('id', item.id);

      setItems(prev => prev.map(i => 
        i.id === item.id ? { ...i, is_read: true } : i
      ));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleItemPress = async (item: InboxItem) => {
    await markAsRead(item);
    
    // Open in V1 web app if reference exists
    if (item.reference_id) {
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://v1ops.com';
      let url = baseUrl;
      
      switch (item.item_type) {
        case 'course_assignment':
          url = `${baseUrl}/my-courses`;
          break;
        case 'assessment':
          url = `${baseUrl}/assessments`;
          break;
        case 'form_request':
          url = `${baseUrl}/f/${item.reference_id}`;
          break;
        default:
          url = `${baseUrl}/dashboard`;
      }

      Linking.openURL(url);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatDueDate = (dateStr?: string) => {
    if (!dateStr) return null;
    
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / 86400000);

    if (diffDays < 0) return { text: 'Overdue', color: '#ef4444' };
    if (diffDays === 0) return { text: 'Due today', color: '#fcd34d' };
    if (diffDays === 1) return { text: 'Due tomorrow', color: '#fb923c' };
    if (diffDays <= 7) return { text: `Due in ${diffDays} days`, color: '#9ca3af' };
    return { text: `Due ${date.toLocaleDateString()}`, color: '#666' };
  };

  const renderItem = ({ item }: { item: InboxItem }) => {
    const typeConfig = INBOX_TYPE_CONFIG[item.item_type] || INBOX_TYPE_CONFIG.notification;
    const priorityConfig = PRIORITY_CONFIG[item.priority];
    const dueInfo = formatDueDate(item.due_date);

    return (
      <TouchableOpacity
        style={[styles.itemCard, !item.is_read && styles.itemCardUnread]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.7}
      >
        {!item.is_read && <View style={styles.unreadDot} />}
        <View style={[styles.itemIcon, { backgroundColor: `${typeConfig.color}20` }]}>
          <Ionicons name={typeConfig.icon as any} size={20} color={typeConfig.color} />
        </View>
        <View style={styles.itemContent}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.description && (
            <Text style={styles.itemDescription} numberOfLines={2}>
              {item.description}
            </Text>
          )}
          <View style={styles.itemMeta}>
            <Text style={[styles.itemType, { color: typeConfig.color }]}>
              {typeConfig.label}
            </Text>
            {dueInfo && (
              <Text style={[styles.dueText, { color: dueInfo.color }]}>
                {dueInfo.text}
              </Text>
            )}
            <Text style={styles.itemDate}>
              {formatDate(item.created_at)}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#444" />
      </TouchableOpacity>
    );
  };

  const unreadCount = items.filter(i => !i.is_read).length;

  if (isLoading || authLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Inbox</Text>
          <Text style={styles.headerSubtitle}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
          </View>
        )}
      </View>

      {/* Items List */}
      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="mail-outline" size={48} color="#333" />
          </View>
          <Text style={styles.emptyTitle}>Inbox is empty</Text>
          <Text style={styles.emptySubtitle}>
            Assignments and notifications from V1 will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#c4dfc4"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  unreadBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  itemCardUnread: {
    backgroundColor: '#151515',
    borderColor: '#252525',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#c4dfc4',
    position: 'absolute',
    top: 14,
    left: 14,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
  itemDescription: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
    lineHeight: 18,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  itemType: {
    fontSize: 11,
    fontWeight: '500',
  },
  dueText: {
    fontSize: 11,
  },
  itemDate: {
    fontSize: 11,
    color: '#444',
    marginLeft: 'auto',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
});

