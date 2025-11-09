/**
 * Webhook server for Twilio + Deepgram AI Agent integration
 * 
 * This server handles incoming Twilio voice calls and integrates with Deepgram
 * to provide an AI agent that can have conversations with users.
 * 
 * Deploy this to a service like Vercel, Netlify Functions, or a Node.js server.
 * 
 * Required environment variables:
 * - DEEPGRAM_API_KEY: Your Deepgram API key
 * - TWILIO_ACCOUNT_SID: Your Twilio Account SID
 * - TWILIO_AUTH_TOKEN: Your Twilio Auth Token
 */

const express = require('express');
const { createClient } = require('@deepgram/sdk');
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// IMPORTANT: Set DEEPGRAM_API_KEY as an environment variable
// Never commit API keys to git
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';

if (!DEEPGRAM_API_KEY) {
  console.error('ERROR: DEEPGRAM_API_KEY environment variable is not set!');
  process.exit(1);
}

const deepgram = createClient(DEEPGRAM_API_KEY);

/**
 * Twilio webhook endpoint - handles incoming calls
 * This endpoint is called by Twilio when a call is initiated
 */
app.post('/twilio-voice', async (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    
    // Connect the call to Deepgram for real-time transcription and AI response
    const connect = twiml.connect();
    
    // Create a Deepgram stream
    const stream = await deepgram.listen.prerecorded.transcribeUrl(
      { model: 'nova-2', language: 'en-US' },
      { url: 'https://api.deepgram.com/v1/listen' }
    );
    
    // For real-time conversation, we need to use Deepgram's streaming API
    // This is a simplified version - you'll need to implement the full streaming logic
    connect.stream({
      url: `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&api_key=${DEEPGRAM_API_KEY}`
    });
    
    // Add a simple message
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Hello! I noticed you\'ve been on a productive website for 2 minutes. How can I help you stay focused?');
    
    // Add a gather to collect user input
    const gather = twiml.gather({
      input: 'speech',
      language: 'en-US',
      timeout: 10,
      speechTimeout: 'auto'
    });
    
    gather.say('Please speak your response.');
    
    // If no input, say goodbye
    twiml.say('Thank you for your time. Have a great day!');
    twiml.hangup();
    
    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Error handling Twilio webhook:', error);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, there was an error processing your call.');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * Deepgram webhook endpoint - handles transcription results
 */
app.post('/deepgram-webhook', async (req, res) => {
  try {
    const { results } = req.body;
    
    if (results && results.channels && results.channels[0] && results.channels[0].alternatives) {
      const transcript = results.channels[0].alternatives[0].transcript;
      console.log('Transcription:', transcript);
      
      // Here you can add logic to process the transcript and generate AI responses
      // For example, use OpenAI, Claude, or another AI service to generate responses
      
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'No transcription results' });
    }
  } catch (error) {
    console.error('Error handling Deepgram webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
  console.log(`Twilio webhook URL: https://your-domain.com/twilio-voice`);
  console.log(`Deepgram webhook URL: https://your-domain.com/deepgram-webhook`);
});

module.exports = app;

