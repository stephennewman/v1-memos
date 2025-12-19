import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { QuickActions, QuickActionContext } from '@/components/CreateButton';
import { QuickTaskModal } from '@/components/QuickTaskModal';
import { QuickTopicModal } from '@/components/QuickTopicModal';
import { QuickNoteModal } from '@/components/QuickNoteModal';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { generateMemos } from '@/lib/api';

interface CreateContextType {
  openCreateMenu: () => void;
  startVoiceRecording: () => void;
}

const CreateContext = createContext<CreateContextType | null>(null);

export function useCreate() {
  const context = useContext(CreateContext);
  if (!context) {
    throw new Error('useCreate must be used within CreateProvider');
  }
  return context;
}

interface CreateProviderProps {
  children: React.ReactNode;
}

export function CreateProvider({ children }: CreateProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);

  // Determine context based on current route
  const getContext = (): QuickActionContext => {
    if (pathname === '/topics' || pathname === '/(tabs)/topics') return 'topics';
    if (pathname === '/voice' || pathname === '/(tabs)/voice') return 'voice';
    if (pathname === '/tasks' || pathname === '/(tabs)/tasks') return 'tasks';
    if (pathname === '/notes' || pathname === '/(tabs)/notes') return 'notes';
    if (pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index') return 'home';
    return 'other';
  };

  const currentContext = getContext();

  const openCreateMenu = useCallback(() => {
    setIsTaskModalOpen(true);
  }, []);

  const startVoiceRecording = useCallback(() => {
    router.push('/record?autoStart=true');
  }, [router]);

  const handleVoicePress = useCallback(() => {
    router.push('/record?autoStart=true');
  }, [router]);

  const handleTaskPress = useCallback(() => {
    setIsTaskModalOpen(true);
  }, []);

  const handleTopicPress = useCallback(() => {
    setIsTopicModalOpen(true);
  }, []);

  const handleNotePress = useCallback(() => {
    setIsNoteModalOpen(true);
  }, []);

  const handleSaveTask = useCallback(async (text: string) => {
    if (!user) return;
    
    const { data, error } = await (supabase as any)
      .from('voice_todos')
      .insert({
        user_id: user.id,
        text,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    
    if (data?.id) {
      router.push(`/task/${data.id}`);
    } else {
      router.push('/(tabs)/tasks');
    }
  }, [user, router]);

  const handleSaveTopic = useCallback(async (title: string, description: string) => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('memo_topics')
      .insert({
        user_id: user.id,
        title,
        description: description || null,
      })
      .select()
      .single();

    if (error) throw error;
    
    if (data?.id) {
      // Navigate first, then generate memos in the background
      router.push(`/topic/${data.id}`);
      
      // Auto-generate initial memos for new topic (fire and forget)
      generateMemos(data.id, 10).catch(err => {
        console.error('Failed to auto-generate memos:', err);
      });
    } else {
      router.push('/(tabs)/topics');
    }
  }, [user, router]);

  const handleSaveNote = useCallback(async (text: string) => {
    if (!user) return;
    
    const { data, error } = await (supabase as any)
      .from('voice_notes')
      .insert({
        user_id: user.id,
        text,
      })
      .select()
      .single();

    if (error) throw error;
    
    if (data?.id) {
      router.push(`/note/${data.id}`);
    } else {
      router.push('/(tabs)/notes');
    }
  }, [user, router]);

  return (
    <CreateContext.Provider value={{ openCreateMenu, startVoiceRecording }}>
      {children}
      
      {/* Quick Actions - context-aware buttons */}
      <QuickActions
        onVoice={handleVoicePress}
        onTask={handleTaskPress}
        onTopic={handleTopicPress}
        onNote={handleNotePress}
        context={currentContext}
      />
      
      {/* Quick Task Modal */}
      <QuickTaskModal
        visible={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
      />
      
      {/* Quick Topic Modal */}
      <QuickTopicModal
        visible={isTopicModalOpen}
        onClose={() => setIsTopicModalOpen(false)}
        onSave={handleSaveTopic}
      />
      
      {/* Quick Note Modal */}
      <QuickNoteModal
        visible={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        onSave={handleSaveNote}
      />
    </CreateContext.Provider>
  );
}
