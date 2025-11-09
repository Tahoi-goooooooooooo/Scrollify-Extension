# Fix Twilio Credentials Issue

## Problem Identified

The Twilio API is returning a **401 Authentication Error**, which means your Twilio credentials are **incorrect or expired**.

## Solution

### Step 1: Get Your Correct Twilio Credentials

1. **Log into Twilio Console:**
   - Go to https://www.twilio.com/console
   - Use your Twilio account email and password

2. **Get Your Account SID:**
   - On the Twilio Console dashboard, you'll see your **Account SID**
   - It starts with `AC` followed by 32 characters
   - Copy this value

3. **Get Your Auth Token:**
   - Click on your Account SID (or go to Settings → Auth Tokens)
   - Your **Auth Token** will be displayed (it's hidden by default)
   - Click "Show" to reveal it
   - Copy this value
   - **Note:** If you can't see it, you may need to create a new one

### Step 2: Update Your .env File

Edit your `.env` file and update the credentials:

```env
VITE_TWILIO_ACCOUNT_SID=YOUR_ACTUAL_ACCOUNT_SID
VITE_TWILIO_AUTH_TOKEN=YOUR_ACTUAL_AUTH_TOKEN
VITE_TWILIO_PHONE_NUMBER=+18259063105
VITE_WEBHOOK_URL=https://scrollify-webhook.vercel.app/api/twilio-voice
```

**Replace:**
- `YOUR_ACTUAL_ACCOUNT_SID` with your real Account SID from Twilio Console
- `YOUR_ACTUAL_AUTH_TOKEN` with your real Auth Token from Twilio Console

### Step 3: Rebuild the Extension

After updating `.env`, you MUST rebuild:

```bash
npm run build
```

### Step 4: Reload Extension

1. Go to `chrome://extensions/`
2. Find "Scrollify Web Tracker"
3. Click the reload button (🔄)

### Step 5: Test the Credentials

You can test if your new credentials work:

```bash
curl -X POST https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/Calls.json \
  -u YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN \
  -d "From=+18259063105" \
  -d "To=+1234567890" \
  -d "Url=https://scrollify-webhook.vercel.app/api/twilio-voice"
```

If this succeeds (returns a Call SID), your credentials are correct!

## Current Issue

The current credentials in your `.env` file are:
- Account SID: `ACde888dfedeb9fa1f4dd0bdae8c65eaf7`
- Auth Token: `6f29e478426822dd030bf4ddfb932490`

**These are returning a 401 error**, which means they are either:
1. Incorrect
2. Expired
3. From a different account
4. The Auth Token was regenerated

## Next Steps

1. **Log into Twilio Console** with the account that owns phone number `+18259063105`
2. **Get the correct credentials** from the dashboard
3. **Update your `.env` file** with the correct values
4. **Rebuild the extension**: `npm run build`
5. **Reload the extension** in Chrome
6. **Test again**

## Security Note

⚠️ **Never share your Auth Token publicly!** 
- Keep it in your `.env` file (which is in `.gitignore`)
- Don't commit it to git
- Don't share it in screenshots or messages

## Still Having Issues?

If you can't access the Twilio account:
1. You may need to create a new Twilio account
2. Purchase a new phone number
3. Update all credentials in your `.env` file
4. Update the extension code if the phone number changes

