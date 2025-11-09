/**
 * Advanced Webhook Server for Twilio + Deepgram AI Agent Integration
 * 
 * This server handles incoming Twilio voice calls and uses Deepgram's
 * real-time transcription API to create an AI agent that can have conversations.
 * 
 * Deployment Options:
 * - Vercel (serverless functions)
 * - Netlify Functions
 * - Railway
 * - Heroku
 * - Any Node.js server
 * 
 * Environment Variables Required:
 * - DEEPGRAM_API_KEY: Your Deepgram API key
 * - PORT: Server port (default: 3000)
 */

const express = require('express');
const twilio = require('twilio');
const { createClient } = require('@deepgram/sdk');

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
 * Twilio webhook endpoint - initiates the call and sets up media stream
 */
app.post('/twilio-voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  
  // Create a Media Stream that sends audio to Deepgram
  const connect = twiml.connect();
  
  // Start with a greeting
  twiml.say({
    voice: 'alice',
    language: 'en-US'
  }, 'Hello! I noticed you\'ve been on a productive website for 2 minutes. How can I help you stay focused today?');
  
  // Set up media stream to Deepgram for real-time transcription
  // Note: This requires Twilio Media Streams and proper WebSocket setup
  const stream = connect.stream({
    url: `wss://${req.headers.host}/media-stream`
  });
  
  // Fallback: If media stream fails, use simple gather
  const gather = twiml.gather({
    input: 'speech',
    language: 'en-US',
    timeout: 10,
    speechTimeout: 'auto',
    action: '/process-speech',
    method: 'POST'
  });
  
  gather.say('Please tell me how I can help you.');
  
  // If no input, end the call
  twiml.say('Thank you for your time. Stay focused!');
  twiml.hangup();
  
  res.type('text/xml');
  res.send(twiml.toString());
});

/**
 * Process speech input from Twilio
 */
app.post('/process-speech', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const speechResult = req.body.SpeechResult || '';
  
  console.log('User said:', speechResult);
  
  // Here you can integrate with an AI service (OpenAI, Claude, etc.)
  // to generate a response based on the user's speech
  // For now, we'll use a simple response
  
  let response = 'I understand you said: ' + speechResult + '. ';
  
  // Add some basic logic based on keywords
  if (speechResult.toLowerCase().includes('help') || speechResult.toLowerCase().includes('distracted')) {
    response += 'I\'m here to help you stay focused. Try taking a short break or switching to a more engaging task.';
  } else if (speechResult.toLowerCase().includes('thank') || speechResult.toLowerCase().includes('thanks')) {
    response += 'You\'re welcome! Remember to take breaks and stay hydrated.';
  } else {
    response += 'Remember, staying focused is about balance. Take breaks when needed.';
  }
  
  twiml.say({
    voice: 'alice',
    language: 'en-US'
  }, response);
  
  // Ask if they need anything else
  const gather = twiml.gather({
    input: 'speech',
    language: 'en-US',
    timeout: 5,
    speechTimeout: 'auto',
    action: '/process-speech',
    method: 'POST'
  });
  
  gather.say('Is there anything else I can help you with?');
  
  // End call if no response
  twiml.say('Thank you for your time. Have a productive day!');
  twiml.hangup();
  
  res.type('text/xml');
  res.send(twiml.toString());
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
  console.log(`\nTwilio Webhook URLs:`);
  console.log(`  Voice: https://your-domain.com/twilio-voice`);
  console.log(`  Speech: https://your-domain.com/process-speech`);
  console.log(`\nConfigure these URLs in your Twilio console.`);
});

module.exports = app;

