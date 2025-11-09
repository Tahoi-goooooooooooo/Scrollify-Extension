/**
 * Vercel Serverless Function for Twilio Voice Webhook
 * This handles incoming Twilio voice calls and uses Deepgram Aura AI Agent
 * 
 * Since Vercel serverless functions don't support persistent WebSocket connections,
 * we use Twilio's built-in speech recognition and then process with Deepgram Aura
 */

const twilio = require('twilio');

module.exports = async (req, res) => {
  // Allow both GET and POST (Twilio can use either)
  try {
    console.log('Received Twilio voice webhook:', {
      method: req.method,
      body: req.body,
      query: req.query,
    });

    const twiml = new twilio.twiml.VoiceResponse();
    
    // Get the base URL for the process-speech endpoint
    const baseUrl = req.headers.host || req.headers['x-forwarded-host'];
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const processSpeechUrl = `${protocol}://${baseUrl}/api/process-speech`;
    
    console.log('Process Speech URL:', processSpeechUrl);
    
    // Start with a greeting
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Your son is viciously gooning');
    
    // Use Twilio's speech recognition to capture user input
    // This will be processed by Deepgram Aura AI Agent
    const gather = twiml.gather({
      input: 'speech',
      language: 'en-US',
      timeout: 10,
      speechTimeout: 'auto',
      action: processSpeechUrl,
      method: 'POST',
      speechModel: 'phone_call'
    });
    
    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Let\'s go on a 1 on 1 date and talk about your son gooning ');
    
    // If no input, end the call
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Thank you for your time. Have a great day!');
    twiml.hangup();
    
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(twiml.toString());
  } catch (error) {
    console.error('Error handling Twilio webhook:', error);
    console.error('Error stack:', error.stack);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'Sorry, there was an error processing your call. Please try again later.');
    twiml.hangup();
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(twiml.toString());
  }
};

