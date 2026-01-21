// API calls to V1 backend
import { supabase } from './supabase';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://www.outcomeview.com';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  
  return headers;
}

export async function generateMemos(topicId: string, count: number = 10): Promise<any> {
  const headers = await getAuthHeaders();
  
  console.log('[API] Calling generate with topicId:', topicId);
  
  const response = await fetch(`${API_BASE}/api/memos-v2/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ topic_id: topicId, count }),
  });
  
  const responseText = await response.text();
  console.log('[API] Generate response status:', response.status);
  console.log('[API] Generate response body:', responseText);
  
  if (!response.ok) {
    throw new Error(`Failed to generate memos: ${response.status} - ${responseText}`);
  }
  
  // Parse JSON from text
  try {
    const data = JSON.parse(responseText);
    console.log('[API] Parsed memos count:', data.memos?.length || 0);
    return data;
  } catch (e) {
    throw new Error(`Invalid JSON response: ${responseText}`);
  }
}

export async function respondToMemo(memoId: string, action: 'keep' | 'kick'): Promise<void> {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_BASE}/api/memos-v2/respond`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ memo_id: memoId, action }),
  });
  
  if (!response.ok) {
    console.error('Respond error:', await response.text());
    throw new Error('Failed to respond to memo');
  }
}

export async function importMemos(
  topicId: string, 
  mode: 'paste' | 'url' | 'text', 
  content?: string, 
  url?: string
): Promise<any> {
  const headers = await getAuthHeaders();
  
  const body: any = { topic_id: topicId, mode };
  
  if (mode === 'paste' || mode === 'text') {
    body.content = content;
  } else if (mode === 'url') {
    body.url = url;
  }
  
  const response = await fetch(`${API_BASE}/api/memos-v2/import`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    throw new Error('Failed to import memos');
  }
  
  return response.json();
}

