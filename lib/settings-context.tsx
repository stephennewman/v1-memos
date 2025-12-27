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
  forms: boolean;
}

export interface ButtonSettings {
  topic: boolean;
  voice: boolean;
  task: boolean;
  note: boolean;
}

// Which screens should show the button bar
export interface ButtonBarVisibility {
  home: boolean;
  voice: boolean;
  tasks: boolean;
  notes: boolean;
  topics: boolean;
  insights: boolean;
  detailPages: boolean;
}

// Customizable button labels
export interface ButtonLabels {
  topic: string;
  voice: string;
  task: string;
  note: string;
}

export type TabKey = keyof TabSettings;
export type ButtonKey = keyof ButtonSettings;
export type ButtonBarScreenKey = keyof ButtonBarVisibility;
export type TimeTab = 'past' | 'today' | 'future';

interface SettingsContextType {
  tabs: TabSettings;
  toggleTab: (tab: keyof TabSettings) => void;
  tabOrder: TabKey[];
  reorderTab: (fromIndex: number, toIndex: number) => void;
  buttons: ButtonSettings;
  toggleButton: (button: keyof ButtonSettings) => void;
  buttonOrder: ButtonKey[];
  reorderButton: (fromIndex: number, toIndex: number) => void;
  buttonBarVisibility: ButtonBarVisibility;
  toggleButtonBarScreen: (screen: ButtonBarScreenKey) => void;
  buttonLabels: ButtonLabels;
  updateButtonLabel: (button: ButtonKey, label: string) => void;
  timeTab: TimeTab;
  setTimeTab: (tab: TimeTab) => void;
  isLoading: boolean;
}

const defaultTabs: TabSettings = {
  home: true,
  voice: true,
  tasks: true,
  notes: true,
  insights: true,
  topics: true,
  forms: false,  // Hidden by default
};

const defaultButtons: ButtonSettings = {
  topic: true,
  voice: true,
  task: true,
  note: true,
};

const defaultButtonBarVisibility: ButtonBarVisibility = {
  home: true,
  voice: true,
  tasks: true,
  notes: true,
  topics: true,
  insights: true,
  detailPages: false,
};

const defaultButtonLabels: ButtonLabels = {
  topic: 'Card',
  voice: 'Memo',
  task: 'Task',
  note: 'Note',
};

const defaultTabOrder: TabKey[] = ['home', 'voice', 'tasks', 'notes', 'topics', 'insights', 'forms'];
const defaultButtonOrder: ButtonKey[] = ['topic', 'voice', 'task', 'note'];

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<TabSettings>(defaultTabs);
  const [tabOrder, setTabOrder] = useState<TabKey[]>(defaultTabOrder);
  const [buttons, setButtons] = useState<ButtonSettings>(defaultButtons);
  const [buttonOrder, setButtonOrder] = useState<ButtonKey[]>(defaultButtonOrder);
  const [buttonBarVisibility, setButtonBarVisibility] = useState<ButtonBarVisibility>(defaultButtonBarVisibility);
  const [buttonLabels, setButtonLabels] = useState<ButtonLabels>(defaultButtonLabels);
  const [timeTab, setTimeTab] = useState<TimeTab>('today');
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setTabs({ ...defaultTabs, ...parsed.tabs });
          setButtons({ ...defaultButtons, ...parsed.buttons });
          setButtonBarVisibility({ ...defaultButtonBarVisibility, ...parsed.buttonBarVisibility });
          // Always use default labels (app-defined, not user-customizable)
          setButtonLabels(defaultButtonLabels);
          // Load order if saved, otherwise use defaults
          if (parsed.tabOrder && Array.isArray(parsed.tabOrder)) {
            // Ensure all keys are present (in case new tabs were added)
            const savedOrder = parsed.tabOrder.filter((k: TabKey) => defaultTabOrder.includes(k));
            const missingKeys = defaultTabOrder.filter(k => !savedOrder.includes(k));
            setTabOrder([...savedOrder, ...missingKeys]);
          }
          if (parsed.buttonOrder && Array.isArray(parsed.buttonOrder)) {
            const savedOrder = parsed.buttonOrder.filter((k: ButtonKey) => defaultButtonOrder.includes(k));
            const missingKeys = defaultButtonOrder.filter(k => !savedOrder.includes(k));
            setButtonOrder([...savedOrder, ...missingKeys]);
          }
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
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ 
        tabs, buttons, tabOrder, buttonOrder, buttonBarVisibility, buttonLabels 
      })).catch(console.error);
    }
  }, [tabs, buttons, tabOrder, buttonOrder, buttonBarVisibility, buttonLabels, isLoading]);

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

  const reorderTab = (fromIndex: number, toIndex: number) => {
    setTabOrder(prev => {
      const newOrder = [...prev];
      const [moved] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, moved);
      return newOrder;
    });
  };

  const toggleButton = (button: keyof ButtonSettings) => {
    setButtons(prev => ({
      ...prev,
      [button]: !prev[button],
    }));
  };

  const reorderButton = (fromIndex: number, toIndex: number) => {
    setButtonOrder(prev => {
      const newOrder = [...prev];
      const [moved] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, moved);
      return newOrder;
    });
  };

  const toggleButtonBarScreen = (screen: ButtonBarScreenKey) => {
    setButtonBarVisibility(prev => ({
      ...prev,
      [screen]: !prev[screen],
    }));
  };

  const updateButtonLabel = (button: ButtonKey, label: string) => {
    setButtonLabels(prev => ({
      ...prev,
      [button]: label,
    }));
  };

  return (
    <SettingsContext.Provider value={{ 
      tabs, toggleTab, tabOrder, reorderTab,
      buttons, toggleButton, buttonOrder, reorderButton,
      buttonBarVisibility, toggleButtonBarScreen,
      buttonLabels, updateButtonLabel,
      timeTab, setTimeTab,
      isLoading 
    }}>
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

