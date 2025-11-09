ScrollBlock Web Tracker - Chrome Extension
==========================================

This extension is ready to load in Chrome!

LOADING INSTRUCTIONS:
1. Open Chrome and go to: chrome://extensions/
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this "dist" folder

IMPORTANT: Before using the extension:
- Update the .env file in the project root with your Supabase credentials:
  VITE_SUPABASE_URL=your_url
  VITE_SUPABASE_ANON_KEY=your_key
- Then rebuild: npm run build

The extension will:
- Track your browsing activity
- Classify sites as productive/unproductive
- Record productive triggers (60+ seconds)
- Send unproductive time to leaderboard
- Show real-time stats in the popup

Built files:
- background.js (service worker)
- popup/index.html (popup UI)
- assets/ (bundled JavaScript)
- manifest.json (extension config)
