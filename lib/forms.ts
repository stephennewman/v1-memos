// Forms API helpers
import { supabase } from './supabase';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://www.outcomeview.com';

// Types
export interface FormField {
  id: string;
  name: string;
  type: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  validation?: Record<string, any>;
}

export interface FormSchema {
  fields: FormField[];
  settings?: Record<string, any>;
}

export interface SimpleForm {
  id: string;
  title: string;
  description?: string;
  schema: FormSchema;
  workspace_id: string;
  mobile_quick_access?: boolean;
  ai_voice_enabled?: boolean;
  ai_vision_enabled?: boolean;
  created_at: string;
}

export interface FormInstance {
  id: string;
  form_id: string;
  workspace_id: string;
  cadence_id?: string;
  instance_name: string;
  scheduled_for: string;
  due_at: string;
  status: 'pending' | 'ready' | 'in_progress' | 'completed' | 'missed' | 'skipped';
  assigned_to?: string[];
  metadata?: Record<string, any>;
  completed_at?: string;
  completed_by?: string;
  submission_id?: string;
  // Joined data
  form?: SimpleForm;
}

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

/**
 * Fetch assigned form instances for the current user
 */
export async function fetchAssignedForms(userId: string): Promise<FormInstance[]> {
  try {
    // Query form_instances where user is assigned and status is actionable
    const { data, error } = await supabase
      .from('form_instances')
      .select(`
        *,
        form:simple_forms (
          id,
          title,
          description,
          schema,
          ai_voice_enabled,
          ai_vision_enabled
        )
      `)
      .in('status', ['pending', 'ready', 'in_progress'])
      .order('due_at', { ascending: true });

    if (error) {
      console.error('[Forms] Error fetching assigned forms:', error);
      throw error;
    }

    // Filter by assigned_to containing userId
    // The assigned_to field is JSONB array of user IDs
    const filtered = (data || []).filter((instance: any) => {
      const assignedTo = instance.assigned_to || [];
      return assignedTo.includes(userId) || assignedTo.includes('@all');
    });

    return filtered as FormInstance[];
  } catch (error) {
    console.error('[Forms] fetchAssignedForms error:', error);
    return [];
  }
}

/**
 * Fetch quick access forms (mobile_quick_access = true)
 */
export async function fetchQuickAccessForms(): Promise<SimpleForm[]> {
  try {
    const { data, error } = await supabase
      .from('simple_forms')
      .select('*')
      .eq('mobile_quick_access', true)
      .eq('status', 'published')
      .order('title', { ascending: true });

    if (error) {
      console.error('[Forms] Error fetching quick access forms:', error);
      throw error;
    }

    return (data || []) as SimpleForm[];
  } catch (error) {
    console.error('[Forms] fetchQuickAccessForms error:', error);
    return [];
  }
}

/**
 * Fetch a single form by ID
 */
export async function fetchForm(formId: string): Promise<SimpleForm | null> {
  try {
    const { data, error } = await supabase
      .from('simple_forms')
      .select('*')
      .eq('id', formId)
      .single();

    if (error) {
      console.error('[Forms] Error fetching form:', error);
      return null;
    }

    return data as SimpleForm;
  } catch (error) {
    console.error('[Forms] fetchForm error:', error);
    return null;
  }
}

/**
 * Submit form data via V1 API
 */
export async function submitForm(
  formId: string,
  data: Record<string, any>,
  metadata?: {
    instanceId?: string;
    startedAt?: string;
    deviceType?: string;
  }
): Promise<{ success: boolean; submissionId?: string; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const url = `${API_BASE}/api/forms/${formId}/submit`;
    
    console.log('[Forms] Submitting to:', url);
    console.log('[Forms] Data keys:', Object.keys(data));
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data,
        started_at: metadata?.startedAt,
        device_type: metadata?.deviceType || 'mobile',
      }),
    });

    const responseText = await response.text();
    console.log('[Forms] Response status:', response.status);
    console.log('[Forms] Response:', responseText.substring(0, 500));
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      return { success: false, error: 'Invalid server response' };
    }

    if (!response.ok) {
      return { success: false, error: result.error || 'Submission failed' };
    }

    // If this was an assigned instance, update its status
    if (metadata?.instanceId && result.submissionId) {
      await completeInstance(metadata.instanceId, result.submissionId);
    }

    return { success: true, submissionId: result.submissionId };
  } catch (error: any) {
    console.error('[Forms] submitForm error:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}

/**
 * Mark a form instance as completed
 */
export async function completeInstance(
  instanceId: string,
  submissionId: string
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('form_instances')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: user?.id,
        submission_id: submissionId,
      })
      .eq('id', instanceId);

    if (error) {
      console.error('[Forms] Error completing instance:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Forms] completeInstance error:', error);
    return false;
  }
}

export interface FormSubmission {
  id: string;
  form_id: string;
  user_id: string;
  data: Record<string, any>;
  submitted_at: string;
  device_type?: string;
  // Joined
  form?: SimpleForm;
}

export interface CompletedFormItem {
  id: string;
  type: 'instance' | 'submission';
  form_id: string;
  form_title: string;
  form_description?: string;
  completed_at: string;
}

/**
 * Fetch completed forms - both instances and direct submissions
 */
export async function fetchCompletedForms(userId: string, limit: number = 30): Promise<CompletedFormItem[]> {
  try {
    // Fetch completed form instances (assigned forms)
    const { data: instances, error: instancesError } = await supabase
      .from('form_instances')
      .select(`
        id,
        form_id,
        completed_at,
        form:simple_forms (
          id,
          title,
          description
        )
      `)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (instancesError) {
      console.error('[Forms] Error fetching completed instances:', instancesError);
    }

    // Fetch direct submissions (quick access forms)
    // Note: simple_form_submissions uses workspace_id, not user_id
    // RLS policies should filter by workspace automatically
    const { data: submissions, error: submissionsError } = await supabase
      .from('simple_form_submissions')
      .select(`
        id,
        form_id,
        submitted_at,
        form:simple_forms (
          id,
          title,
          description
        )
      `)
      .order('submitted_at', { ascending: false })
      .limit(limit);

    if (submissionsError) {
      console.error('[Forms] Error fetching submissions:', submissionsError);
    }

    // Combine and normalize
    const completedItems: CompletedFormItem[] = [];

    // Add instances
    (instances || []).forEach((inst: any) => {
      if (inst.form) {
        completedItems.push({
          id: inst.id,
          type: 'instance',
          form_id: inst.form_id,
          form_title: inst.form.title,
          form_description: inst.form.description,
          completed_at: inst.completed_at,
        });
      }
    });

    // Add submissions (avoiding duplicates from instances)
    const instanceFormIds = new Set((instances || []).map((i: any) => i.form_id));
    (submissions || []).forEach((sub: any) => {
      if (sub.form) {
        completedItems.push({
          id: sub.id,
          type: 'submission',
          form_id: sub.form_id,
          form_title: sub.form.title,
          form_description: sub.form.description,
          completed_at: sub.submitted_at,
        });
      }
    });

    // Sort by completed_at descending
    completedItems.sort((a, b) => 
      new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
    );

    return completedItems.slice(0, limit);
  } catch (error) {
    console.error('[Forms] fetchCompletedForms error:', error);
    return [];
  }
}

/**
 * Start working on a form instance (update status to in_progress)
 */
export async function startInstance(instanceId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('form_instances')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .eq('id', instanceId);

    if (error) {
      console.error('[Forms] Error starting instance:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Forms] startInstance error:', error);
    return false;
  }
}

/**
 * Voice fill form - send audio and get parsed field values
 */
export async function voiceFillForm(
  audioBase64: string,
  formSchema: FormSchema,
  currentValues: Record<string, any> = {}
): Promise<{
  success: boolean;
  transcript?: string;
  field_updates?: Record<string, any>;
  confidence_scores?: Record<string, number>;
  error?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE}/api/forms/voice-fill`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        audio_base64: audioBase64,
        audio_type: 'audio/m4a',
        form_schema: formSchema,
        current_values: currentValues,
      }),
    });

    // Get response text first to handle parsing errors
    const responseText = await response.text();
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[Forms] JSON parse error:', parseError, 'Response:', responseText.substring(0, 500));
      return { success: false, error: 'Invalid response from server' };
    }

    if (!response.ok) {
      return { success: false, error: result.error || 'Voice processing failed' };
    }

    return {
      success: true,
      transcript: result.transcript,
      field_updates: result.field_updates || {},
      confidence_scores: result.confidence_scores || {},
    };
  } catch (error: any) {
    console.error('[Forms] voiceFillForm error:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}

