import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '../supabaseClient';
import { getTrackingState, setUserId, type TrackingState } from '../storage';
import { classifyDomain, extractDomain } from '../classify';

function Popup() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [trackingState, setTrackingState] = useState<TrackingState | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

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

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <h2 style={{ marginTop: 0, marginBottom: '20px' }}>ScrollBlock Web Tracker</h2>
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
                border: '1px solid #ccc',
                borderRadius: '4px',
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
                border: '1px solid #ccc',
                borderRadius: '4px',
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
  const productiveMs = trackingState?.consecutiveProductiveMs || 0;
  const unproductiveMs = trackingState?.unproductiveMsBuffer || 0;

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif', minWidth: '300px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>ScrollBlock</h2>
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

      <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Signed in as</div>
        <div style={{ fontSize: '14px', fontWeight: '500' }}>{user.email}</div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Current Domain</div>
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
              backgroundColor: classification === 'productive' ? '#d4edda' : '#f8d7da',
              color: classification === 'productive' ? '#155724' : '#721c24',
            }}
          >
            {classification === 'productive' ? '✓ Productive' : '⚠ Unproductive'}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <div style={{ padding: '12px', backgroundColor: '#d4edda', borderRadius: '4px' }}>
          <div style={{ fontSize: '11px', color: '#155724', marginBottom: '4px' }}>Productive Time</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#155724' }}>
            {formatTime(productiveMs)}
          </div>
        </div>
        <div style={{ padding: '12px', backgroundColor: '#f8d7da', borderRadius: '4px' }}>
          <div style={{ fontSize: '11px', color: '#721c24', marginBottom: '4px' }}>Unproductive Time</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#721c24' }}>
            {formatTime(unproductiveMs)}
          </div>
        </div>
      </div>

      <div style={{ fontSize: '11px', color: '#666', textAlign: 'center', marginTop: '20px' }}>
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

