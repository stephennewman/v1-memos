import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as Localization from 'expo-localization';
import { supabase } from './supabase';
import { useAuth } from './auth-context';

interface TimezoneContextType {
  timezone: string;
  timezoneAbbr: string;
  isLoaded: boolean;
  refreshTimezone: () => void;
}

const TimezoneContext = createContext<TimezoneContextType>({
  timezone: 'America/New_York',
  timezoneAbbr: 'EST',
  isLoaded: false,
  refreshTimezone: () => {},
});

export function useTimezone() {
  return useContext(TimezoneContext);
}

interface TimezoneProviderProps {
  children: ReactNode;
}

export function TimezoneProvider({ children }: TimezoneProviderProps) {
  const { user } = useAuth();
  const [timezone, setTimezone] = useState('America/New_York');
  const [timezoneAbbr, setTimezoneAbbr] = useState('EST');
  const [isLoaded, setIsLoaded] = useState(false);

  // Get device timezone and save to profile
  const detectAndSaveTimezone = async () => {
    try {
      // Get device timezone using expo-localization
      const deviceTimezone = Localization.getCalendars()[0]?.timeZone || 
                            Intl.DateTimeFormat().resolvedOptions().timeZone ||
                            'America/New_York';
      
      console.log('[Timezone] Device timezone detected:', deviceTimezone);
      setTimezone(deviceTimezone);
      
      // Get timezone abbreviation
      const abbr = new Date().toLocaleTimeString('en-US', {
        timeZoneName: 'short',
        timeZone: deviceTimezone,
      }).split(' ').pop() || deviceTimezone;
      setTimezoneAbbr(abbr);
      
      // Save to user profile if logged in
      if (user) {
        const { error } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            timezone: deviceTimezone,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'id',
          });
        
        if (error) {
          console.error('[Timezone] Failed to save timezone:', error);
        } else {
          console.log('[Timezone] Saved to profile:', deviceTimezone);
        }
      }
      
      setIsLoaded(true);
    } catch (error) {
      console.error('[Timezone] Error detecting timezone:', error);
      setIsLoaded(true);
    }
  };

  // Detect timezone on mount and when user changes
  useEffect(() => {
    detectAndSaveTimezone();
  }, [user?.id]);

  const refreshTimezone = () => {
    detectAndSaveTimezone();
  };

  return (
    <TimezoneContext.Provider value={{ timezone, timezoneAbbr, isLoaded, refreshTimezone }}>
      {children}
    </TimezoneContext.Provider>
  );
}

// Utility function to format a date in user's timezone
export function formatInTimezone(
  date: Date | string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    ...options,
    timeZone: timezone,
  });
}

// Utility to get "today" in user's timezone
export function getTodayInTimezone(timezone: string): Date {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { timeZone: timezone });
  return new Date(dateStr);
}

// Utility to check if a date is "today" in user's timezone
export function isToday(date: Date | string, timezone: string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  
  const dateStr = d.toLocaleDateString('en-US', { timeZone: timezone });
  const todayStr = today.toLocaleDateString('en-US', { timeZone: timezone });
  
  return dateStr === todayStr;
}

// Utility to check if a date is "tomorrow" in user's timezone
export function isTomorrow(date: Date | string, timezone: string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const dateStr = d.toLocaleDateString('en-US', { timeZone: timezone });
  const tomorrowStr = tomorrow.toLocaleDateString('en-US', { timeZone: timezone });
  
  return dateStr === tomorrowStr;
}

// Hook to get timezone-aware date formatting functions
export function useTimezoneFormatters() {
  const { timezone } = useTimezone();
  const formatRelativeDate = require('./format-date').formatRelativeDate;
  const formatShortDate = require('./format-date').formatShortDate;
  const formatDateTime = require('./format-date').formatDateTime;
  const getDateGroupLabel = require('./format-date').getDateGroupLabel;
  const formatDueDate = require('./format-date').formatDueDate;
  
  return {
    formatRelativeDate: (date: string) => formatRelativeDate(date, timezone),
    formatShortDate: (date: string) => formatShortDate(date, timezone),
    formatDateTime: (date: string) => formatDateTime(date, timezone),
    getDateGroupLabel: (date: string) => getDateGroupLabel(date, timezone),
    formatDueDate: (date: string) => formatDueDate(date, timezone),
    timezone,
  };
}
