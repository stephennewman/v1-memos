// Prioritizer Algorithm
// Analyzes tasks and notes to determine what to focus on TODAY

import { VoiceTodo, VoiceNote, TodoPriority } from './types';

// ============================================================================
// Types
// ============================================================================

export interface PrioritizedTask {
  task: VoiceTodo;
  score: number;
  reasoning: string;
  factors: PriorityFactor[];
  relatedNotes: VoiceNote[];
}

export interface PriorityFactor {
  name: string;
  impact: number; // Points added/subtracted
  description: string;
}

export interface PrioritizerResult {
  topPriorities: PrioritizedTask[];
  totalPendingTasks: number;
  analysisTimestamp: string;
  usedLLM: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const PRIORITY_WEIGHTS: Record<TodoPriority, number> = {
  urgent: 40,
  high: 25,
  medium: 10,
  low: 0,
};

const URGENCY_KEYWORDS = [
  'asap', 'urgent', 'immediately', 'critical', 'deadline',
  'today', 'tonight', 'now', 'right away', 'emergency',
  'important', 'priority', 'crucial', 'must', 'need to',
];

const TIME_SENSITIVE_KEYWORDS = [
  'tomorrow', 'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday', 'this week', 'next week',
  'end of day', 'eod', 'by friday', 'before', 'meeting',
];

// ============================================================================
// Helper Functions
// ============================================================================

function daysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function daysUntil(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function extractKeywords(text: string): string[] {
  // Extract significant words (3+ chars, not common stop words)
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
    'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has',
    'have', 'been', 'would', 'could', 'their', 'what', 'from',
    'they', 'will', 'with', 'this', 'that', 'about', 'which',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !stopWords.has(word));
}

function countCrossReferences(taskText: string, notes: VoiceNote[]): number {
  const taskKeywords = extractKeywords(taskText);
  let matches = 0;

  for (const note of notes) {
    const noteKeywords = extractKeywords(note.text);
    const hasOverlap = taskKeywords.some(tk =>
      noteKeywords.some(nk => nk.includes(tk) || tk.includes(nk))
    );
    if (hasOverlap) matches++;
  }

  return matches;
}

function findRelatedNotes(task: VoiceTodo, notes: VoiceNote[]): VoiceNote[] {
  const taskKeywords = extractKeywords(task.text);

  return notes.filter(note => {
    // Same entry = related
    if (task.entry_id && note.entry_id === task.entry_id) return true;

    // Keyword overlap = related
    const noteKeywords = extractKeywords(note.text);
    return taskKeywords.some(tk =>
      noteKeywords.some(nk => nk.includes(tk) || tk.includes(nk))
    );
  }).slice(0, 3); // Max 3 related notes
}

// ============================================================================
// Core Algorithm
// ============================================================================

export function calculateTaskScore(
  task: VoiceTodo,
  notes: VoiceNote[]
): { score: number; factors: PriorityFactor[] } {
  const factors: PriorityFactor[] = [];
  let score = 50; // Start at midpoint

  // 1. Priority weight (0-40 points)
  const priorityPoints = PRIORITY_WEIGHTS[task.priority] || 0;
  if (priorityPoints > 0) {
    factors.push({
      name: 'Priority Level',
      impact: priorityPoints,
      description: `Marked as ${task.priority} priority`,
    });
    score += priorityPoints;
  }

  // 2. Age factor (0-20 points) - older incomplete tasks bubble up
  const daysOld = daysSince(task.created_at);
  if (daysOld > 0) {
    // Logarithmic scale so it doesn't grow forever
    const agePoints = Math.min(Math.round(Math.log2(daysOld + 1) * 5), 20);
    factors.push({
      name: 'Age',
      impact: agePoints,
      description: `Pending for ${daysOld} day${daysOld === 1 ? '' : 's'}`,
    });
    score += agePoints;
  }

  // 3. Due date proximity (0-35 points)
  if (task.due_date) {
    const daysLeft = daysUntil(task.due_date);
    let duePoints = 0;
    let dueDescription = '';

    if (daysLeft < 0) {
      duePoints = 35;
      dueDescription = `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'}!`;
    } else if (daysLeft === 0) {
      duePoints = 30;
      dueDescription = 'Due today!';
    } else if (daysLeft === 1) {
      duePoints = 25;
      dueDescription = 'Due tomorrow';
    } else if (daysLeft <= 3) {
      duePoints = 18;
      dueDescription = `Due in ${daysLeft} days`;
    } else if (daysLeft <= 7) {
      duePoints = 10;
      dueDescription = 'Due this week';
    }

    if (duePoints > 0) {
      factors.push({
        name: 'Due Date',
        impact: duePoints,
        description: dueDescription,
      });
      score += duePoints;
    }
  }

  // 4. Urgency keywords (0-15 points)
  const taskLower = task.text.toLowerCase();
  const matchedUrgent = URGENCY_KEYWORDS.filter(k => taskLower.includes(k));
  if (matchedUrgent.length > 0) {
    const urgentPoints = Math.min(matchedUrgent.length * 8, 15);
    factors.push({
      name: 'Urgency Signal',
      impact: urgentPoints,
      description: `Contains: ${matchedUrgent.slice(0, 2).join(', ')}`,
    });
    score += urgentPoints;
  }

  // 5. Time-sensitive keywords (0-10 points)
  const matchedTime = TIME_SENSITIVE_KEYWORDS.filter(k => taskLower.includes(k));
  if (matchedTime.length > 0) {
    const timePoints = Math.min(matchedTime.length * 5, 10);
    factors.push({
      name: 'Time Reference',
      impact: timePoints,
      description: `Mentions: ${matchedTime.slice(0, 2).join(', ')}`,
    });
    score += timePoints;
  }

  // 6. Cross-reference boost (0-15 points)
  const crossRefs = countCrossReferences(task.text, notes);
  if (crossRefs > 0) {
    const refPoints = Math.min(crossRefs * 5, 15);
    factors.push({
      name: 'Context',
      impact: refPoints,
      description: `Referenced in ${crossRefs} note${crossRefs === 1 ? '' : 's'}`,
    });
    score += refPoints;
  }

  // 7. Short task penalty (-5 points) - very short tasks might be less defined
  if (task.text.length < 15) {
    factors.push({
      name: 'Detail',
      impact: -5,
      description: 'Task is vague/short',
    });
    score -= 5;
  }

  // Cap score at 100
  return {
    score: Math.max(0, Math.min(score, 100)),
    factors
  };
}

function generateReasoning(factors: PriorityFactor[]): string {
  if (factors.length === 0) return 'Standard priority task';

  // Sort by impact and take top factors
  const topFactors = [...factors]
    .filter(f => f.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 2);

  if (topFactors.length === 0) return 'Standard priority task';

  return topFactors.map(f => f.description).join('. ');
}

// ============================================================================
// Main Prioritizer Function
// ============================================================================

export function prioritizeTasks(
  tasks: VoiceTodo[],
  notes: VoiceNote[],
  limit: number = 5
): PrioritizerResult {
  // Filter to only pending tasks
  const pendingTasks = tasks.filter(t => t.status === 'pending');

  // Score each task
  const scoredTasks: PrioritizedTask[] = pendingTasks.map(task => {
    const { score, factors } = calculateTaskScore(task, notes);
    const relatedNotes = findRelatedNotes(task, notes);

    return {
      task,
      score,
      factors,
      reasoning: generateReasoning(factors),
      relatedNotes,
    };
  });

  // Sort by score descending
  scoredTasks.sort((a, b) => b.score - a.score);

  return {
    topPriorities: scoredTasks.slice(0, limit),
    totalPendingTasks: pendingTasks.length,
    analysisTimestamp: new Date().toISOString(),
    usedLLM: false,
  };
}

// ============================================================================
// LLM Enhancement (to be called via API)
// ============================================================================

export function prepareLLMContext(
  topTasks: PrioritizedTask[],
  allNotes: VoiceNote[]
): string {
  // Build context for LLM analysis
  const tasksSummary = topTasks.map((t, i) =>
    `${i + 1}. "${t.task.text}" (Score: ${t.score}, ${t.reasoning})`
  ).join('\n');

  const notesSummary = allNotes.slice(0, 10).map(n =>
    `- ${n.text.slice(0, 100)}${n.text.length > 100 ? '...' : ''}`
  ).join('\n');

  return `
TASKS TO PRIORITIZE:
${tasksSummary}

RECENT NOTES FOR CONTEXT:
${notesSummary}

Based on these tasks and notes, which 3 tasks should the user focus on TODAY? 
Consider implicit urgency, context from notes, and what would make the biggest impact.
Return a JSON array with: [{ taskIndex: number, reasoning: string }]
`;
}
