// Environment variables for Supabase
// These should be set in your build process or replaced at build time
const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
// Remove trailing slashes as Supabase client doesn't accept them
export const SUPABASE_URL = rawUrl.trim().replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

// Environment variables for Twilio and Deepgram
// These must be set in your .env file - never commit secrets to git
export const TWILIO_ACCOUNT_SID = import.meta.env.VITE_TWILIO_ACCOUNT_SID || '';
export const TWILIO_AUTH_TOKEN = import.meta.env.VITE_TWILIO_AUTH_TOKEN || '';
export const TWILIO_PHONE_NUMBER = import.meta.env.VITE_TWILIO_PHONE_NUMBER || '';
export const USER_PHONE_NUMBER = import.meta.env.VITE_USER_PHONE_NUMBER || '';
export const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || '';
export const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || 'https://your-webhook-server.com/twilio-voice';

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER || !USER_PHONE_NUMBER) {
  console.warn('Twilio credentials not found. Please set VITE_TWILIO_ACCOUNT_SID, VITE_TWILIO_AUTH_TOKEN, VITE_TWILIO_PHONE_NUMBER, and VITE_USER_PHONE_NUMBER in your .env file');
}

if (!DEEPGRAM_API_KEY) {
  console.warn('Deepgram API key not found. Please set VITE_DEEPGRAM_API_KEY in your .env file');
}

