import React, { createContext, useContext, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { CreateButton } from '@/components/CreateButton';
import { CreateModal, CreateType } from '@/components/CreateModal';
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
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);

  const openCreateMenu = useCallback(() => {
    setIsMenuOpen(true);
  }, []);

  const startVoiceRecording = useCallback(() => {
    // Navigate to voice tab to start recording
    router.push('/(tabs)/voice');
  }, [router]);

  const handleCreateSelect = useCallback((type: CreateType) => {
    setIsMenuOpen(false);
    
    switch (type) {
      case 'voice':
        // Navigate to voice tab which has the recorder
        router.push('/(tabs)/voice');
        break;
      case 'task':
        setIsTaskModalOpen(true);
        break;
      case 'topic':
        setIsTopicModalOpen(true);
        break;
    }
  }, [router]);

  const handleSaveTask = useCallback(async (text: string) => {
    if (!user) return;
    
    const { error } = await (supabase as any)
      .from('voice_todos')
      .insert({
        user_id: user.id,
        text,
        status: 'pending',
      });

    if (error) throw error;
    
    // Navigate to tasks tab
    router.push('/(tabs)/tasks');
  }, [user, router]);

  const handleSaveTopic = useCallback(async (title: string, description: string) => {
    if (!user) return;
    
    const { error } = await supabase
      .from('memo_topics')
      .insert({
        user_id: user.id,
        title,
        description: description || null,
      });

    if (error) throw error;
    
    // Navigate to topics tab
    router.push('/(tabs)');
  }, [user, router]);

  return (
    <CreateContext.Provider value={{ openCreateMenu, startVoiceRecording }}>
      {children}
      
      {/* FAB - Always visible */}
      <CreateButton 
        onPress={openCreateMenu} 
        isOpen={isMenuOpen} 
      />
      
      {/* Create Menu Modal */}
      <CreateModal
        visible={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onSelect={handleCreateSelect}
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

