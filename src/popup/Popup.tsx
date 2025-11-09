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
      await setUserId(data.user.id);
      setUser(data.user);
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
      <div style={{ padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: bgColor, color: textColor, minHeight: '400px' }}>
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
  const productiveColor = '#dc3545'; // Red
  const productiveBg = '#f8d7da'; // Light red
  const productiveText = '#721c24'; // Dark red
  const unproductiveColor = '#28a745'; // Green
  const unproductiveBg = '#d4edda'; // Light green
  const unproductiveText = '#155724'; // Dark green

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif', minWidth: '300px', backgroundColor: bgColor, color: textColor, minHeight: '400px' }}>
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

      <div style={{ fontSize: '11px', color: isDark ? '#aaa' : '#666', textAlign: 'center', marginTop: '20px' }}>
        Tracking updates every 5 seconds
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}

