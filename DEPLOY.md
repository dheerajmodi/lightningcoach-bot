# ⚡ LIGHTNINGCOACH BOT — Deployment Guide
## Get from zero to fully automated in 30 minutes

---

## What This Bot Does (fully no-touch)

1. Manager clicks WhatsApp link on your website
2. Bot greets them, asks name, role
3. Bot sends 10 self-assessment questions one at a time
4. Bot asks for biggest leadership challenge
5. Bot asks for peer WhatsApp numbers
6. Bot automatically messages each peer with anonymous survey
7. Bot collects all peer responses
8. Bot calls Claude API to analyze everything
9. Bot generates a beautiful PDF report
10. Bot sends report to manager via WhatsApp
11. Bot sends upsell message ("Want this for your team?")
12. Bot sends weekly coaching challenges for 30 days

**You do NOTHING. It's fully automated.**

---

## Step 1: Get Your API Keys (10 minutes)

### Twilio (WhatsApp)
1. Go to twilio.com → sign up (free trial gives you $15 credit)
2. Go to Console → get your ACCOUNT SID and AUTH TOKEN
3. Go to Messaging → Try WhatsApp → Follow the sandbox setup
4. Note your Twilio WhatsApp number (usually +14155238886 for sandbox)
5. For production: Apply for a Twilio WhatsApp Business number

### Anthropic Claude API
1. Go to console.anthropic.com → sign up
2. Go to API Keys → Create new key
3. Add $10 credit (each assessment costs ~₹4 in API calls)

---

## Step 2: Deploy to Railway (10 minutes, FREE)

### Option A: Railway (Recommended — easiest)
1. Go to railway.app → sign up with GitHub
2. Click "New Project" → "Deploy from GitHub Repo"
3. Select your lightningcoach-bot repo (upload this code to GitHub first)
4. Railway auto-detects Node.js and deploys
5. Go to Variables tab → add all env variables from .env.example
6. Railway gives you a URL like: lightningcoach-bot.railway.app
7. Set BASE_URL to this URL

### Option B: Render (Also free)
1. Go to render.com → sign up
2. New → Web Service → Connect your GitHub repo
3. Build Command: npm install
4. Start Command: npm start
5. Add environment variables
6. Get your URL

---

## Step 3: Connect Twilio Webhook (2 minutes)

1. Go to Twilio Console → Messaging → Settings → WhatsApp Sandbox
2. In "WHEN A MESSAGE COMES IN" field, enter:
   `https://your-railway-url.railway.app/webhook`
3. Method: POST
4. Save

---

## Step 4: Test It

1. Send "Hi" to your Twilio WhatsApp sandbox number
   (Twilio sandbox: send "join <your-sandbox-word>" first)
2. The bot should respond with the welcome message
3. Follow the flow — answer all questions
4. Give it a peer number (your own second phone or a friend)
5. Complete the peer survey
6. Wait for the PDF report

---

## Step 5: Go Live with Your Own WhatsApp Number

1. In Twilio Console → Messaging → Senders → WhatsApp Senders
2. Click "Register WhatsApp Sender"
3. Submit your business WhatsApp number for approval
4. This takes 1-3 business days
5. Once approved, update TWILIO_WHATSAPP_NUMBER in your env variables
6. Update your landing page WhatsApp links to your business number

---

## Costs

| Item | Cost |
|------|------|
| Twilio WhatsApp messages | ~₹0.50/message (~₹15/assessment) |
| Claude API per assessment | ~₹4 |
| Railway/Render hosting | Free tier |
| **Total per assessment** | **~₹20** |

At ₹1,999/assessment when you start charging, that's 99% gross margin.

---

## Quick Upload to GitHub

If you haven't uploaded this code to GitHub yet:

```bash
cd lightningcoach-bot
git init
git add .
git commit -m "LightningCoach WhatsApp Bot v1"
git remote add origin https://github.com/dheerajmodi/lightningcoach-bot.git
git push -u origin main
```

Or create a new repo at github.com/new called "lightningcoach-bot" and upload all files via the GitHub web interface (Add file → Upload files).

---

## Troubleshooting

**Bot not responding?**
- Check Railway/Render logs for errors
- Verify webhook URL is correct in Twilio
- Make sure all env variables are set

**PDF not sending?**
- Check BASE_URL is set correctly
- Verify reports directory exists
- Check Twilio logs for media errors

**Claude API errors?**
- Check API key is valid
- Check you have credit in your Anthropic account
- The model 'claude-sonnet-4-20250514' should be available

---

## Architecture

```
User WhatsApp → Twilio → Your Server (Railway) → Claude API
                                    ↓
                              PDF Generated
                                    ↓
                         Twilio → User WhatsApp (report sent)
                                    ↓
                         Auto coaching messages (weekly)
```

Zero databases. Zero frontend. Zero human intervention.
The entire business runs on one Node.js file.
