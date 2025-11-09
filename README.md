# Scrollify Web Tracker

A Chrome Extension (Manifest V3) that tracks your web browsing activity, classifies websites as productive or unproductive, and syncs data with Supabase.

## Features

- **Supabase Authentication**: Sign in with email and password, session persists across browser restarts
- **Real-time Website Tracking**: Continuously monitors which website you're currently viewing
- **Smart Classification**: Automatically classifies websites as productive or unproductive
  - Unproductive: youtube.com, tiktok.com, instagram.com (including subdomains)
  - Productive: All other websites
- **Time Tracking**: Tracks time spent on websites while browser is active (pauses when idle/locked)
- **Productive Triggers**: Records events when you've been productive for 60+ seconds straight
- **Leaderboard Integration**: Accumulates unproductive time and sends to Supabase leaderboard

## Setup

### Prerequisites

- Node.js 18+ and npm/yarn
- Chrome browser
- Supabase project with the following tables:
  - `leaderboard_scores` (user_id, score)
  - `productive_triggers` (user_id, domain, duration_seconds)

### Installation

1. Clone this repository:

```bash
git clone <repository-url>
cd Scrollify-Extension
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Build the extension:

```bash
npm run build
```

5. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

## Development

### Watch Mode

For development with auto-rebuild:

```bash
npm run dev
```

After making changes, reload the extension in `chrome://extensions/` by clicking the reload icon.

### Project Structure

```
extension/
├── src/
│   ├── background.ts          # Service worker with tracking logic
│   ├── popup/
│   │   ├── Popup.tsx         # React popup UI component
│   │   └── index.html        # Popup HTML entry point
│   ├── supabaseClient.ts     # Supabase client initialization
│   ├── classify.ts           # Domain classification logic
│   ├── storage.ts            # Chrome storage utilities
│   └── env.ts                # Environment variables
├── manifest.json             # Extension manifest
├── vite.config.ts            # Vite build configuration
├── tsconfig.json             # TypeScript configuration
└── package.json             # Dependencies and scripts
```

## How It Works

### Tracking Logic

1. **Domain Detection**: Uses Chrome APIs (`chrome.tabs.onActivated`, `chrome.tabs.onUpdated`, `chrome.windows.onFocusChanged`) to detect active tab changes
2. **Idle Detection**: Uses `chrome.idle.onStateChanged` to pause tracking when user is idle or screen is locked
3. **Periodic Updates**: Uses `chrome.alarms` to run a tick function every 5 seconds that:
   - Calculates elapsed time since last tick
   - Updates productive/unproductive counters
   - Flushes data to Supabase when thresholds are met

### State Management

The extension maintains state in Chrome's local storage:

```typescript
{
  currentDomain: string | null,
  lastTick: number,
  consecutiveProductiveMs: number,
  unproductiveMsBuffer: number,
  userId: string | null
}
```

### Rules

- **Productive Trigger**: When `consecutiveProductiveMs >= 60000` (60 seconds), creates a record in `productive_triggers` table
- **Unproductive Buffer**: When `unproductiveMsBuffer >= 10000` (10 seconds), sends accumulated time to `leaderboard_scores` table
- **Domain Changes**: When domain changes, accumulated time is flushed to the appropriate bucket before resetting counters

## Supabase Schema

The extension expects the following tables:

### `leaderboard_scores`

```sql
user_id: uuid
score: integer (seconds)
```

### `productive_triggers`

```sql
user_id: uuid
domain: text
duration_seconds: integer
```

Make sure Row Level Security (RLS) is properly configured on your Supabase backend.

## Permissions

The extension requires:

- `tabs`: To detect active tab changes
- `idle`: To detect when user is idle/locked
- `storage`: To persist tracking state
- `alarms`: For periodic tick function
- `host_permissions: ["*://*/*"]`: To access all websites for tracking

## License

MIT
