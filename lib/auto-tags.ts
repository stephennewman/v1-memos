/**
 * Auto-tagging utility for tasks and notes
 * Extracts hashtags and generates smart tags based on content keywords
 */

// Common keyword patterns mapped to tags
const TAG_PATTERNS: Record<string, string[]> = {
  work: ['meeting', 'email', 'call', 'deadline', 'project', 'client', 'boss', 'office', 'report', 'presentation'],
  personal: ['home', 'family', 'friend', 'birthday', 'anniversary', 'vacation', 'weekend'],
  health: ['doctor', 'gym', 'workout', 'exercise', 'medicine', 'appointment', 'dentist', 'therapy'],
  finance: ['pay', 'bill', 'invoice', 'budget', 'bank', 'money', 'expense', 'refund', 'subscription'],
  shopping: ['buy', 'order', 'amazon', 'grocery', 'store', 'return', 'pickup'],
  travel: ['flight', 'hotel', 'trip', 'passport', 'booking', 'airport', 'uber', 'lyft'],
  learning: ['read', 'book', 'course', 'study', 'learn', 'practice', 'tutorial'],
  urgent: ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'today', 'now'],
};

/**
 * Extract hashtags from text (e.g., #work, #urgent)
 */
function extractHashtags(text: string): string[] {
  const hashtagRegex = /#(\w+)/g;
  const matches = text.match(hashtagRegex);
  if (!matches) return [];
  
  return matches.map(tag => tag.slice(1).toLowerCase());
}

/**
 * Generate smart tags based on keyword patterns
 */
function generateSmartTags(text: string): string[] {
  const lowerText = text.toLowerCase();
  const tags: string[] = [];
  
  for (const [tag, keywords] of Object.entries(TAG_PATTERNS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        tags.push(tag);
        break; // Only add each tag once
      }
    }
  }
  
  return tags;
}

/**
 * Main auto-tag function
 * Returns unique array of tags extracted from text
 */
export function autoGenerateTags(text: string): string[] {
  const hashtags = extractHashtags(text);
  const smartTags = generateSmartTags(text);
  
  // Combine and deduplicate
  const allTags = [...new Set([...hashtags, ...smartTags])];
  
  // Limit to 5 tags max
  return allTags.slice(0, 5);
}

/**
 * Get all unique tags from an array of items
 */
export function getAllUniqueTags(items: Array<{ tags?: string[] }>): string[] {
  const tagSet = new Set<string>();
  
  for (const item of items) {
    if (item.tags) {
      item.tags.forEach(tag => tagSet.add(tag));
    }
  }
  
  return Array.from(tagSet).sort();
}

/**
 * Filter items by tag
 */
export function filterByTag<T extends { tags?: string[] }>(items: T[], tag: string): T[] {
  return items.filter(item => item.tags?.includes(tag));
}

// Tag colors for UI
export const TAG_COLORS: Record<string, string> = {
  work: '#3b82f6',      // blue
  personal: '#8b5cf6',  // purple
  health: '#22c55e',    // green
  finance: '#f59e0b',   // amber
  shopping: '#ec4899',  // pink
  travel: '#06b6d4',    // cyan
  learning: '#6366f1',  // indigo
  urgent: '#ef4444',    // red
  default: '#6b7280',   // gray
};

export function getTagColor(tag: string): string {
  return TAG_COLORS[tag] || TAG_COLORS.default;
}

