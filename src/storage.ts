/**
 * Storage utilities for managing extension state
 */

export interface TrackingState {
  currentDomain: string | null;
  lastTick: number;
  consecutiveProductiveMs: number;
  unproductiveMsBuffer: number;
  totalProductiveMs: number; // Total accumulated productive time
  totalUnproductiveMs: number; // Total accumulated unproductive time
  userId: string | null;
  theme: 'light' | 'dark'; // Theme preference
  lastLeaderboardUpdate: number; // Timestamp of last leaderboard update
}

const DEFAULT_STATE: TrackingState = {
  currentDomain: null,
  lastTick: Date.now(),
  consecutiveProductiveMs: 0,
  unproductiveMsBuffer: 0,
  totalProductiveMs: 0,
  totalUnproductiveMs: 0,
  userId: null,
  theme: 'light',
  lastLeaderboardUpdate: 0,
};

const STORAGE_KEY = 'trackingState';

export async function getTrackingState(): Promise<TrackingState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || { ...DEFAULT_STATE };
}

export async function setTrackingState(state: TrackingState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function updateTrackingState(updates: Partial<TrackingState>): Promise<TrackingState> {
  const current = await getTrackingState();
  const updated = { ...current, ...updates };
  await setTrackingState(updated);
  return updated;
}

export async function getUserId(): Promise<string | null> {
  const state = await getTrackingState();
  return state.userId;
}

export async function setUserId(userId: string | null): Promise<void> {
  await updateTrackingState({ userId });
}

