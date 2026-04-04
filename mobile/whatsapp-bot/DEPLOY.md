# Swahili WhatsApp Bot — Setup & Deployment

## What This Does

Puts your Swahili Q&A on WhatsApp so you can look things up one-tap while you're out in Nairobi. Same quality as `/ask` — morpheme breakdowns, grammar notes, Kenyan usage — but on your phone.

**What it does NOT do:** This bot never writes to `progress.json`. It's a read-only field reference. Your structured learning progress only updates through `/swahili` and `/ask` in Claude Code. If you look something up on WhatsApp and want it tracked for lesson reinforcement, use `/ask` later.

## Architecture

```
You (WhatsApp) → Cloudflare Worker → Claude API → WhatsApp reply
                        ↓
              KV Store (30-turn sliding window, 24hr TTL)
```

- **Cloudflare Workers** (free tier): Runs the bot, no server to manage
- **Claude Sonnet**: Powers responses (~$0.05/query)
- **KV Store**: Remembers your conversations throughout the day so follow-ups work

## Before You Start — Get 5 Things

### 1. Create a Meta Developer App (5 minutes)

1. Go to **developers.facebook.com** — log in (or create an account)
2. Click **My Apps** → **Create App**
3. Select **Other** use case → **Business** type → give it a name like "Swahili Bot"
4. Once created, find **WhatsApp** in the product list and click **Set Up**
5. You'll land on the **API Setup** page — note the **Phone number ID** shown there (a long number like `123456789012345`)

### 2. Add Your Phone as a Test Recipient

1. On the same API Setup page, under the **"To"** field, click **Manage phone number list**
2. Add your personal WhatsApp number
3. You'll receive a verification code on WhatsApp — enter it

### 3. Create a Permanent Access Token (3 minutes)

The default token from the dashboard expires in 24 hours. For a bot that runs continuously, you need a permanent one:

1. Go to **business.facebook.com** → **Business Settings**
2. Under **Users** → **System Users** → click **Add**
3. Name it something like "swahili-bot" → role: Admin
4. Click the system user → **Add Assets** → select your app → toggle **Full Control**
5. Click **Generate New Token** → select your app → check **whatsapp_business_messaging** → **Generate Token**
6. **Copy this token** — it starts with `EAA...` and doesn't expire

### 4. Choose a Webhook Verify Token

Make up any secret string, e.g. `swahili-bot-verify-2026`. You'll enter this during setup and again in the Meta dashboard.

### 5. Get an Anthropic API Key

1. Go to console.anthropic.com → Settings → API Keys
2. Create a new key — copy it (starts with `sk-ant-...`)
3. Make sure you have billing set up (each query costs ~$0.05)

## Setup (One Command)

Everything is already installed. Run the setup script from the project root:

```bash
./mobile/whatsapp-bot/setup.sh
```

The script will:
1. Ask you to paste the 5 things you collected above
2. Open a browser for Cloudflare login (free account — sign up if you don't have one)
3. Create the KV namespace
4. Configure everything automatically
5. Deploy the bot
6. Print instructions for the final webhook step

### Final Step: Configure Webhook

After the script finishes, it will print your worker URL. Go to:

1. **developers.facebook.com** → Your App → **WhatsApp** → **Configuration**
2. Under **Webhook**, click **Edit**
3. Paste your worker URL as the **Callback URL**
4. Enter your verify token
5. Click **Verify and Save**
6. Under **Webhook fields**, click **Subscribe** next to **messages**

## Test It

Send these to the WhatsApp test number (shown on your API Setup page):
- `How do I say 'excuse me'?` → should get Samahani with breakdown
- `What does 'hatutakuja' mean?` → morpheme breakdown (ha-tu-ta-kuja)
- Then: `more examples?` → should use context from previous question (KV memory)

## After Setup — Day-to-Day

**You don't need to do anything.** The bot just runs on Cloudflare's free tier.

### When to Redeploy

After a `/swahili` session changes your tier, or when grammar/vocab files are updated:

```bash
./mobile/build-prompt.sh                          # regenerate system prompt
cd mobile/whatsapp-bot && npx wrangler deploy     # push update
```

This updates the bot's awareness of your current level and weak areas.

### Cost

- Cloudflare Workers: **free** (100k requests/day)
- WhatsApp Cloud API: **free** (1,000 service conversations/month)
- Claude Sonnet: **~$0.05/query** — at 50 queries/day that's ~$2.50/day

## Troubleshooting

**Bot doesn't respond at all:**

1. Check webhook is configured: developers.facebook.com → Your App → WhatsApp → Configuration. The callback URL should point to your worker.
2. Check worker logs:
```bash
cd mobile/whatsapp-bot && npx wrangler tail
```
Send a WhatsApp message — you'll see the request in real time.

**Bot responds with error message:**
Check worker logs as above. Common issues:
- `WhatsApp API error: 401` → access token expired. Generate a new permanent token (see step 3 above).
- `Claude API 401` → Anthropic API key issue. Re-set: `npx wrangler secret put ANTHROPIC_API_KEY`

**Want to change the model:**
Edit `MODEL` in `wrangler.toml`, then `npx wrangler deploy`.
