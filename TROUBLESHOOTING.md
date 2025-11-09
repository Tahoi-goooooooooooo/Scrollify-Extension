# Troubleshooting Guide

## Issue: "Prompts to log into api.twilio.com" when calling

This error occurs when Twilio API authentication fails. The browser is trying to display Twilio's login page instead of making the API call.

### Possible Causes:

1. **Twilio credentials are incorrect**
   - Account SID or Auth Token might be wrong
   - Credentials might have been rotated/changed

2. **Credentials not loaded in extension**
   - Extension might not have been rebuilt after updating `.env`
   - Environment variables might not be set correctly

3. **Extension not reloaded**
   - Changes to `.env` require rebuilding and reloading the extension

### Solution Steps:

#### Step 1: Verify Twilio Credentials

1. Go to [Twilio Console](https://www.twilio.com/console)
2. Check your **Account SID** and **Auth Token**
3. Compare with your `.env` file:
   ```
   VITE_TWILIO_ACCOUNT_SID=ACde888dfedeb9fa1f4dd0bdae8c65eaf7
   VITE_TWILIO_AUTH_TOKEN=6f29e478426822dd030bf4ddfb932490
   ```

#### Step 2: Verify Credentials in .env File

Check that your `.env` file has the correct credentials:

```bash
cat .env | grep TWILIO
```

Should show:
```
VITE_TWILIO_ACCOUNT_SID=ACde888dfedeb9fa1f4dd0bdae8c65eaf7
VITE_TWILIO_AUTH_TOKEN=6f29e478426822dd030bf4ddfb932490
VITE_TWILIO_PHONE_NUMBER=+18259063105
```

#### Step 3: Rebuild the Extension

After updating `.env`, you MUST rebuild:

```bash
npm run build
```

#### Step 4: Reload Extension in Chrome

1. Go to `chrome://extensions/`
2. Find "Scrollify Web Tracker"
3. Click the reload button (🔄)
4. Or remove and re-add the extension

#### Step 5: Check Browser Console

1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Click the "Test Call" button
4. Look for error messages
5. Check for "Twilio API Error" logs

#### Step 6: Test Twilio Credentials Directly

You can test if your credentials work using curl:

```bash
curl -X POST https://api.twilio.com/2010-04-01/Accounts/ACde888dfedeb9fa1f4dd0bdae8c65eaf7/Calls.json \
  -u ACde888dfedeb9fa1f4dd0bdae8c65eaf7:6f29e478426822dd030bf4ddfb932490 \
  -d "From=+18259063105" \
  -d "To=+1234567890" \
  -d "Url=https://scrollify-webhook.vercel.app/api/twilio-voice"
```

If this fails, your credentials are incorrect.

### Common Errors:

#### Error: "Authentication failed"
- **Cause**: Wrong Account SID or Auth Token
- **Solution**: Verify credentials in Twilio Console and update `.env`

#### Error: "Account not found"
- **Cause**: Account SID is incorrect
- **Solution**: Check Account SID in Twilio Console

#### Error: "Invalid credentials"
- **Cause**: Auth Token is incorrect or expired
- **Solution**: Generate a new Auth Token in Twilio Console

#### Error: "HTML login page"
- **Cause**: Credentials are completely wrong or missing
- **Solution**: Verify all credentials and rebuild extension

### Debugging:

1. **Check if credentials are loaded:**
   - Open browser console
   - Look for "Twilio API Request" logs
   - Verify credentials are not "MISSING"

2. **Check extension build:**
   - Verify `dist/` folder has latest build
   - Check build timestamp

3. **Verify environment variables:**
   - Make sure `.env` file exists
   - Make sure variables start with `VITE_`
   - Rebuild after any changes

### Still Not Working?

1. **Double-check Twilio Console:**
   - Log into https://www.twilio.com/console
   - Verify Account SID matches
   - Verify Auth Token (might need to regenerate)

2. **Regenerate Auth Token:**
   - Go to Twilio Console
   - Settings → Auth Tokens
   - Create a new Auth Token
   - Update `.env` file
   - Rebuild extension

3. **Check Extension Permissions:**
   - Make sure extension has necessary permissions
   - Check `manifest.json` for required permissions

4. **Check Network Requests:**
   - Open Chrome DevTools → Network tab
   - Click "Test Call" button
   - Look for the Twilio API request
   - Check the request headers and response

### Quick Fix Checklist:

- [ ] Twilio credentials are correct in `.env`
- [ ] Extension has been rebuilt (`npm run build`)
- [ ] Extension has been reloaded in Chrome
- [ ] Browser console shows no credential errors
- [ ] Twilio credentials work when tested with curl
- [ ] Webhook URL is correct and accessible

