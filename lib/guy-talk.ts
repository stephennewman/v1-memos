import { supabase } from './supabase';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://www.outcomeview.com';

async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        throw new Error('Not authenticated');
    }
    return {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
    };
}

// Transformation Profile Types
export interface TransformationProfile {
    current_state: {
        roles: string[];
        faith?: string;
        struggles: string[];
        context: string;
    };
    desired_state: {
        transformations: string[];
        values: string[];
        who_i_want_to_become: string;
    };
    preferences: {
        categories: string[];
        tone: string;
        challenge_intensity: string;
    };
    onboarding_transcript: string;
    last_updated: string;
}

export interface UserDaily {
    id: string;
    user_id: string;
    date: string;
    content_type: 'verse' | 'quote' | 'insight' | 'challenge' | 'tip';
    category?: string;
    title?: string;
    content: string;
    expanded: boolean;
    saved: boolean;
    dismissed: boolean;
    created_at: string;
}

export interface UserTracker {
    id: string;
    user_id: string;
    date: string;
    time: string;
    tracker_type: 'mood' | 'energy' | 'stress' | 'sleep' | 'focus' | 'gratitude';
    value: string;
    value_numeric?: number;
    source: 'voice' | 'tap';
    context?: string;
    created_at: string;
}

export interface UserChallenge {
    id: string;
    user_id: string;
    date: string;
    challenge_text: string;
    challenge_category?: string;
    difficulty: 'easy' | 'moderate' | 'hard' | 'extreme';
    status: 'shown' | 'accepted' | 'completed' | 'skipped';
    streak_count: number;
    created_at: string;
}

// Onboarding API
export async function submitOnboarding(audioBase64?: string, transcript?: string): Promise<{
    success: boolean;
    profile?: TransformationProfile;
    transcript?: string;
    error?: string;
}> {
    try {
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE}/api/guy-talk/onboarding`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                audio_base64: audioBase64,
                transcript,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return { success: false, error: data.error || 'Failed to process onboarding' };
        }

        return {
            success: true,
            profile: data.profile,
            transcript: data.transcript,
        };
    } catch (error: any) {
        console.error('[GuyTalk] Onboarding error:', error);
        return { success: false, error: error.message };
    }
}

export async function getProfile(): Promise<{
    profile: TransformationProfile | null;
    onboarding_required: boolean;
}> {
    try {
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE}/api/guy-talk/onboarding`, {
            method: 'GET',
            headers,
        });

        const data = await response.json();

        return {
            profile: data.profile || null,
            onboarding_required: data.onboarding_required ?? true,
        };
    } catch (error: any) {
        console.error('[GuyTalk] Get profile error:', error);
        return { profile: null, onboarding_required: true };
    }
}

// Tracker API
export async function logTracker(
    trackerType: UserTracker['tracker_type'],
    value: string,
    valueNumeric?: number,
    source: 'voice' | 'tap' = 'tap',
    context?: string
): Promise<{ success: boolean; tracker?: UserTracker; error?: string }> {
    try {
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE}/api/guy-talk/tracker`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                tracker_type: trackerType,
                value,
                value_numeric: valueNumeric,
                source,
                context,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return { success: false, error: data.error };
        }

        return { success: true, tracker: data.tracker };
    } catch (error: any) {
        console.error('[GuyTalk] Log tracker error:', error);
        return { success: false, error: error.message };
    }
}

export async function getTodayTrackers(): Promise<{
    trackers: UserTracker[];
    latest: Record<string, UserTracker>;
}> {
    try {
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE}/api/guy-talk/tracker`, {
            method: 'GET',
            headers,
        });

        const data = await response.json();

        return {
            trackers: data.trackers || [],
            latest: data.latest || {},
        };
    } catch (error: any) {
        console.error('[GuyTalk] Get trackers error:', error);
        return { trackers: [], latest: {} };
    }
}

// Dailys API
export async function getTodayDailys(): Promise<{
    dailys: UserDaily[];
    challenge?: UserChallenge;
}> {
    try {
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE}/api/guy-talk/dailys`, {
            method: 'GET',
            headers,
        });

        const data = await response.json();

        return {
            dailys: data.dailys || [],
            challenge: data.challenge,
        };
    } catch (error: any) {
        console.error('[GuyTalk] Get dailys error:', error);
        return { dailys: [] };
    }
}

export async function updateDailyEngagement(
    dailyId: string,
    engagement: { expanded?: boolean; saved?: boolean; dismissed?: boolean }
): Promise<{ success: boolean }> {
    try {
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE}/api/guy-talk/dailys/${dailyId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(engagement),
        });

        return { success: response.ok };
    } catch (error: any) {
        console.error('[GuyTalk] Update daily error:', error);
        return { success: false };
    }
}

// Challenge API
export async function updateChallengeStatus(
    challengeId: string,
    status: 'accepted' | 'completed' | 'skipped'
): Promise<{ success: boolean; streak?: number }> {
    try {
        const headers = await getAuthHeaders();

        const response = await fetch(`${API_BASE}/api/guy-talk/challenge/${challengeId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status }),
        });

        const data = await response.json();

        return { success: response.ok, streak: data.streak };
    } catch (error: any) {
        console.error('[GuyTalk] Update challenge error:', error);
        return { success: false };
    }
}

// Category definitions for UI
export const DAILY_CATEGORIES = {
    bible_verse: { label: 'Bible Verse', icon: '📖', color: '#8b5cf6' },
    prayer_prompt: { label: 'Prayer Prompt', icon: '🙏', color: '#8b5cf6' },
    christian_wisdom: { label: 'Christian Wisdom', icon: '✝️', color: '#8b5cf6' },
    masculine_energy: { label: 'Masculine Energy', icon: '💪', color: '#f97316' },
    stoic_wisdom: { label: 'Stoic Wisdom', icon: '🏛️', color: '#64748b' },
    motivation: { label: 'Motivation', icon: '🔥', color: '#ef4444' },
    career_tip: { label: 'Career', icon: '💼', color: '#3b82f6' },
    business_insight: { label: 'Business', icon: '📈', color: '#3b82f6' },
    leadership: { label: 'Leadership', icon: '👑', color: '#eab308' },
    health_tip: { label: 'Health', icon: '🏃', color: '#22c55e' },
    fitness_tip: { label: 'Fitness', icon: '🏋️', color: '#22c55e' },
    fatherhood: { label: 'Fatherhood', icon: '👨‍👧‍👦', color: '#06b6d4' },
    marriage_tip: { label: 'Marriage', icon: '💕', color: '#ec4899' },
    mindset_shift: { label: 'Mindset', icon: '🧠', color: '#a855f7' },
    quote_of_day: { label: 'Quote', icon: '💬', color: '#6b7280' },
} as const;

export const TRACKER_EMOJIS = {
    mood: {
        '😤': { label: 'Frustrated', numeric: 1 },
        '😟': { label: 'Anxious', numeric: 2 },
        '😐': { label: 'Okay', numeric: 3 },
        '😊': { label: 'Good', numeric: 4 },
        '🤩': { label: 'Great', numeric: 5 },
    },
    energy: {
        '🪫': { label: 'Drained', numeric: 1 },
        '🔋': { label: 'Normal', numeric: 3 },
        '⚡': { label: 'Energized', numeric: 5 },
    },
    stress: {
        '🧘': { label: 'Calm', numeric: 1 },
        '😌': { label: 'Relaxed', numeric: 2 },
        '😐': { label: 'Normal', numeric: 3 },
        '😰': { label: 'Stressed', numeric: 4 },
        '🤯': { label: 'Overwhelmed', numeric: 5 },
    },
    sleep: {
        '😴': { label: 'Poor', numeric: 1 },
        '😐': { label: 'Okay', numeric: 3 },
        '😊': { label: 'Good', numeric: 4 },
        '⭐': { label: 'Great', numeric: 5 },
    },
} as const;


