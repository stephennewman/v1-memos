import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'app_settings_v2';

export type TimeTab = 'past' | 'today' | 'future';

interface SettingsContextType {
  timeTab: TimeTab;
  setTimeTab: (tab: TimeTab) => void;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [timeTab, setTimeTabState] = useState<TimeTab>('today');
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setTimeTabState(parsed.timeTab || 'today');
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Save settings when they change
  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ timeTab })).catch(console.error);
    }
  }, [timeTab, isLoading]);

  const setTimeTab = (tab: TimeTab) => {
    setTimeTabState(tab);
  };

  return (
    <SettingsContext.Provider value={{ timeTab, setTimeTab, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}
