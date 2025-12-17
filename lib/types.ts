// Memo Types - Matches V1 database schema

export interface MemoTopic {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_at: string | null;
}

export interface Memo {
  id: string;
  topic_id: string;
  content: string;
  source: 'ai' | 'user' | null;
  status: 'active' | 'kept' | 'kicked' | null;
  created_at: string | null;
  actioned_at: string | null;
}

// ============================================================================
// Voice Entry Types
// ============================================================================

export type VoiceEntryType = 
  | 'journal' 
  | 'question' 
  | 'prayer' 
  | 'idea' 
  | 'task' 
  | 'memory' 
  | 'freeform'
  | 'meeting';

export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TodoStatus = 'pending' | 'completed' | 'dismissed';

export interface ExtractedTodo {
  text: string;
  due_date?: string;
  priority?: TodoPriority;
}

export interface ExtractedDate {
  date: string;
  description: string;
}

export interface ExtractedQuestion {
  text: string;
  context?: string;
}

export interface ExtractedPerson {
  name: string;
  context?: string;
}

export interface ExtractedCommitment {
  text: string;
  timeframe?: string;
}

export interface VoiceEntry {
  id: string;
  user_id: string;
  
  // Audio
  audio_url?: string;
  audio_duration_seconds?: number;
  
  // Transcription
  transcript?: string;
  transcript_confidence?: number;
  
  // AI Extraction
  entry_type: VoiceEntryType;
  summary?: string;
  
  // Analytics
  sentiment_score?: number;
  sentiment_label?: string;
  filler_words?: Record<string, number>;
  filler_word_count?: number;
  clarity_score?: number;
  word_count?: number;
  words_per_minute?: number;
  
  // Extracted items
  extracted_todos: ExtractedTodo[];
  extracted_notes: string[];  // Non-actionable bullet points
  extracted_dates: ExtractedDate[];
  extracted_questions: ExtractedQuestion[];
  extracted_people: string[];  // Simple array of names
  tags: string[];  // Auto-generated tags
  questions_asked: string[];   // Questions the speaker asked
  commitments: ExtractedCommitment[];  // Things committed to do
  
  is_processed: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Voice Todos
// ============================================================================

export interface VoiceTodo {
  id: string;
  user_id: string;
  entry_id?: string;
  text: string;
  due_date?: string;
  priority: TodoPriority;
  status: TodoStatus;
  original_context?: string;
  created_at: string;
  completed_at?: string;
}

export interface VoiceNote {
  id: string;
  user_id: string;
  entry_id?: string;
  text: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Voice Calendar
// ============================================================================

export interface VoiceCalendarEvent {
  id: string;
  user_id: string;
  entry_id?: string;
  title: string;
  description?: string;
  event_date: string;
  event_end_date?: string;
  is_all_day: boolean;
  created_at: string;
}

// ============================================================================
// Inbox (from V1 Platform)
// ============================================================================

export type InboxItemType = 
  | 'course_assignment'
  | 'assessment'
  | 'form_request'
  | 'notification'
  | 'reminder';

export interface InboxItem {
  id: string;
  user_id: string;
  item_type: InboxItemType;
  title: string;
  description?: string;
  reference_type?: string;
  reference_id?: string;
  due_date?: string;
  priority: TodoPriority;
  is_read: boolean;
  is_actioned: boolean;
  actioned_at?: string;
  source_workspace_id?: string;
  created_at: string;
}

// ============================================================================
// AI Extraction Response
// ============================================================================

export interface VoiceExtractionResult {
  entry_type: VoiceEntryType;
  summary: string;
  sentiment_score: number;
  todos: ExtractedTodo[];
  dates: ExtractedDate[];
  questions: ExtractedQuestion[];
  people: ExtractedPerson[];
  suggested_tags: string[];
}

// ============================================================================
// Entry Type Config
// ============================================================================

export const ENTRY_TYPE_CONFIG: Record<VoiceEntryType, { icon: string; color: string; label: string }> = {
  journal: { icon: 'book', color: '#c4dfc4', label: 'Journal' },
  question: { icon: 'help-circle', color: '#93c5fd', label: 'Question' },
  prayer: { icon: 'heart', color: '#fda4af', label: 'Prayer' },
  idea: { icon: 'bulb', color: '#fcd34d', label: 'Idea' },
  task: { icon: 'checkbox', color: '#a78bfa', label: 'Task' },
  memory: { icon: 'camera', color: '#fdba74', label: 'Memory' },
  freeform: { icon: 'mic', color: '#9ca3af', label: 'Note' },
  meeting: { icon: 'people', color: '#60a5fa', label: 'Session' },
};

export const PRIORITY_CONFIG: Record<TodoPriority, { color: string; label: string }> = {
  low: { color: '#9ca3af', label: 'Low' },
  medium: { color: '#fcd34d', label: 'Medium' },
  high: { color: '#fb923c', label: 'High' },
  urgent: { color: '#ef4444', label: 'Urgent' },
};
