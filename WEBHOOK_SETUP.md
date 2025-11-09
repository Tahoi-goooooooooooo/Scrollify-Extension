# Webhook Server Setup for AI Agent Calls

This guide explains how to set up the webhook server needed for the AI agent voice call feature.

## Overview

The Chrome extension triggers a Twilio call when productive time reaches 2 minutes. The call requires a webhook server to:
1. Handle incoming Twilio voice calls
2. Integrate with Deepgram for speech transcription
3. Process user speech and generate AI responses

## Quick Setup (Using the Simple Server)

### Option 1: Deploy to Vercel

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Create a `vercel.json` file:
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "webhook-server-advanced.js",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/twilio-voice",
         "dest": "webhook-server-advanced.js"
       },
       {
         "src": "/process-speech",
         "dest": "webhook-server-advanced.js"
       }
     ]
   }
   ```

3. Set environment variables in Vercel:
   - `DEEPGRAM_API_KEY`: Your Deepgram API key
   - `PORT`: (optional, defaults to 3000)

4. Deploy:
   ```bash
   vercel
   ```

5. Copy the deployed URL and update it in `src/background.ts`:
   ```typescript
   const webhookUrl = `https://your-vercel-app.vercel.app/twilio-voice`;
   ```

### Option 2: Deploy to Railway

1. Create a new Railway project
2. Connect your GitHub repository
3. Set environment variables:
   - `DEEPGRAM_API_KEY`
   - `PORT` (optional)
4. Deploy and copy the public URL
5. Update the webhook URL in `src/background.ts`

### Option 3: Run Locally with ngrok (for testing)

1. Install dependencies:
   ```bash
   npm install express twilio @deepgram/sdk
   ```

2. Run the server:
   ```bash
   node webhook-server-advanced.js
   ```

3. In another terminal, start ngrok:
   ```bash
   ngrok http 3000
   ```

4. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)
5. Update the webhook URL in `src/background.ts`:
   ```typescript
   const webhookUrl = `https://abc123.ngrok.io/twilio-voice`;
   ```

## Configuration

### Update Webhook URL in Extension

Edit `src/background.ts` and update the webhook URL:

```typescript
const webhookUrl = `https://your-deployed-server.com/twilio-voice?deepgram_key=${encodeURIComponent(DEEPGRAM_API_KEY)}`;
```

### Configure Twilio

1. Go to your Twilio Console
2. Navigate to Phone Numbers → Manage → Active Numbers
3. Click on your Twilio phone number
4. Under "Voice & Fax", set the webhook URL:
   - **A CALL COMES IN**: `https://your-server.com/twilio-voice`
   - Method: `HTTP POST`

## How It Works

1. **Extension triggers call**: When productive time hits 2 minutes, the extension calls Twilio API to initiate a call
2. **Twilio calls your phone**: Twilio calls the configured phone number
3. **Webhook receives call**: Twilio sends a webhook request to your server
4. **Server responds with TwiML**: The server responds with TwiML instructions
5. **User speaks**: Twilio captures speech and sends it to your server
6. **AI processes speech**: (Optional) Your server can integrate with AI services to generate responses
7. **Server responds**: The server generates a response and sends it back as TwiML

## Advanced: Integrating with AI Services

To make the agent more intelligent, you can integrate with AI services:

### Example: Using OpenAI

```javascript
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/process-speech', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const speechResult = req.body.SpeechResult || '';
  
  // Get AI response
  const completion = await openai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a helpful assistant that helps users stay focused and productive.' },
      { role: 'user', content: speechResult }
    ],
    model: 'gpt-3.5-turbo'
  });
  
  const aiResponse = completion.choices[0].message.content;
  
  twiml.say({ voice: 'alice' }, aiResponse);
  // ... rest of the logic
});
```

### Example: Using Deepgram for Real-time Transcription

For real-time transcription during the call, you'll need to use Twilio Media Streams:

```javascript
// This requires WebSocket support and Media Streams setup
// See Twilio Media Streams documentation for full implementation
```

## Testing

1. Test the webhook server:
   ```bash
   curl -X POST http://localhost:3000/twilio-voice
   ```

2. Test with Twilio's webhook tester:
   - Use Twilio's webhook testing tool in the console
   - Or use ngrok to expose your local server

3. Test the full flow:
   - Trigger productive time in the extension
   - Wait for 2 minutes of productive time
   - Check that a call is initiated

## Troubleshooting

### Call not being initiated
- Check browser console for errors
- Verify Twilio credentials are correct
- Check that the webhook URL is accessible

### Webhook not receiving calls
- Verify the URL is publicly accessible
- Check Twilio console for webhook configuration
- Check server logs for incoming requests

### Speech not being processed
- Verify Deepgram API key is correct
- Check that the `/process-speech` endpoint is working
- Review Twilio speech recognition settings

## Security Notes

- **Never commit API keys to version control**
- Use environment variables for all sensitive data
- Consider adding authentication to your webhook endpoints
- Use HTTPS for all webhook URLs
- Regularly rotate API keys

## Next Steps

1. Deploy the webhook server to a hosting service
2. Update the webhook URL in `src/background.ts`
3. Test the call flow
4. (Optional) Integrate with AI services for smarter responses
5. (Optional) Add more sophisticated conversation logic

## Support

For issues or questions:
- Check Twilio documentation: https://www.twilio.com/docs
- Check Deepgram documentation: https://developers.deepgram.com/
- Review the extension logs in Chrome DevTools

