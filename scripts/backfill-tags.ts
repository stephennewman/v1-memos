/**
 * Backfill script to add tags to existing tasks and notes
 * Run with: npx ts-node scripts/backfill-tags.ts
 * Or: npx tsx scripts/backfill-tags.ts
 */

import { createClient } from '@supabase/supabase-js';

// You'll need to set these environment variables or replace with actual values
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.log('Set them as environment variables:');
  console.log('  EXPO_PUBLIC_SUPABASE_URL=your_url SUPABASE_SERVICE_ROLE_KEY=your_key npx tsx scripts/backfill-tags.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Tag patterns (same as lib/auto-tags.ts)
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

function extractHashtags(text: string): string[] {
  const hashtagRegex = /#(\w+)/g;
  const matches = text.match(hashtagRegex);
  if (!matches) return [];
  return matches.map(tag => tag.slice(1).toLowerCase());
}

function generateSmartTags(text: string): string[] {
  const lowerText = text.toLowerCase();
  const tags: string[] = [];
  
  for (const [tag, keywords] of Object.entries(TAG_PATTERNS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        tags.push(tag);
        break;
      }
    }
  }
  
  return tags;
}

function autoGenerateTags(text: string): string[] {
  const hashtags = extractHashtags(text);
  const smartTags = generateSmartTags(text);
  const allTags = [...new Set([...hashtags, ...smartTags])];
  
  if (allTags.length === 0) {
    allTags.push('general');
  }
  
  return allTags.slice(0, 5);
}

async function backfillTasks() {
  console.log('Fetching tasks without tags...');
  
  const { data: tasks, error } = await supabase
    .from('voice_todos')
    .select('id, text, tags')
    .or('tags.is.null,tags.eq.{}');
  
  if (error) {
    console.error('Error fetching tasks:', error);
    return 0;
  }
  
  if (!tasks || tasks.length === 0) {
    console.log('No tasks need tagging');
    return 0;
  }
  
  console.log(`Found ${tasks.length} tasks to tag`);
  
  let updated = 0;
  for (const task of tasks) {
    const tags = autoGenerateTags(task.text);
    
    const { error: updateError } = await supabase
      .from('voice_todos')
      .update({ tags })
      .eq('id', task.id);
    
    if (updateError) {
      console.error(`Error updating task ${task.id}:`, updateError);
    } else {
      console.log(`  Tagged task: "${task.text.slice(0, 40)}..." → [${tags.join(', ')}]`);
      updated++;
    }
  }
  
  return updated;
}

async function backfillNotes() {
  console.log('\nFetching notes without tags...');
  
  const { data: notes, error } = await supabase
    .from('voice_notes')
    .select('id, text, tags')
    .or('tags.is.null,tags.eq.{}');
  
  if (error) {
    console.error('Error fetching notes:', error);
    return 0;
  }
  
  if (!notes || notes.length === 0) {
    console.log('No notes need tagging');
    return 0;
  }
  
  console.log(`Found ${notes.length} notes to tag`);
  
  let updated = 0;
  for (const note of notes) {
    const tags = autoGenerateTags(note.text);
    
    const { error: updateError } = await supabase
      .from('voice_notes')
      .update({ tags })
      .eq('id', note.id);
    
    if (updateError) {
      console.error(`Error updating note ${note.id}:`, updateError);
    } else {
      console.log(`  Tagged note: "${note.text.slice(0, 40)}..." → [${tags.join(', ')}]`);
      updated++;
    }
  }
  
  return updated;
}

async function main() {
  console.log('=== Tag Backfill Script ===\n');
  
  const tasksUpdated = await backfillTasks();
  const notesUpdated = await backfillNotes();
  
  console.log('\n=== Summary ===');
  console.log(`Tasks tagged: ${tasksUpdated}`);
  console.log(`Notes tagged: ${notesUpdated}`);
  console.log('Done!');
}

main().catch(console.error);

