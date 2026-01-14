/**
 * Shared date formatting utilities for consistent date display across the app
 * All functions support optional timezone parameter for timezone-aware formatting
 */

/**
 * Get "today" in a specific timezone
 */
function getTodayInTimezone(timezone?: string): Date {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { timeZone: timezone };
  const dateStr = now.toLocaleDateString('en-US', options);
  return new Date(dateStr);
}

/**
 * Get a date in a specific timezone (start of day)
 */
function getDateInTimezone(date: Date, timezone?: string): Date {
  const options: Intl.DateTimeFormatOptions = { timeZone: timezone };
  const dateStr = date.toLocaleDateString('en-US', options);
  return new Date(dateStr);
}

/**
 * Format a date string to a relative time (e.g., "Just now", "5m ago", "2d ago")
 */
export function formatRelativeDate(dateStr: string, timezone?: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone });
}

/**
 * Format a date string to a short date (e.g., "Today", "Yesterday", "Mon", "Dec 25")
 */
export function formatShortDate(dateStr: string, timezone?: string): string {
  const date = new Date(dateStr);
  const today = getTodayInTimezone(timezone);
  const itemDate = getDateInTimezone(date, timezone);
  
  const diffMs = today.getTime() - itemDate.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';
  if (diffDays < 7 && diffDays > 0) return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone });
  if (diffDays > -7 && diffDays < 0) return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone });
}

/**
 * Format a date string to include time (e.g., "Dec 25, 10:30 AM")
 */
export function formatDateTime(dateStr: string, timezone?: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  });
}

/**
 * Get a date label for grouping (e.g., "Today", "Yesterday", "Monday", "Dec 25")
 */
export function getDateGroupLabel(dateStr: string, timezone?: string): string {
  const date = new Date(dateStr);
  const today = getTodayInTimezone(timezone);
  const itemDate = getDateInTimezone(date, timezone);

  const diffMs = today.getTime() - itemDate.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';
  if (diffDays < 7 && diffDays > 0) return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
  if (diffDays > -7 && diffDays < 0) return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone });
}

/**
 * Format a due date for display (e.g., "Due today", "Due tomorrow", "Overdue")
 */
export function formatDueDate(dateStr: string, timezone?: string): { label: string; isOverdue: boolean; isToday: boolean } {
  const date = new Date(dateStr);
  const today = getTodayInTimezone(timezone);
  const itemDate = getDateInTimezone(date, timezone);

  const diffMs = itemDate.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  if (diffDays < 0) {
    return { label: `Overdue (${Math.abs(diffDays)}d)`, isOverdue: true, isToday: false };
  }
  if (diffDays === 0) {
    return { label: 'Due today', isOverdue: false, isToday: true };
  }
  if (diffDays === 1) {
    return { label: 'Due tomorrow', isOverdue: false, isToday: false };
  }
  if (diffDays < 7) {
    return { label: `Due ${date.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone })}`, isOverdue: false, isToday: false };
  }
  return { label: `Due ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone })}`, isOverdue: false, isToday: false };
}
