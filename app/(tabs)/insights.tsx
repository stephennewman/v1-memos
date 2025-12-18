import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TabHeader } from '@/components/TabHeader';
import { useAuth } from '@/lib/auth-context';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://www.outcomeview.com';

interface Analytics {
  period: string;
  totalEntries: number;
  totalWords: number;
  totalMinutes: number;
  averageSentiment: number;
  sentimentBreakdown: Record<string, number>;
  totalFillerWords: number;
  fillerWordBreakdown: Record<string, number>;
  averageClarity: number;
  bestHour: number | null;
  bestHourClarity: number | null;
  topPeople: { name: string; count: number }[];
  tasksCreated: number;
  tasksCompleted: number;
  completionRate: number;
}

interface QuestionItem {
  id: string;
  entry_id: string;
  question: string;
  entry_title: string;
}

interface WeeklyDigest {
  period: string;
  summary: string;
  highlights: string[];
  stats: {
    voiceNotes: number;
    tasksCreated: number;
    tasksCompleted: number;
  };
  topPeople: string[];
}

// Sentiment colors
const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#4ade80',
  excited: '#fcd34d',
  motivated: '#c4dfc4',
  neutral: '#9ca3af',
  reflective: '#93c5fd',
  anxious: '#fda4af',
  negative: '#f87171',
  frustrated: '#fb923c',
};

// Format hour for display
function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

// Format sentiment score
function formatSentiment(score: number): string {
  if (score >= 0.5) return 'Very Positive';
  if (score >= 0.2) return 'Positive';
  if (score >= -0.2) return 'Neutral';
  if (score >= -0.5) return 'Negative';
  return 'Very Negative';
}

export default function InsightsScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(30); // days
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [isLoadingDigest, setIsLoadingDigest] = useState(false);

  const loadDigest = useCallback(async () => {
    if (!user) return;

    setIsLoadingDigest(true);
    try {
      const response = await fetch(
        `${API_URL}/api/voice/digest?user_id=${user.id}`
      );
      if (response.ok) {
        const data = await response.json();
        setDigest(data.digest || null);
      }
    } catch (error) {
      console.error('Error loading digest:', error);
    } finally {
      setIsLoadingDigest(false);
    }
  }, [user]);

  const loadQuestions = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch(
        `${API_URL}/api/voice/questions?user_id=${user.id}&limit=10`
      );
      if (response.ok) {
        const data = await response.json();
        setQuestions(data.questions || []);
      }
    } catch (error) {
      console.error('Error loading questions:', error);
    }
  }, [user]);

  const loadAnalytics = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch(
        `${API_URL}/api/voice/analytics?user_id=${user.id}&period=${selectedPeriod}`
      );

      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, selectedPeriod]);

  useFocusEffect(
    useCallback(() => {
      if (user && !authLoading) {
        loadAnalytics();
        loadQuestions();
        loadDigest();
      } else if (!authLoading && !user) {
        setIsLoading(false);
      }
    }, [user, authLoading, loadAnalytics, loadQuestions, loadDigest])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadAnalytics();
  }, [loadAnalytics]);

  if (isLoading || authLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#c4dfc4" />
      </View>
    );
  }

  // Not enough data state
  if (!analytics || analytics.totalEntries < 3) {
    return (
      <View style={styles.container}>
        <TabHeader title="Insights" titleColor="#ec4899" />
        <View style={[styles.container, styles.centered]}>
          <Ionicons name="analytics-outline" size={64} color="#333" />
          <Text style={styles.emptyTitle}>Not Enough Data</Text>
          <Text style={styles.emptyText}>
            Record at least 3 voice notes to see your insights
          </Text>
          <Text style={styles.emptyCount}>
            {analytics?.totalEntries || 0} / 3 recordings
          </Text>
        </View>
      </View>
    );
  }

  // Get top filler words
  const topFillers = Object.entries(analytics.fillerWordBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Get sentiment breakdown sorted
  const sentimentEntries = Object.entries(analytics.sentimentBreakdown)
    .sort((a, b) => b[1] - a[1]);

  return (
    <View style={styles.container}>
      <TabHeader title="Insights" subtitle={`Last ${selectedPeriod} days`} titleColor="#ec4899" />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#c4dfc4"
          />
        }
      >
        {/* Weekly Digest */}
        {digest && (
          <View style={styles.digestSection}>
            <View style={styles.digestHeader}>
              <View style={styles.digestIconContainer}>
                <Ionicons name="sparkles" size={24} color="#fcd34d" />
              </View>
              <View style={styles.digestTitleContainer}>
                <Text style={styles.digestTitle}>
                  {selectedPeriod <= 7 ? 'Your Week' : selectedPeriod <= 30 ? 'Your Month' : 'Your Quarter'}
                </Text>
                <Text style={styles.digestPeriod}>{digest.period}</Text>
              </View>
            </View>

            <Text style={styles.digestSummary}>{digest.summary}</Text>

            {digest.highlights.length > 0 && (
              <View style={styles.digestHighlights}>
                {digest.highlights.map((highlight, index) => (
                  <View key={index} style={styles.highlightItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#4ade80" />
                    <Text style={styles.highlightText}>{highlight}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {isLoadingDigest && !digest && (
          <View style={styles.digestLoading}>
            <ActivityIndicator size="small" color="#c4dfc4" />
            <Text style={styles.digestLoadingText}>Generating your weekly digest...</Text>
          </View>
        )}

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {[7, 30, 90].map(days => (
            <TouchableOpacity
              key={days}
              style={[styles.periodBtn, selectedPeriod === days && styles.periodBtnActive]}
              onPress={() => {
                setSelectedPeriod(days);
                setIsLoading(true);
              }}
            >
              <Text style={[styles.periodBtnText, selectedPeriod === days && styles.periodBtnTextActive]}>
                {days}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Overview Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OVERVIEW</Text>
          <View style={styles.overviewGrid}>
            <View style={styles.overviewCard}>
              <Ionicons name="mic" size={20} color="#c4dfc4" />
              <Text style={styles.overviewNumber}>{analytics.totalEntries}</Text>
              <Text style={styles.overviewLabel}>Recordings</Text>
            </View>
            <View style={styles.overviewCard}>
              <Ionicons name="time" size={20} color="#93c5fd" />
              <Text style={styles.overviewNumber}>{analytics.totalMinutes}</Text>
              <Text style={styles.overviewLabel}>Minutes</Text>
            </View>
            <View style={styles.overviewCard}>
              <Ionicons name="text" size={20} color="#fcd34d" />
              <Text style={styles.overviewNumber}>{analytics.totalWords.toLocaleString()}</Text>
              <Text style={styles.overviewLabel}>Words</Text>
            </View>
          </View>
        </View>

        {/* Sentiment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MOOD ANALYSIS</Text>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Average Sentiment</Text>
              <Text style={[styles.sentimentBadge, {
                backgroundColor: analytics.averageSentiment >= 0 ? '#4ade8020' : '#f8717120',
                color: analytics.averageSentiment >= 0 ? '#4ade80' : '#f87171',
              }]}>
                {formatSentiment(analytics.averageSentiment)}
              </Text>
            </View>

            {sentimentEntries.length > 0 && (
              <View style={styles.sentimentBreakdown}>
                {sentimentEntries.map(([label, count]) => (
                  <View key={label} style={styles.sentimentRow}>
                    <View style={styles.sentimentLabelContainer}>
                      <View style={[styles.sentimentDot, { backgroundColor: SENTIMENT_COLORS[label] || '#666' }]} />
                      <Text style={styles.sentimentLabel}>{label}</Text>
                    </View>
                    <Text style={styles.sentimentCount}>{count}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Filler Words */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FILLER WORDS</Text>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Total Filler Words</Text>
              <Text style={styles.fillerCount}>{analytics.totalFillerWords}</Text>
            </View>

            {topFillers.length > 0 ? (
              <View style={styles.fillerList}>
                {topFillers.map(([word, count]) => (
                  <View key={word} style={styles.fillerRow}>
                    <Text style={styles.fillerWord}>"{word}"</Text>
                    <View style={styles.fillerBarContainer}>
                      <View
                        style={[styles.fillerBar, {
                          width: `${(count / topFillers[0][1]) * 100}%`
                        }]}
                      />
                    </View>
                    <Text style={styles.fillerWordCount}>{count}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.noData}>Great! No filler words detected.</Text>
            )}
          </View>
        </View>

        {/* Clarity Score */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CLARITY</Text>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Average Clarity</Text>
              <Text style={[styles.clarityScore, {
                color: analytics.averageClarity >= 70 ? '#4ade80' : analytics.averageClarity >= 50 ? '#fcd34d' : '#f87171'
              }]}>
                {Math.round(analytics.averageClarity)}%
              </Text>
            </View>

            <View style={styles.clarityBarContainer}>
              <View style={[styles.clarityBar, { width: `${analytics.averageClarity}%` }]} />
            </View>
            <Text style={styles.clarityHint}>
              {analytics.averageClarity >= 70
                ? 'Excellent! Your thoughts are well-organized.'
                : analytics.averageClarity >= 50
                  ? 'Good clarity with room for improvement.'
                  : 'Try organizing your thoughts before recording.'}
            </Text>
          </View>
        </View>

        {/* Best Time */}
        {analytics.bestHour !== null && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BEST TIME TO RECORD</Text>
            <View style={styles.card}>
              <View style={styles.bestTimeContent}>
                <Ionicons name="sunny" size={32} color="#fcd34d" />
                <View style={styles.bestTimeText}>
                  <Text style={styles.bestTimeHour}>{formatHour(analytics.bestHour)}</Text>
                  <Text style={styles.bestTimeHint}>
                    Your clearest recordings are around this time
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Task Completion */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TASK COMPLETION</Text>
          <View style={styles.card}>
            <View style={styles.taskStats}>
              <View style={styles.taskStat}>
                <Text style={styles.taskNumber}>{analytics.tasksCreated}</Text>
                <Text style={styles.taskLabel}>Created</Text>
              </View>
              <View style={styles.taskDivider} />
              <View style={styles.taskStat}>
                <Text style={[styles.taskNumber, { color: '#4ade80' }]}>{analytics.tasksCompleted}</Text>
                <Text style={styles.taskLabel}>Completed</Text>
              </View>
              <View style={styles.taskDivider} />
              <View style={styles.taskStat}>
                <Text style={[styles.taskNumber, { color: '#93c5fd' }]}>{Math.round(analytics.completionRate)}%</Text>
                <Text style={styles.taskLabel}>Rate</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Top People */}
        {analytics.topPeople.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>FREQUENTLY MENTIONED</Text>
            <View style={styles.card}>
              {analytics.topPeople.slice(0, 5).map((person, index) => (
                <View key={person.name} style={styles.personRow}>
                  <Text style={styles.personRank}>{index + 1}</Text>
                  <Text style={styles.personName}>{person.name}</Text>
                  <Text style={styles.personCount}>{person.count} mentions</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Questions Section */}
        {questions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>QUESTIONS YOU'VE ASKED</Text>
            <View style={styles.card}>
              {questions.slice(0, 5).map((q) => (
                <TouchableOpacity
                  key={q.id}
                  style={styles.questionRow}
                  onPress={() => router.push(`/entry/${q.entry_id}`)}
                >
                  <View style={styles.questionIcon}>
                    <Ionicons name="help-circle" size={18} color="#93c5fd" />
                  </View>
                  <View style={styles.questionContent}>
                    <Text style={styles.questionText} numberOfLines={2}>
                      {q.question}
                    </Text>
                    <Text style={styles.questionSource}>
                      From: {q.entry_title}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#444" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#444',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#555',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  emptyCount: {
    fontSize: 14,
    color: '#c4dfc4',
    marginTop: 16,
    fontWeight: '600',
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  periodBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  periodBtnActive: {
    backgroundColor: '#c4dfc420',
    borderColor: '#c4dfc4',
  },
  periodBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  periodBtnTextActive: {
    color: '#c4dfc4',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 1,
    marginBottom: 12,
  },
  overviewGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  overviewCard: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  overviewNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginTop: 8,
  },
  overviewLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  sentimentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
    overflow: 'hidden',
  },
  sentimentBreakdown: {
    gap: 10,
  },
  sentimentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sentimentLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sentimentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sentimentLabel: {
    fontSize: 14,
    color: '#aaa',
    textTransform: 'capitalize',
  },
  sentimentCount: {
    fontSize: 14,
    color: '#666',
  },
  fillerCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fb923c',
  },
  fillerList: {
    gap: 12,
  },
  fillerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fillerWord: {
    fontSize: 13,
    color: '#888',
    width: 80,
  },
  fillerBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  fillerBar: {
    height: '100%',
    backgroundColor: '#fb923c',
    borderRadius: 4,
  },
  fillerWordCount: {
    fontSize: 13,
    color: '#666',
    width: 30,
    textAlign: 'right',
  },
  noData: {
    fontSize: 14,
    color: '#4ade80',
    fontStyle: 'italic',
  },
  clarityScore: {
    fontSize: 24,
    fontWeight: '700',
  },
  clarityBarContainer: {
    height: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  clarityBar: {
    height: '100%',
    backgroundColor: '#c4dfc4',
    borderRadius: 4,
  },
  clarityHint: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  bestTimeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bestTimeText: {
    flex: 1,
  },
  bestTimeHour: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  bestTimeHint: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  taskStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskStat: {
    flex: 1,
    alignItems: 'center',
  },
  taskNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  taskLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  taskDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#1a1a1a',
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  personRank: {
    fontSize: 14,
    fontWeight: '700',
    color: '#c4dfc4',
    width: 24,
  },
  personName: {
    fontSize: 15,
    color: '#fff',
    flex: 1,
  },
  personCount: {
    fontSize: 13,
    color: '#666',
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  questionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#93c5fd15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  questionContent: {
    flex: 1,
    marginRight: 8,
  },
  questionText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
  },
  questionSource: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  digestSection: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#fcd34d30',
  },
  digestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  digestIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#fcd34d15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  digestTitleContainer: {
    flex: 1,
  },
  digestTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  digestPeriod: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  digestSummary: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 22,
    marginBottom: 16,
  },
  digestHighlights: {
    gap: 10,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  highlightText: {
    flex: 1,
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
  digestLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    gap: 12,
  },
  digestLoadingText: {
    fontSize: 14,
    color: '#666',
  },
});

