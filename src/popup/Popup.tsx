import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../supabaseClient';
import { getTrackingState, updateTrackingState, setUserId, type TrackingState } from '../storage';
import { classifyDomain, extractDomain } from '../classify';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, WEBHOOK_URL } from '../env';

function Popup() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [trackingState, setTrackingState] = useState<TrackingState | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Check auth state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    // Get current tab URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        setCurrentUrl(tabs[0].url);
      }
    });

    // Update tracking state periodically
    const updateState = async () => {
      const state = await getTrackingState();
      setTrackingState(state);
      setTheme(state.theme || 'light');
    };

    updateState();
    const interval = setInterval(updateState, 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoginError(error.message);
    } else if (data.user) {
      // Get user_id from profiles table to match foreign key constraint
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', data.user.id)
        .single();
      
      if (profileError || !profile) {
        setLoginError('Profile not found. Please contact support.');
        console.error('Error getting profile:', profileError);
      } else {
        await setUserId(profile.user_id);
        setUser(data.user);
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    await setUserId(null);
    setUser(null);
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    await updateTrackingState({ theme: newTheme });
  };

  const handleTestCall = async () => {
    try {
      // Validate credentials
      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
        alert('Twilio credentials missing. Please check your .env file.');
        console.error('Twilio credentials missing. Cannot initiate call.');
        return;
      }

      if (!WEBHOOK_URL || WEBHOOK_URL.includes('your-webhook-server.com')) {
        alert('Webhook URL not configured. Please set VITE_WEBHOOK_URL in .env file.');
        console.error('Webhook URL not configured.');
        return;
      }

      // Get current user_id from tracking state
      const state = await getTrackingState();
      if (!state.userId) {
        alert('You must be logged in to test the call.');
        console.error('No user ID found');
        return;
      }

      // Fetch dad's number from profiles table using user_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('dads_number')
        .eq('user_id', state.userId)
        .single();

      if (profileError || !profile) {
        alert('Error: Could not find your profile. Please contact support.');
        console.error('Error fetching profile:', profileError);
        return;
      }

      const dadsNumber = profile.dads_number;
      if (!dadsNumber || !dadsNumber.trim()) {
        alert('Error: Dad\'s number not found in your profile. Please update your profile.');
        console.error('Dad\'s number not found in profile');
        return;
      }

      // Clean and format phone number
      const cleanedPhone = dadsNumber.trim().replace(/[\s\-\(\)]/g, '');
      
      // Format phone number with country code if needed
      const toPhoneNumber = cleanedPhone.startsWith('+') 
        ? cleanedPhone 
        : cleanedPhone.startsWith('1') && cleanedPhone.length === 11
        ? `+${cleanedPhone}`
        : `+1${cleanedPhone}`;
      
      console.log('Test call - Calling dad\'s number:', toPhoneNumber, '(original:', dadsNumber, ')');

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

      console.log('Initiating test call...', {
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
          error: errorText
        });
        
        // Check if it's an authentication error
        if (response.status === 401 || response.status === 403) {
          alert('Twilio authentication failed. Please check your Twilio credentials in the .env file and rebuild the extension.');
        } else if (errorText.includes('html') || errorText.includes('login')) {
          alert('Twilio authentication failed. The credentials may be incorrect. Please verify your Twilio Account SID and Auth Token.');
        } else {
          alert(`Twilio Error (${response.status}): ${errorText.substring(0, 200)}`);
        }
        return;
      }

      const result = await response.json();
      console.log('AI agent call initiated:', result);
      alert(`Call initiated! Call SID: ${result.sid}\nCalling: ${toPhoneNumber}\nYou should receive a call shortly.`);
    } catch (error) {
      console.error('Error triggering test call:', error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleTransferUnproductiveTime = async () => {
    const state = await getTrackingState();
    if (!state.userId) {
      console.error('No user ID found');
      return;
    }

    const unproductiveSeconds = Math.floor((state.totalUnproductiveMs || 0) / 1000);
    const productiveSeconds = Math.floor((state.totalProductiveMs || 0) / 1000);
    
    // If both times are zero, nothing to do
    if (unproductiveSeconds === 0 && productiveSeconds === 0) {
      console.log('No time to transfer');
      return;
    }

    try {
      // Get current best_score and productive_time from leaderboard_global
      const { data: currentLeaderboard, error: fetchError } = await supabase
        .from('leaderboard_global')
        .select('user_id, best_score, productive_time')
        .eq('user_id', state.userId)
        .single();

      // If no entry exists, create one with both unproductive and productive time
      if (fetchError && fetchError.code === 'PGRST116') {
        const initialScore = unproductiveSeconds;
        const initialProductiveTime = productiveSeconds;
        
        const { error: insertError } = await supabase
          .from('leaderboard_global')
          .insert({
            user_id: state.userId,
            best_score: initialScore,
            productive_time: initialProductiveTime,
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error('Error creating leaderboard entry:', insertError);
        } else {
          // Reset both times and consecutive counter
          await updateTrackingState({
            totalUnproductiveMs: 0,
            totalProductiveMs: 0,
            consecutiveProductiveMs: 0,
          });
          console.log(`Successfully created leaderboard entry with best_score: ${initialScore}s and productive_time: ${initialProductiveTime}s`);
        }
        return;
      }

      if (fetchError) {
        console.error('Error fetching leaderboard:', fetchError);
        return;
      }

      // Verify user_id matches
      if (currentLeaderboard.user_id !== state.userId) {
        console.error('User ID mismatch. Cannot update score.');
        return;
      }

      // Calculate new values: add unproductive time to best_score, add productive time to productive_time
      const newScore = (currentLeaderboard.best_score || 0) + unproductiveSeconds;
      const newProductiveTime = (currentLeaderboard.productive_time || 0) + productiveSeconds;

      // Update leaderboard_global with both best_score and productive_time
      const { error: updateError } = await supabase
        .from('leaderboard_global')
        .update({
          best_score: newScore,
          productive_time: newProductiveTime,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', state.userId);

      if (updateError) {
        console.error('Error updating leaderboard:', updateError);
      } else {
        // Reset both unproductive and productive time to zero
        // Also reset consecutiveProductiveMs so the counter starts fresh
        await updateTrackingState({
          totalUnproductiveMs: 0,
          totalProductiveMs: 0,
          consecutiveProductiveMs: 0,
        });
        console.log(`Successfully updated leaderboard:`);
        console.log(`  best_score: +${unproductiveSeconds}s (new: ${newScore}s)`);
        console.log(`  productive_time: +${productiveSeconds}s (new: ${newProductiveTime}s)`);
        console.log(`  Reset both times to zero`);
      }
    } catch (error) {
      console.error('Error transferring time:', error);
    }
  };

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const isDark = theme === 'dark';
  const bgColor = isDark ? '#1a1a1a' : '#ffffff';
  const textColor = isDark ? '#ffffff' : '#000000';
  const cardBg = isDark ? '#2a2a2a' : '#f5f5f5';
  const borderColor = isDark ? '#444' : '#ccc';
  const inputBg = isDark ? '#333' : '#ffffff';
  const inputText = isDark ? '#ffffff' : '#000000';

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: bgColor, color: textColor, minHeight: '400px' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: bgColor, color: textColor }}>
        <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Scrollify Web Tracker</h2>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                boxSizing: 'border-box',
                border: `1px solid ${borderColor}`,
                borderRadius: '4px',
                backgroundColor: inputBg,
                color: inputText,
              }}
            />
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                boxSizing: 'border-box',
                border: `1px solid ${borderColor}`,
                borderRadius: '4px',
                backgroundColor: inputBg,
                color: inputText,
              }}
            />
          </div>
          {loginError && (
            <div style={{ color: 'red', marginBottom: '15px', fontSize: '12px' }}>
              {loginError}
            </div>
          )}
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '14px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        </form>
      </div>
    );
  }

  const domain = currentUrl ? extractDomain(currentUrl) : trackingState?.currentDomain || null;
  const classification = classifyDomain(domain);
  const productiveMs = trackingState?.totalProductiveMs || 0;
  const unproductiveMs = trackingState?.totalUnproductiveMs || 0;

  // Color scheme: unproductive=green (good), productive=red (bad)
  const productiveBg = '#f8d7da'; // Light red
  const productiveText = '#721c24'; // Dark red
  const unproductiveColor = '#28a745'; // Green
  const unproductiveBg = '#d4edda'; // Light green
  const unproductiveText = '#155724'; // Dark green

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif', minWidth: '300px', backgroundColor: bgColor, color: textColor }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>Scrollify</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={toggleTheme}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              backgroundColor: isDark ? '#444' : '#e0e0e0',
              color: isDark ? '#fff' : '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: cardBg, borderRadius: '4px' }}>
        <div style={{ fontSize: '12px', color: isDark ? '#aaa' : '#666', marginBottom: '4px' }}>Signed in as</div>
        <div style={{ fontSize: '14px', fontWeight: '500' }}>{user.email}</div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', color: isDark ? '#aaa' : '#666', marginBottom: '8px' }}>Current Domain</div>
        <div style={{ fontSize: '14px', fontWeight: '500', wordBreak: 'break-all' }}>
          {domain || 'None'}
        </div>
        {classification && (
          <div
            style={{
              display: 'inline-block',
              marginTop: '8px',
              padding: '4px 8px',
              fontSize: '11px',
              borderRadius: '4px',
              backgroundColor: classification === 'productive' ? productiveBg : unproductiveBg,
              color: classification === 'productive' ? productiveText : unproductiveText,
            }}
          >
            {classification === 'productive' ? '⚠ Productive' : '✓ Unproductive'}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <div style={{ padding: '12px', backgroundColor: unproductiveBg, borderRadius: '4px' }}>
          <div style={{ fontSize: '11px', color: unproductiveText, marginBottom: '4px' }}>Unproductive Time</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: unproductiveText }}>
            {formatTime(unproductiveMs)}
          </div>
        </div>
        <div style={{ padding: '12px', backgroundColor: productiveBg, borderRadius: '4px' }}>
          <div style={{ fontSize: '11px', color: productiveText, marginBottom: '4px' }}>Productive Time</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: productiveText }}>
            {formatTime(productiveMs)}
          </div>
        </div>
      </div>

      <button
        onClick={handleTransferUnproductiveTime}
        style={{
          width: '100%',
          padding: '10px',
          fontSize: '14px',
          backgroundColor: unproductiveColor,
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: '500',
          marginBottom: '12px',
        }}
      >
        Update Leaderboard
      </button>

      <button
        onClick={handleTestCall}
        style={{
          width: '100%',
          padding: '10px',
          fontSize: '14px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: '500',
        }}
      >
        📞 Test Call to Dad's Number
      </button>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}

