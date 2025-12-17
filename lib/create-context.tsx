import React, { createContext, useContext, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { QuickActions } from '@/components/CreateButton';
import { QuickTaskModal } from '@/components/QuickTaskModal';
import { QuickTopicModal } from '@/components/QuickTopicModal';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

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
  const { user } = useAuth();
  
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);

  const openCreateMenu = useCallback(() => {
    // Open task modal as default action
    setIsTaskModalOpen(true);
  }, []);

  const startVoiceRecording = useCallback(() => {
    // Go directly to recording
    router.push('/record?autoStart=true');
  }, [router]);

  const handleVoicePress = useCallback(() => {
    // Start recording immediately
    router.push('/record?autoStart=true');
  }, [router]);

  const handleTaskPress = useCallback(() => {
    setIsTaskModalOpen(true);
  }, []);

  const handleTopicPress = useCallback(() => {
    setIsTopicModalOpen(true);
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
    
    // Navigate to task detail page
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
    
    // Navigate to topic detail page
    if (data?.id) {
      router.push(`/topic/${data.id}`);
    } else {
      router.push('/(tabs)');
    }
  }, [user, router]);

  return (
    <CreateContext.Provider value={{ openCreateMenu, startVoiceRecording }}>
      {children}
      
      {/* Quick Actions - 3 buttons for Voice, Task, Topic */}
      <QuickActions
        onVoice={handleVoicePress}
        onTask={handleTaskPress}
        onTopic={handleTopicPress}
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
    </CreateContext.Provider>
  );
}

