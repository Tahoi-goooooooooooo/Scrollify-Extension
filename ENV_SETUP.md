# Environment Variables Setup

This document describes all environment variables required for the Scrollify extension.

## Required Environment Variables

Create a `.env` file in the root directory with the following variables:

### Supabase Configuration
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Twilio Configuration (for AI agent calls)
```env
VITE_TWILIO_ACCOUNT_SID=your-twilio-account-sid
VITE_TWILIO_AUTH_TOKEN=your-twilio-auth-token
VITE_TWILIO_PHONE_NUMBER=+1234567890
VITE_USER_PHONE_NUMBER=1234567890
```

### Deepgram Configuration (for AI agent)
```env
VITE_DEEPGRAM_API_KEY=your-deepgram-api-key
```

### Webhook URL (for AI agent calls)
```env
VITE_WEBHOOK_URL=https://your-webhook-server.com/twilio-voice
```

## Setup Instructions

1. Copy the example above and create a `.env` file in the root directory
2. Replace all placeholder values with your actual credentials
3. **Never commit the `.env` file to git** - it should be in `.gitignore`
4. Rebuild the extension after setting environment variables:
   ```bash
   npm run build
   ```

## Getting Your Credentials

### Supabase
1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy the Project URL and anon/public key

### Twilio
1. Sign up for a Twilio account at https://www.twilio.com
2. Go to the Twilio Console
3. Find your Account SID and Auth Token on the dashboard
4. Purchase a phone number in the Phone Numbers section

### Deepgram
1. Sign up for a Deepgram account at https://www.deepgram.com
2. Go to your API keys section
3. Create a new API key

### Webhook URL
1. Deploy the webhook server (see `WEBHOOK_SETUP.md`)
2. Use the deployed URL as your webhook URL
3. For local testing, use ngrok to create a public URL

## Security Notes

- **Never commit secrets to git**
- Use environment variables for all sensitive data
- Regularly rotate API keys
- Use different credentials for development and production
- Keep your `.env` file in `.gitignore`

## Troubleshooting

If you see warnings about missing credentials:
1. Check that your `.env` file exists in the root directory
2. Verify all variable names start with `VITE_`
3. Make sure there are no spaces around the `=` sign
4. Rebuild the extension after making changes
5. Check the browser console for specific error messages

