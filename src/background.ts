import { classifyDomain, extractDomain } from './classify';
import { getTrackingState, updateTrackingState, setUserId, type TrackingState } from './storage';
import { supabase } from './supabaseClient';

// Constants
const PRODUCTIVE_TRIGGER_MS = 60000; // 60 seconds
const UNPRODUCTIVE_BUFFER_MS = 10000; // 10 seconds
const TICK_INTERVAL_MS = 5000; // 5 seconds

let isIdle = false;
let isWindowFocused = true;

/**
 * Get the current active tab's URL
 */
async function getCurrentTabUrl(): Promise<string | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return null;
    const tab = tabs[0];
    return tab.url || null;
  } catch {
    return null;
  }
}

/**
 * Get the current active tab's URL (works across all windows)
 */
async function getActiveTabUrl(): Promise<string | null> {
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    for (const window of windows) {
      if (window.focused && window.tabs) {
        for (const tab of window.tabs) {
          if (tab.active && tab.url) {
            return tab.url;
          }
        }
      }
    }
    // Fallback: get any active tab
    const tabs = await chrome.tabs.query({ active: true });
    if (tabs.length > 0 && tabs[0].url) {
      return tabs[0].url;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Update the current domain and flush time if domain changed
 */
async function updateDomain(newDomain: string | null): Promise<void> {
  const state = await getTrackingState();
  
  if (state.currentDomain === newDomain) {
    return; // No change
  }

  // Flush accumulated time for the previous domain
  if (state.currentDomain && state.userId) {
    const previousClassification = classifyDomain(state.currentDomain);
    
    if (previousClassification === 'productive' && state.consecutiveProductiveMs > 0) {
      // If we were productive, check if we hit the trigger
      if (state.consecutiveProductiveMs >= PRODUCTIVE_TRIGGER_MS) {
        await recordProductiveTrigger(state.currentDomain, state.consecutiveProductiveMs, state.userId);
      }
    } else if (previousClassification === 'unproductive' && state.unproductiveMsBuffer > 0) {
      // Flush unproductive buffer
      await recordUnproductiveTime(state.unproductiveMsBuffer, state.userId);
    }
  }

  // Update domain and reset counters
  const newClassification = classifyDomain(newDomain);
  await updateTrackingState({
    currentDomain: newDomain,
    lastTick: Date.now(),
    consecutiveProductiveMs: newClassification === 'productive' ? 0 : state.consecutiveProductiveMs,
    unproductiveMsBuffer: newClassification === 'unproductive' ? 0 : state.unproductiveMsBuffer,
  });
}

/**
 * Record productive trigger event
 */
async function recordProductiveTrigger(domain: string, durationMs: number, userId: string): Promise<void> {
  try {
    const durationSeconds = Math.floor(durationMs / 1000);
    await supabase.from('productive_triggers').insert({
      user_id: userId,
      domain,
      duration_seconds: durationSeconds,
    });
    console.log(`Recorded productive trigger: ${domain} for ${durationSeconds}s`);
  } catch (error) {
    console.error('Error recording productive trigger:', error);
  }
}

/**
 * Record unproductive time to leaderboard
 */
async function recordUnproductiveTime(ms: number, userId: string): Promise<void> {
  try {
    const seconds = Math.floor(ms / 1000);
    await supabase.from('leaderboard_scores').insert({
      user_id: userId,
      score: seconds,
    });
    console.log(`Recorded unproductive time: ${seconds}s`);
  } catch (error) {
    console.error('Error recording unproductive time:', error);
  }
}

/**
 * Main tick function - called every 5 seconds
 */
async function tick(): Promise<void> {
  // Skip if idle or window not focused
  if (isIdle || !isWindowFocused) {
    const state = await getTrackingState();
    await updateTrackingState({
      lastTick: Date.now(),
    });
    return;
  }

  const state = await getTrackingState();
  const now = Date.now();
  const elapsed = now - state.lastTick;

  if (elapsed <= 0) {
    await updateTrackingState({ lastTick: now });
    return;
  }

  // Get current active tab
  const currentUrl = await getActiveTabUrl();
  const currentDomain = extractDomain(currentUrl);

  // Update domain if changed
  if (currentDomain !== state.currentDomain) {
    await updateDomain(currentDomain);
    // Get updated state after domain change
    const updatedState = await getTrackingState();
    await processTime(updatedState, elapsed);
  } else {
    await processTime(state, elapsed);
  }
}

/**
 * Process accumulated time
 */
async function processTime(state: TrackingState, elapsed: number): Promise<void> {
  const classification = classifyDomain(state.currentDomain);
  const userId = state.userId;

  if (!userId || !state.currentDomain) {
    await updateTrackingState({ lastTick: Date.now() });
    return;
  }

  if (classification === 'productive') {
    const newConsecutive = state.consecutiveProductiveMs + elapsed;
    
    // Check if we hit the productive trigger threshold
    if (newConsecutive >= PRODUCTIVE_TRIGGER_MS) {
      await recordProductiveTrigger(state.currentDomain, newConsecutive, userId);
      await updateTrackingState({
        consecutiveProductiveMs: 0,
        lastTick: Date.now(),
      });
    } else {
      await updateTrackingState({
        consecutiveProductiveMs: newConsecutive,
        lastTick: Date.now(),
      });
    }
  } else if (classification === 'unproductive') {
    const newBuffer = state.unproductiveMsBuffer + elapsed;
    
    // Check if we should flush the buffer
    if (newBuffer >= UNPRODUCTIVE_BUFFER_MS) {
      await recordUnproductiveTime(newBuffer, userId);
      await updateTrackingState({
        unproductiveMsBuffer: 0,
        lastTick: Date.now(),
      });
    } else {
      await updateTrackingState({
        unproductiveMsBuffer: newBuffer,
        lastTick: Date.now(),
      });
    }
  } else {
    // Unknown/null domain - just update tick
    await updateTrackingState({ lastTick: Date.now() });
  }
}

/**
 * Initialize tracking
 */
async function initializeTracking(): Promise<void> {
  // Check for existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await setUserId(session.user.id);
    console.log('Restored session for user:', session.user.email);
  }

  // Get initial domain
  const currentUrl = await getActiveTabUrl();
  const currentDomain = extractDomain(currentUrl);
  await updateDomain(currentDomain);

  // Set up interval for periodic ticks (every 5 seconds)
  // Note: Service workers can be suspended, but setInterval works while active
  setInterval(() => {
    tick().catch(console.error);
  }, TICK_INTERVAL_MS);
  
  // Also trigger immediately
  tick().catch(console.error);
}

// Event listeners

chrome.tabs.onActivated.addListener(async () => {
  const currentUrl = await getActiveTabUrl();
  const currentDomain = extractDomain(currentUrl);
  await updateDomain(currentDomain);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const currentDomain = extractDomain(tab.url);
    const state = await getTrackingState();
    // Only update if this is the active tab
    const activeUrl = await getActiveTabUrl();
    if (activeUrl === tab.url) {
      await updateDomain(currentDomain);
    }
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    isWindowFocused = false;
  } else {
    isWindowFocused = true;
    // Update domain when window gains focus
    const currentUrl = await getActiveTabUrl();
    const currentDomain = extractDomain(currentUrl);
    await updateDomain(currentDomain);
  }
});

chrome.idle.onStateChanged.addListener((newState) => {
  isIdle = newState === 'idle' || newState === 'locked';
  if (isIdle) {
    console.log('User is idle/locked, pausing tracking');
  } else {
    console.log('User is active, resuming tracking');
  }
});

// Listen for auth state changes
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    await setUserId(session.user.id);
    console.log('User signed in:', session.user.email);
  } else if (event === 'SIGNED_OUT') {
    await setUserId(null);
    await updateTrackingState({
      currentDomain: null,
      consecutiveProductiveMs: 0,
      unproductiveMsBuffer: 0,
    });
    console.log('User signed out');
  }
});

// Initialize on startup
initializeTracking().catch(console.error);

