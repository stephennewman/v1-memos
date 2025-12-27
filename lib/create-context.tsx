import React, { createContext, useContext, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { QuickActions, QuickActionContext } from '@/components/CreateButton';
import { QuickTaskModal } from '@/components/QuickTaskModal';
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
  const pathname = usePathname();
  const { user } = useAuth();

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Determine context based on current route
  const getContext = (): QuickActionContext => {
    if (pathname === '/voice' || pathname === '/(tabs)/voice') return 'voice';
    if (pathname === '/settings' || pathname === '/(tabs)/settings') return 'settings';
    if (pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index') return 'home';
    return 'other';
  };

  const currentContext = getContext();

  // Show button bar on Home and Memos pages only
  const shouldShowButtonBar = (): boolean => {
    return currentContext === 'home' || currentContext === 'voice';
  };

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

  const handleSaveTask = useCallback(async (text: string) => {
    if (!user) return;

    const { data, error } = await supabase
      .from('voice_todos')
      .insert({
        user_id: user.id,
        text,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    // Stay on current page, task will appear in Home
    router.push('/(tabs)');
  }, [user, router]);

  return (
    <CreateContext.Provider value={{ openCreateMenu, startVoiceRecording }}>
      {children}

      {/* Quick Actions - Memo + Task buttons */}
      {shouldShowButtonBar() && (
        <QuickActions
          onVoice={handleVoicePress}
          onTask={handleTaskPress}
          context={currentContext}
        />
      )}

      {/* Quick Task Modal */}
      <QuickTaskModal
        visible={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
      />
    </CreateContext.Provider>
  );
}
