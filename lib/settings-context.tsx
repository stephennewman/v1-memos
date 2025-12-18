import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'app_settings';

export interface TabSettings {
  home: boolean;
  voice: boolean;
  tasks: boolean;
  notes: boolean;
  insights: boolean;
  topics: boolean;
}

interface SettingsContextType {
  tabs: TabSettings;
  toggleTab: (tab: keyof TabSettings) => void;
  isLoading: boolean;
}

const defaultTabs: TabSettings = {
  home: true,
  voice: true,
  tasks: true,
  notes: true,
  insights: true,
  topics: true,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<TabSettings>(defaultTabs);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setTabs({ ...defaultTabs, ...parsed.tabs });
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Save settings when they change
  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ tabs })).catch(console.error);
    }
  }, [tabs, isLoading]);

  const toggleTab = (tab: keyof TabSettings) => {
    // Ensure at least one tab stays enabled
    const enabledCount = Object.values(tabs).filter(Boolean).length;
    if (tabs[tab] && enabledCount <= 1) {
      return; // Don't allow disabling the last tab
    }
    
    setTabs(prev => ({
      ...prev,
      [tab]: !prev[tab],
    }));
  };

  return (
    <SettingsContext.Provider value={{ tabs, toggleTab, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

