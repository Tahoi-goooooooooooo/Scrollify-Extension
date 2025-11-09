import { classifyDomain, extractDomain } from './classify';
import { getTrackingState, updateTrackingState, setUserId, type TrackingState } from './storage';
import { supabase } from './supabaseClient';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, USER_PHONE_NUMBER, WEBHOOK_URL } from './env';

// Constants
const PRODUCTIVE_TRIGGER_MS = 60000; // 60 seconds
const UNPRODUCTIVE_BUFFER_MS = 10000; // 10 seconds
const TICK_INTERVAL_MS = 1000; // 1 second
const LEADERBOARD_UPDATE_INTERVAL_MS = 60000; // 1 minute
const AI_CALL_TRIGGER_MS = 120000; // 2 minutes (120 seconds) - trigger AI agent call
const AI_CALL_COOLDOWN_MS = 300000; // 5 minutes cooldown between calls

let isIdle = false;
let isWindowFocused = true;

/**
 * Get user_id from profiles table that matches auth user (required for foreign key constraint)
 */
async function getProfileUserId(authUserId: string): Promise<string | null> {
  try {
    // Query profiles table to get the user_id that matches the auth user
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', authUserId)
      .single();
    
    if (error) {
      console.error('Error getting profile user_id:', error);
      // If profile doesn't exist, return null (profile should be created by trigger/function)
      return null;
    }
    
    return profile?.user_id || null;
  } catch (error) {
    console.error('Error getting profile user_id:', error);
    return null;
  }
}

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

  // Update domain and reset consecutive counters (but keep total accumulated time)
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
 * Trigger AI agent call using Twilio
 * Note: This requires a webhook URL for Deepgram AI agent integration
 * For now, this initiates the call. The webhook should be configured in Twilio console.
 */
async function triggerAICall(): Promise<void> {
  try {
    const state = await getTrackingState();
    const now = Date.now();
    
    // Check cooldown period (prevent multiple calls within cooldown)
    if (state.lastCallTriggerTime > 0 && (now - state.lastCallTriggerTime) < AI_CALL_COOLDOWN_MS) {
      console.log('AI call cooldown active, skipping call');
      return;
    }

    // Format phone number with country code if needed
    const toPhoneNumber = USER_PHONE_NUMBER.startsWith('+') 
      ? USER_PHONE_NUMBER 
      : `+1${USER_PHONE_NUMBER}`;

    // Create Basic Auth header for Twilio
    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    
    // Twilio API endpoint to create a call
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`;
    
    // Webhook URL for handling the call
    // IMPORTANT: Replace this with your deployed webhook server URL
    // See WEBHOOK_SETUP.md for setup instructions
    const webhookUrl = WEBHOOK_URL;
    
    // Create form data for Twilio API
    const formData = new URLSearchParams();
    formData.append('From', TWILIO_PHONE_NUMBER);
    formData.append('To', toPhoneNumber);
    formData.append('Url', webhookUrl);
    formData.append('Method', 'POST');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error initiating Twilio call:', errorText);
      return;
    }

    const result = await response.json();
    console.log('AI agent call initiated:', result.sid);
    
    // Update last call trigger time
    await updateTrackingState({
      lastCallTriggerTime: now,
    });
  } catch (error) {
    console.error('Error triggering AI call:', error);
  }
}

/**
 * Update leaderboard_global with unproductive time (stored in best_score)
 */
async function updateLeaderboard(userId: string, totalUnproductiveMs: number): Promise<void> {
  try {
    // First verify the profile exists (required for foreign key constraint)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', userId)
      .single();
    
    if (profileError || !profile) {
      console.error('Profile not found for user_id:', userId, profileError);
      return;
    }
    
    const unproductiveSeconds = Math.floor(totalUnproductiveMs / 1000);
    
    // Upsert to leaderboard_global table (update if exists, insert if not)
    // best_score stores unproductive time in seconds
    const { error } = await supabase
      .from('leaderboard_global')
      .upsert({
        user_id: userId,
        best_score: unproductiveSeconds,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });
    
    if (error) {
      console.error('Error updating leaderboard_global:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        userId: userId,
        best_score: unproductiveSeconds
      });
    } else {
      console.log(`Updated leaderboard_global: ${unproductiveSeconds}s unproductive time (best_score) for user ${userId}`);
    }
  } catch (error) {
    console.error('Error updating leaderboard_global:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Main tick function - called every second
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
    const newTotal = (state.totalProductiveMs || 0) + elapsed;
    
    // Check if we hit the AI call trigger threshold (2 minutes)
    if (newConsecutive >= AI_CALL_TRIGGER_MS && (newConsecutive - elapsed) < AI_CALL_TRIGGER_MS) {
      // Trigger AI agent call when productive time hits 2 minutes
      console.log('Productive time reached 2 minutes, triggering AI agent call');
      await triggerAICall();
    }
    
    // Check if we hit the productive trigger threshold
    if (newConsecutive >= PRODUCTIVE_TRIGGER_MS) {
      await recordProductiveTrigger(state.currentDomain, newConsecutive, userId);
      await updateTrackingState({
        consecutiveProductiveMs: 0,
        totalProductiveMs: newTotal,
        lastTick: Date.now(),
      });
    } else {
      await updateTrackingState({
        consecutiveProductiveMs: newConsecutive,
        totalProductiveMs: newTotal,
        lastTick: Date.now(),
      });
    }
  } else if (classification === 'unproductive') {
    const newBuffer = state.unproductiveMsBuffer + elapsed;
    const newTotal = (state.totalUnproductiveMs || 0) + elapsed;
    
    // Check if we should flush the buffer
    if (newBuffer >= UNPRODUCTIVE_BUFFER_MS) {
      await recordUnproductiveTime(newBuffer, userId);
      await updateTrackingState({
        unproductiveMsBuffer: 0,
        totalUnproductiveMs: newTotal,
        lastTick: Date.now(),
      });
    } else {
      await updateTrackingState({
        unproductiveMsBuffer: newBuffer,
        totalUnproductiveMs: newTotal,
        lastTick: Date.now(),
      });
    }
  } else {
    // Unknown/null domain - just update tick
    await updateTrackingState({ lastTick: Date.now() });
  }
}

/**
 * Check and update leaderboard if needed (every minute)
 */
async function checkAndUpdateLeaderboard(): Promise<void> {
  const state = await getTrackingState();
  const now = Date.now();
  
  if (!state.userId) {
    return;
  }
  
  // Check if it's time to update (every minute)
  const timeSinceLastUpdate = now - (state.lastLeaderboardUpdate || 0);
  
  if (timeSinceLastUpdate >= LEADERBOARD_UPDATE_INTERVAL_MS) {
    await updateLeaderboard(
      state.userId,
      state.totalUnproductiveMs || 0
    );
    await updateTrackingState({
      lastLeaderboardUpdate: now,
    });
  }
}

/**
 * Initialize tracking
 */
async function initializeTracking(): Promise<void> {
  // Check for existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    // Get user_id from profiles table to match foreign key constraint
    const profileUserId = await getProfileUserId(session.user.id);
    if (profileUserId) {
      await setUserId(profileUserId);
      console.log('Restored session for user:', session.user.email);
    } else {
      console.warn('Profile not found for auth user, cannot set userId');
    }
  }

  // Get initial domain
  const currentUrl = await getActiveTabUrl();
  const currentDomain = extractDomain(currentUrl);
  await updateDomain(currentDomain);

  // Set up interval for periodic ticks (every second)
  // Note: Service workers can be suspended, but setInterval works while active
  setInterval(() => {
    tick().catch(console.error);
  }, TICK_INTERVAL_MS);
  
  // Set up interval for leaderboard updates (every minute)
  setInterval(() => {
    checkAndUpdateLeaderboard().catch(console.error);
  }, LEADERBOARD_UPDATE_INTERVAL_MS);
  
  // Also trigger immediately
  tick().catch(console.error);
  checkAndUpdateLeaderboard().catch(console.error);
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
    // Get user_id from profiles table to match foreign key constraint
    const profileUserId = await getProfileUserId(session.user.id);
    if (profileUserId) {
      await setUserId(profileUserId);
      console.log('User signed in:', session.user.email);
    } else {
      console.warn('Profile not found for auth user, cannot set userId');
    }
  } else if (event === 'SIGNED_OUT') {
    await setUserId(null);
    await updateTrackingState({
      currentDomain: null,
      consecutiveProductiveMs: 0,
      unproductiveMsBuffer: 0,
      totalProductiveMs: 0,
      totalUnproductiveMs: 0,
      lastLeaderboardUpdate: 0,
      lastCallTriggerTime: 0,
    });
    console.log('User signed out');
  }
});

// Initialize on startup
initializeTracking().catch(console.error);

