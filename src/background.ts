import { classifyDomain, extractDomain } from './classify';
import { getTrackingState, updateTrackingState, setUserId, type TrackingState } from './storage';
import { supabase } from './supabaseClient';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, WEBHOOK_URL } from './env';

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

  // Handle domain switch
  const previousClassification = classifyDomain(state.currentDomain);
  const newClassification = classifyDomain(newDomain);
  
  // Record database events for previous domain (if needed)
  if (state.currentDomain && state.userId) {
    // Record productive trigger at 60s for database tracking (but don't reset counter)
    if (previousClassification === 'productive' && state.consecutiveProductiveMs >= PRODUCTIVE_TRIGGER_MS) {
      // Only record once per session to avoid duplicates
      await recordProductiveTrigger(state.currentDomain, state.consecutiveProductiveMs, state.userId);
    } else if (previousClassification === 'unproductive' && state.unproductiveMsBuffer >= UNPRODUCTIVE_BUFFER_MS) {
      // Flush unproductive buffer to database
      await recordUnproductiveTime(state.unproductiveMsBuffer, state.userId);
    }
  }

  // IMPORTANT: Do NOT reset productive time counter when switching between productive domains
  // Only reset when:
  // 1. Switching FROM productive TO unproductive (reset productive counter)
  // 2. Switching FROM unproductive TO productive (reset unproductive buffer)
  // 3. Call is triggered (handled in triggerAICall)
  // 4. Update Leaderboard button is pressed (handled in popup)
  
  // Determine what to reset
  const shouldResetProductive = previousClassification === 'productive' && newClassification === 'unproductive';
  const shouldResetUnproductive = previousClassification === 'unproductive' && newClassification === 'productive';
  
  await updateTrackingState({
    currentDomain: newDomain,
    lastTick: Date.now(),
    consecutiveProductiveMs: shouldResetProductive ? 0 : state.consecutiveProductiveMs,
    unproductiveMsBuffer: shouldResetUnproductive ? 0 : state.unproductiveMsBuffer,
  });
  
  // Log domain switch for debugging
  if (shouldResetProductive) {
    console.log('🔄 Switched from productive to unproductive domain, reset productive counter');
  } else if (shouldResetUnproductive) {
    console.log('🔄 Switched from unproductive to productive domain, reset unproductive buffer');
  } else if (previousClassification === 'productive' && newClassification === 'productive') {
    console.log('✅ Switched between productive domains, keeping productive counter running');
  }
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
 * Fetches dad's number from profiles table and initiates call with Deepgram AI agent
 */
async function triggerAICall(): Promise<void> {
  try {
    console.log('📞 triggerAICall() called - starting call initiation process (using test call logic)...');
    
    // Validate credentials (same as test button)
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      console.error('❌ Twilio credentials missing. Cannot initiate call.');
      return;
    }

    if (!WEBHOOK_URL || WEBHOOK_URL.includes('your-webhook-server.com')) {
      console.error('❌ Webhook URL not configured. Please set VITE_WEBHOOK_URL in .env file.');
      return;
    }

    // Get current user_id from tracking state (same as test button)
    const state = await getTrackingState();
    if (!state.userId) {
      console.error('❌ No user ID found. Cannot initiate call.');
      return;
    }
    
    console.log('✅ User ID found:', state.userId);

    // Fetch dad's number from profiles table using user_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('dads_number')
      .eq('user_id', state.userId)
      .single();

    if (profileError || !profile) {
      console.error('❌ Error fetching profile:', profileError);
      return;
    }

    const dadsNumber = profile.dads_number;
    if (!dadsNumber || !dadsNumber.trim()) {
      console.error('❌ Dad\'s number not found in profile. Cannot initiate call.');
      return;
    }
    
    console.log('✅ Dad\'s number found:', dadsNumber);

    // Clean and format phone number
    const cleanedPhone = dadsNumber.trim().replace(/[\s\-\(\)]/g, '');
    
    // Format phone number with country code if needed
    const toPhoneNumber = cleanedPhone.startsWith('+') 
      ? cleanedPhone 
      : cleanedPhone.startsWith('1') && cleanedPhone.length === 11
      ? `+${cleanedPhone}`
      : `+1${cleanedPhone}`;
    
    console.log('📞 Calling dad\'s number:', toPhoneNumber, '(original:', dadsNumber, ')');

    // Create Basic Auth header for Twilio
    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    
    // Twilio API endpoint to create a call
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`;
    
    // Create form data for Twilio API
    const formData = new URLSearchParams();
    formData.append('From', TWILIO_PHONE_NUMBER);
    formData.append('To', toPhoneNumber);
    formData.append('Url', WEBHOOK_URL);
    formData.append('Method', 'POST');

    console.log('📞 Initiating automatic call (same as test button)...', {
      from: TWILIO_PHONE_NUMBER,
      to: toPhoneNumber,
      webhook: WEBHOOK_URL
    });

    console.log('Twilio API Request:', {
      url: url,
      accountSid: TWILIO_ACCOUNT_SID ? `${TWILIO_ACCOUNT_SID.substring(0, 10)}...` : 'MISSING',
      authToken: TWILIO_AUTH_TOKEN ? `${TWILIO_AUTH_TOKEN.substring(0, 10)}...` : 'MISSING',
      from: TWILIO_PHONE_NUMBER,
      to: toPhoneNumber,
      webhook: WEBHOOK_URL
    });

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
      console.error('Twilio API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 500)
      });
      
      // Check if it's an authentication error
      if (response.status === 401 || response.status === 403) {
        console.error('Twilio authentication failed. Please check your Twilio credentials in the .env file and rebuild the extension.');
      } else if (errorText.includes('html') || errorText.includes('login')) {
        console.error('Twilio authentication failed. The credentials may be incorrect. Please verify your Twilio Account SID and Auth Token.');
      }
      return;
    }

    const result = await response.json();
    console.log('✅✅✅ AI agent call successfully initiated! ✅✅✅');
    console.log('   Call SID:', result.sid);
    console.log('   Calling:', toPhoneNumber);
    console.log('   This is the same logic as the test button - call should work!');
    
    // Reset productive time to 0 after call is initiated (same as test button behavior)
    const now = Date.now();
    await updateTrackingState({
      lastCallTriggerTime: now,
      consecutiveProductiveMs: 0,
      totalProductiveMs: 0,
    });
    
    console.log('✅ Productive time reset to 0');
    console.log('✅ Counter will start accumulating again for the next cycle');
  } catch (error) {
    console.error('❌❌❌ ERROR TRIGGERING AI CALL ❌❌❌');
    console.error('   Error:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
    }
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
 * Uses chrome.alarms for reliability (survives service worker suspension)
 */
async function tick(): Promise<void> {
  const state = await getTrackingState();
  const now = Date.now();
  const elapsed = now - state.lastTick;

  // Handle service worker wake-up: if elapsed time is very large, the service worker was suspended
  // Cap the elapsed time to prevent huge jumps (max 10 seconds)
  // This allows the counter to continue even if service worker was suspended briefly
  const maxElapsed = 10000; // 10 seconds max gap
  const actualElapsed = elapsed > maxElapsed ? maxElapsed : elapsed;
  
  if (actualElapsed <= 0) {
    await updateTrackingState({ lastTick: now });
    return;
  }
  
  // Log if service worker was suspended
  if (elapsed > maxElapsed) {
    console.log(`⚠️ Service worker was suspended for ${Math.floor(elapsed / 1000)}s, continuing tracking with capped elapsed time`);
  }

  // IMPORTANT: Continue tracking even if window is not focused
  // This ensures the counter doesn't stop randomly when user switches windows
  // Only pause if user is idle AND window is not focused (both conditions)
  // For productive time tracking, we want it to continue as long as user is active
  const shouldPause = isIdle && !isWindowFocused;
  
  if (shouldPause) {
    // Only pause if BOTH conditions are met: idle AND not focused
    // This prevents the counter from stopping when user just switches windows
    console.log('⏸️ Pausing tracking: user is idle and window is not focused');
    await updateTrackingState({
      lastTick: now,
    });
    return;
  }
  
  // Log tracking status for debugging
  if (!isWindowFocused && !isIdle) {
    // User is active but window not focused - continue tracking
    // This is normal when user switches between windows
  }

  // Get current active tab
  const currentUrl = await getActiveTabUrl();
  const currentDomain = extractDomain(currentUrl ?? undefined);

  // Update domain if changed
  if (currentDomain !== state.currentDomain) {
    await updateDomain(currentDomain);
    // Get updated state after domain change
    const updatedState = await getTrackingState();
    await processTime(updatedState, actualElapsed);
  } else {
    await processTime(state, actualElapsed);
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
    
    // Check if we've reached or exceeded the AI call trigger threshold (2 minutes = 120 seconds)
    // Trigger immediately when threshold is reached, even if we jumped past it
    const previousConsecutive = state.consecutiveProductiveMs;
    const previousSeconds = Math.floor(previousConsecutive / 1000);
    const newSeconds = Math.floor(newConsecutive / 1000);
    const hasReachedThreshold = newConsecutive >= AI_CALL_TRIGGER_MS;
    const wasBelowThreshold = previousConsecutive < AI_CALL_TRIGGER_MS;
    
    // Log progress every 10 seconds for debugging
    if (newSeconds > 0 && newSeconds % 10 === 0 && previousSeconds < newSeconds) {
      console.log(`⏱️ Productive time: ${newSeconds}s / 120s (${Math.floor((newConsecutive / AI_CALL_TRIGGER_MS) * 100)}%)`);
    }
    
    // Trigger if we just crossed the threshold OR if we're at/past threshold and haven't triggered yet
    // This ensures immediate triggering as soon as we hit 2 minutes
    if (hasReachedThreshold && wasBelowThreshold) {
      // Trigger AI agent call immediately when productive time reaches 2 minutes
      const productiveSeconds = Math.floor(newConsecutive / 1000);
      console.log(`🚀🚀🚀 PRODUCTIVE TIME REACHED ${productiveSeconds} SECONDS (2 MINUTES) 🚀🚀🚀`);
      console.log(`   Previous: ${previousSeconds}s, New: ${newSeconds}s`);
      console.log(`   Threshold: ${AI_CALL_TRIGGER_MS}ms (${AI_CALL_TRIGGER_MS / 1000}s)`);
      console.log(`   Triggering AI agent call NOW...`);
      
      try {
        await triggerAICall();
        console.log(`✅ triggerAICall() completed`);
      } catch (error) {
        console.error(`❌ ERROR in triggerAICall():`, error);
        console.error(`   Error details:`, error instanceof Error ? error.message : String(error));
        console.error(`   Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
      }
      
      // Note: triggerAICall will reset productive time after call is initiated
      // Don't return early - let the state update continue so we can see the reset
    }
    
    // IMPORTANT: Do NOT reset consecutiveProductiveMs automatically
    // It should only reset when:
    // 1. Call is initiated (handled in triggerAICall)
    // 2. Update Leaderboard button is pressed (handled in popup)
    // 3. User switches to unproductive domain (handled in updateDomain)
    
    // Still record productive trigger at 60s for database tracking, but don't reset counter
    if (newConsecutive >= PRODUCTIVE_TRIGGER_MS && previousConsecutive < PRODUCTIVE_TRIGGER_MS) {
      await recordProductiveTrigger(state.currentDomain, newConsecutive, userId);
    }
    
    // Always update the counter and total (no reset)
    await updateTrackingState({
      consecutiveProductiveMs: newConsecutive,
      totalProductiveMs: newTotal,
      lastTick: Date.now(),
    });
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
  const currentDomain = extractDomain(currentUrl ?? undefined);
  await updateDomain(currentDomain);

  // Set up interval for periodic ticks (every second)
  // Note: Service workers can be suspended by Chrome, but setInterval will resume when service worker wakes up
  // We handle service worker suspension in the tick() function by checking elapsed time
  // If service worker was suspended, we cap the elapsed time to continue tracking smoothly
  setInterval(() => {
    tick().catch((error) => {
      console.error('Error in tick:', error);
    });
  }, TICK_INTERVAL_MS);
  
  // Set up alarm for leaderboard updates (every minute)
  // chrome.alarms works well for longer intervals and survives service worker suspension
  chrome.alarms.create('leaderboardUpdate', {
    periodInMinutes: LEADERBOARD_UPDATE_INTERVAL_MS / 60000,
    delayInMinutes: LEADERBOARD_UPDATE_INTERVAL_MS / 60000,
  });
  
  // Also trigger immediately to start tracking right away
  tick().catch(console.error);
  checkAndUpdateLeaderboard().catch(console.error);
  
  console.log('✅ Tracking initialized');
  console.log('   - Counter will continue even when window loses focus');
  console.log('   - Counter only pauses if user is idle AND window is not focused');
  console.log('   - Service worker suspension is handled automatically');
}

// Alarm listener for leaderboard updates (survives service worker suspension)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'leaderboardUpdate') {
    checkAndUpdateLeaderboard().catch(console.error);
  }
});

// Event listeners

chrome.tabs.onActivated.addListener(async () => {
  const currentUrl = await getActiveTabUrl();
  const currentDomain = extractDomain(currentUrl ?? undefined);
  await updateDomain(currentDomain);
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const currentDomain = extractDomain(tab.url);
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
    console.log('⚠️ Window lost focus, but tracking continues (counter will NOT stop)');
  } else {
    isWindowFocused = true;
    console.log('✅ Window gained focus, tracking active');
    // Update domain when window gains focus
    const currentUrl = await getActiveTabUrl();
    const currentDomain = extractDomain(currentUrl ?? undefined);
    await updateDomain(currentDomain);
  }
});

chrome.idle.onStateChanged.addListener((newState) => {
  isIdle = newState === 'idle' || newState === 'locked';
  if (isIdle) {
    console.log('⚠️ User is idle/locked, but tracking continues (counter will only pause if window is also not focused)');
  } else {
    console.log('✅ User is active, tracking continues');
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

