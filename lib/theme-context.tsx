import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@memotalk_theme';

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  card: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  success: string;
  warning: string;
  error: string;
  taskBlue: string;
  notesPurple: string;
  memoGreen: string;
}

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  colors: ThemeColors;
  isDark: boolean;
}

const themes: Record<ThemeMode, ThemeColors> = {
  light: {
    background: '#f8f9fa',
    backgroundSecondary: '#ffffff',
    card: '#ffffff',
    cardBorder: '#e9ecef',
    text: '#212529',
    textSecondary: '#6c757d',
    textMuted: '#adb5bd',
    accent: '#f472b6',
    accentLight: '#fbcfe8',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    taskBlue: '#3b82f6',
    notesPurple: '#8b5cf6',
    memoGreen: '#22c55e',
  },
  dark: {
    background: '#0a0a0a',
    backgroundSecondary: '#111111',
    card: '#1a1a1a',
    cardBorder: '#2a2a2a',
    text: '#ffffff',
    textSecondary: '#888888',
    textMuted: '#444444',
    accent: '#f472b6',
    accentLight: '#831843',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    taskBlue: '#3b82f6',
    notesPurple: '#a78bfa',
    memoGreen: '#22c55e',
  },
};

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  setMode: () => {},
  toggleMode: () => {},
  colors: themes.light,
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved theme on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_KEY);
        if (saved === 'dark' || saved === 'light') {
          setModeState(saved);
        }
      } catch (e) {
        console.log('Failed to load theme:', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadTheme();
  }, []);

  // Save theme when changed
  const setMode = async (newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      await AsyncStorage.setItem(THEME_KEY, newMode);
    } catch (e) {
      console.log('Failed to save theme:', e);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  const value: ThemeContextType = {
    mode,
    setMode,
    toggleMode,
    colors: themes[mode],
    isDark: mode === 'dark',
  };

  // Don't render until theme is loaded to prevent flash
  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
