import React, { createContext, useContext, useState } from 'react';

type ThemeMode = 'dark' | 'oled';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  colors: {
    background: string;
    card: string;
    cardBorder: string;
    text: string;
    textSecondary: string;
    textMuted: string;
  };
}

const themes = {
  dark: {
    background: '#0a0a0a',
    card: '#111',
    cardBorder: '#1a1a1a',
    text: '#fff',
    textSecondary: '#888',
    textMuted: '#444',
  },
  oled: {
    background: '#000',
    card: '#0a0a0a',
    cardBorder: '#111',
    text: '#fff',
    textSecondary: '#888',
    textMuted: '#333',
  },
};

const ThemeContext = createContext<ThemeContextType>({
  mode: 'dark',
  setMode: () => {},
  colors: themes.dark,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  const value: ThemeContextType = {
    mode,
    setMode,
    colors: themes[mode],
  };

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

