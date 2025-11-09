import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';

// Only create client if credentials are provided
// This prevents service worker registration failures when env vars are missing
let supabase: SupabaseClient;

try {
  // Validate URL format
  const isValidUrl = SUPABASE_URL && 
                     SUPABASE_ANON_KEY && 
                     (SUPABASE_URL.startsWith('http://') || SUPABASE_URL.startsWith('https://')) &&
                     SUPABASE_URL.length > 10; // Basic length check
  
  if (isValidUrl) {
    // Ensure URL doesn't have trailing slash
    const cleanUrl = SUPABASE_URL.trim().replace(/\/+$/, '');
    supabase = createClient(cleanUrl, SUPABASE_ANON_KEY.trim());
    console.log('Supabase client initialized successfully');
  } else {
    throw new Error('Invalid Supabase credentials');
  }
} catch (error) {
  // If credentials are invalid or missing, create a dummy client that won't crash
  // This allows the service worker to register, but Supabase calls will fail gracefully
  console.error('Failed to initialize Supabase client:', error);
  console.warn('Service worker will register but Supabase features will not work.');
  // Create with a valid format to prevent crashes, but it won't work for real requests
  try {
    supabase = createClient('https://placeholder.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder');
  } catch (fallbackError) {
    // If even the fallback fails, we need to handle this differently
    console.error('Critical: Could not create Supabase client even with fallback');
    throw fallbackError;
  }
}

export { supabase };

