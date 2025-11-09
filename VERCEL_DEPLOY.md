# Vercel Deployment Guide

This guide explains how to deploy the Twilio + Deepgram Aura AI Agent integration to Vercel.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Vercel CLI** (optional): `npm i -g vercel`
3. **Deepgram API Key**: `fbc61c49-4226-4213-9439-0590a90db262`
4. **Twilio Account**: With phone number configured

## Deployment Steps

### 1. Install Vercel CLI (if not already installed)

```bash
npm i -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Deploy to Vercel

```bash
# From the project root directory
vercel

# Or for production deployment
vercel --prod
```

### 4. Set Environment Variables

After deployment, set the environment variables in Vercel:

1. Go to your project on [vercel.com](https://vercel.com)
2. Navigate to **Settings** > **Environment Variables**
3. Add the following variable:
   - `DEEPGRAM_API_KEY`: `fbc61c49-4226-4213-9439-0590a90db262`

### 5. Get Your Vercel URL

After deployment, Vercel will provide a URL like:
```
https://your-project-name.vercel.app
```

### 6. Update Extension Webhook URL

Update the `VITE_WEBHOOK_URL` in your `.env` file:

```
VITE_WEBHOOK_URL=https://your-project-name.vercel.app/api/twilio-voice
```

Then rebuild the extension:
```bash
npm run build
```

### 7. Update Twilio Webhook URL

1. Go to [Twilio Console](https://www.twilio.com/console)
2. Navigate to **Phone Numbers** > **Manage** > **Active Numbers**
3. Click on your Twilio phone number
4. Under **Voice & Fax**, set:
   - **A CALL COMES IN**: `https://your-project-name.vercel.app/api/twilio-voice`
   - Method: `HTTP POST`
5. Click **Save**

## Testing

1. Make sure the extension is built and loaded in Chrome
2. Click the "📞 Test Call to Dad's Number" button
3. The call should connect and the AI agent should start talking!

## File Structure

```
api/
  ├── twilio-voice.js    # Handles incoming Twilio calls
  ├── process-speech.js  # Processes speech with Deepgram Aura
  └── media-stream.js    # Media stream handler (for future WebSocket support)
vercel.json              # Vercel configuration
```

## Environment Variables

### Vercel Environment Variables
- `DEEPGRAM_API_KEY`: Deepgram API key for AI agent

### Extension Environment Variables (.env)
- `VITE_WEBHOOK_URL`: Your Vercel deployment URL + `/api/twilio-voice`
- `VITE_TWILIO_ACCOUNT_SID`: Twilio Account SID
- `VITE_TWILIO_AUTH_TOKEN`: Twilio Auth Token
- `VITE_TWILIO_PHONE_NUMBER`: Twilio Phone Number

## Troubleshooting

### Deployment fails
- Check that all dependencies are listed in `package.json`
- Verify `vercel.json` configuration is correct
- Check Vercel deployment logs

### Webhook not working
- Verify the Vercel URL is accessible
- Check that environment variables are set in Vercel
- Verify Twilio webhook URL is correct
- Check Vercel function logs

### AI agent not responding
- Verify Deepgram API key is set in Vercel
- Check Vercel function logs for errors
- Verify the speech processing endpoint is working

### Calls not connecting
- Verify Twilio credentials are correct
- Check that dad's number is stored in profiles table
- Verify webhook URL is set correctly in extension
- Check Twilio call logs

## Notes

- Vercel serverless functions have a 10-second timeout for free tier
- For production, consider upgrading to Vercel Pro for longer timeouts
- WebSocket connections require a separate server (Vercel doesn't support persistent WebSockets)
- The current implementation uses Twilio's speech recognition with Deepgram Aura for responses

## Next Steps

1. Deploy to Vercel
2. Set environment variables
3. Update extension webhook URL
4. Update Twilio webhook URL
5. Test the call functionality

