import { atom } from 'nanostores';
import Cookies from 'js-cookie';
import { debug } from '~/lib/debug';

export interface TokenUsageData {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: number;
}

interface TokenUsageStore {
  usageData: TokenUsageData[];
  limits: Record<string, number>;
}

const COOKIE_KEY = 'tokenUsageData';
const MAX_HISTORY_DAYS = 30;

const isClient = typeof window !== 'undefined';

// Initialize store with data from cookie or empty state
const initialState: TokenUsageStore = {
  usageData: [],
  limits: {},
};

if (isClient) {
  try {
    const savedData = Cookies.get(COOKIE_KEY);

    if (savedData) {
      const parsed = JSON.parse(savedData);
      initialState.usageData = parsed.usageData || [];
      initialState.limits = parsed.limits || {};
    }
  } catch (error) {
    debug.warn('Failed to parse token usage data from cookie:', error);
  }
}

export const tokenUsageStore = atom<TokenUsageStore>(initialState);

// Helper function to save store state to cookie
const saveToStorage = (state: TokenUsageStore) => {
  if (!isClient) {
    return;
  }

  try {
    Cookies.set(COOKIE_KEY, JSON.stringify(state), { expires: MAX_HISTORY_DAYS });
  } catch (error) {
    debug.warn('Failed to save token usage data to cookie:', error);
  }
};

// Add new usage data
export const addTokenUsage = (data: TokenUsageData) => {
  const currentState = tokenUsageStore.get();
  const newState = {
    ...currentState,
    usageData: [...currentState.usageData, data],
  };

  // Remove data older than MAX_HISTORY_DAYS
  const cutoffTime = Date.now() - MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  newState.usageData = newState.usageData.filter((d) => d.timestamp >= cutoffTime);

  tokenUsageStore.set(newState);

  if (isClient) {
    saveToStorage(newState);
  }
};

// Set token limit for a provider
export const setTokenLimit = (provider: string, limit: number) => {
  const currentState = tokenUsageStore.get();
  const newState = {
    ...currentState,
    limits: {
      ...currentState.limits,
      [provider]: limit,
    },
  };
  tokenUsageStore.set(newState);

  if (isClient) {
    saveToStorage(newState);
  }
};

// Get usage statistics for a specific time range
export const getUsageStats = (timeRange: '24h' | '7d' | '30d' | 'all' = '7d') => {
  const currentState = tokenUsageStore.get();
  const now = Date.now();

  let cutoffTime: number;

  switch (timeRange) {
    case '24h':
      cutoffTime = now - 24 * 60 * 60 * 1000;
      break;
    case '7d':
      cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
      break;
    case '30d':
      cutoffTime = now - 30 * 24 * 60 * 60 * 1000;
      break;
    default:
      cutoffTime = 0;
  }

  const filteredData = currentState.usageData.filter((d) => d.timestamp >= cutoffTime);

  // Calculate totals
  const totalTokens = filteredData.reduce((sum, d) => sum + d.totalTokens, 0);

  // Calculate per-provider breakdown
  const providerUsage = filteredData.reduce(
    (acc, d) => {
      acc[d.provider] = (acc[d.provider] || 0) + d.totalTokens;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Calculate daily usage for chart
  const dailyUsage = new Map<string, number>();
  filteredData.forEach((d) => {
    const date = new Date(d.timestamp).toLocaleDateString();
    dailyUsage.set(date, (dailyUsage.get(date) || 0) + d.totalTokens);
  });

  // Convert daily usage to sorted arrays for the chart
  const sortedDays = Array.from(dailyUsage.entries()).sort(
    (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime(),
  );

  const chartData = {
    labels: sortedDays.map(([date]) => new Date(date).toLocaleDateString('en-US', { weekday: 'short' })),
    values: sortedDays.map(([, value]) => value),
  };

  // Calculate total available tokens (sum of all provider limits)
  const totalAvailable = Object.values(currentState.limits).reduce((sum, limit) => sum + limit, 0);

  return {
    total: totalAvailable,
    used: totalTokens,
    remaining: Math.max(0, totalAvailable - totalTokens),
    percentUsed: totalAvailable > 0 ? (totalTokens / totalAvailable) * 100 : 0,
    chartData,
    providerBreakdown: Object.entries(providerUsage).map(([name, usage]) => ({
      name,
      usage,
      percentage: totalTokens > 0 ? (usage / totalTokens) * 100 : 0,
    })),
  };
};
