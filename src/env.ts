// Environment variables for Supabase
// These should be set in your build process or replaced at build time
const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
// Remove trailing slashes as Supabase client doesn't accept them
export const SUPABASE_URL = rawUrl.trim().replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

