import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../supabaseClient';
import { getTrackingState, updateTrackingState, setUserId, type TrackingState } from '../storage';
import { classifyDomain, extractDomain } from '../classify';

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

  const handleTransferUnproductiveTime = async () => {
    const state = await getTrackingState();
    if (!state.userId) {
      console.error('No user ID found');
      return;
    }

    const unproductiveSeconds = Math.floor((state.totalUnproductiveMs || 0) / 1000);
    const productiveSeconds = Math.floor((state.totalProductiveMs || 0) / 1000);
    
    // Calculate net change: unproductive time adds, productive time subtracts
    const netChange = unproductiveSeconds - productiveSeconds;
    
    // If both are zero, nothing to do
    if (unproductiveSeconds === 0 && productiveSeconds === 0) {
      console.log('No time to transfer');
      return;
    }

    try {
      // Get current best_score from leaderboard_global
      const { data: currentLeaderboard, error: fetchError } = await supabase
        .from('leaderboard_global')
        .select('user_id, best_score')
        .eq('user_id', state.userId)
        .single();

      // If no entry exists, create one with the net change as score
      if (fetchError && fetchError.code === 'PGRST116') {
        const initialScore = Math.max(0, netChange); // Ensure score doesn't go below 0
        
        const { error: insertError } = await supabase
          .from('leaderboard_global')
          .insert({
            user_id: state.userId,
            best_score: initialScore,
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error('Error creating leaderboard entry:', insertError);
        } else {
          // Reset both times
          await updateTrackingState({
            totalUnproductiveMs: 0,
            totalProductiveMs: 0,
          });
          console.log(`Successfully created leaderboard entry with score ${initialScore} and reset times`);
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

      // Calculate new score: add unproductive time, subtract productive time
      // Ensure score doesn't go below 0
      const newScore = Math.max(0, (currentLeaderboard.best_score || 0) + netChange);

      // Update leaderboard_global
      const { error: updateError } = await supabase
        .from('leaderboard_global')
        .update({
          best_score: newScore,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', state.userId);

      if (updateError) {
        console.error('Error updating leaderboard:', updateError);
      } else {
        // Reset both unproductive and productive time to zero
        await updateTrackingState({
          totalUnproductiveMs: 0,
          totalProductiveMs: 0,
        });
        console.log(`Successfully updated best_score: +${unproductiveSeconds}s -${productiveSeconds}s = ${netChange >= 0 ? '+' : ''}${netChange} (new score: ${newScore}) and reset both times to zero`);
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
        }}
      >
        Update Leaderboard
      </button>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}

