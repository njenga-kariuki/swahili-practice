# Swahili Telegram Bot — Setup & Deployment

## What This Does

Puts your Swahili Q&A on Telegram so you can look things up one-tap while you're out in Nairobi. Same quality as `/ask` — morpheme breakdowns, grammar notes, Kenyan usage — but on your phone.

**What it does NOT do:** This bot never writes to `progress.json`. It's a read-only field reference. Your structured learning progress only updates through `/swahili` and `/ask` in Claude Code. If you look something up on Telegram and want it tracked for lesson reinforcement, use `/ask` later.

## Architecture

```
You (Telegram) → Cloudflare Worker → Claude API → Telegram reply
                        ↓
              KV Store (1-turn, 30-min TTL — just for follow-up context)
```

- **Cloudflare Workers** (free tier): Runs the bot, no server to manage
- **Claude Sonnet**: Powers responses (~$0.05/query)
- **KV Store**: Remembers your last question for 30 minutes so "more examples?" works

## Before You Start — Get 3 Things

You need to collect 3 tokens/IDs. Here's exactly how:

### 1. Create a Telegram Bot (2 minutes)

1. Open Telegram on your phone
2. Search for **@BotFather** and tap Start
3. Send: `/newbot`
4. When asked for a name, type something like: `Swahili Helper`
5. When asked for a username, type something like: `jay_swahili_bot` (must end in `bot`)
6. **BotFather replies with your bot token** — it looks like `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
7. Copy and save this token somewhere (you'll paste it during setup)

Optional: send `/setdescription` to BotFather and set it to "Swahili Q&A — translations, grammar breakdowns, Kenyan usage"

### 2. Get Your Telegram Chat ID (1 minute)

1. In Telegram, search for **@userinfobot**
2. Tap Start (or send any message)
3. It replies with your info — **copy the `Id` number** (looks like `123456789`)

### 3. Get an Anthropic API Key

1. Go to console.anthropic.com → Settings → API Keys
2. Create a new key — copy it (starts with `sk-ant-...`)
3. Make sure you have billing set up (each query costs ~$0.05)

## Setup (One Command)

Everything is already installed. Run the setup script from the project root:

```bash
./mobile/telegram-bot/setup.sh
```

The script will:
1. Ask you to paste the 3 things you collected above
2. Open a browser for Cloudflare login (free account — sign up if you don't have one)
3. Create the KV namespace
4. Configure everything automatically
5. Deploy the bot
6. Set the Telegram webhook

When it says "SETUP COMPLETE" — open Telegram, find your bot, and send it a message.

## Test It

Send these to your bot:
- `How do I say 'excuse me'?` → should get Samahani with breakdown
- `What does 'hatutakuja' mean?` → morpheme breakdown (ha-tu-ta-kuja)
- Then: `more examples?` → should use context from previous question (KV memory)

## After Setup — Day-to-Day

**You don't need to do anything.** The bot just runs on Cloudflare's free tier.

### When to Redeploy

After a `/swahili` session changes your tier, or when grammar/vocab files are updated:

```bash
./mobile/build-prompt.sh                          # regenerate system prompt
cd mobile/telegram-bot && npx wrangler deploy     # push update
```

This updates the bot's awareness of your current level and weak areas.

### Cost

- Cloudflare Workers: **free** (100k requests/day)
- Claude Sonnet: **~$0.05/query** — at 50 queries/day that's ~$2.50/day

## Troubleshooting

**Bot doesn't respond at all:**
```bash
# Check webhook is set
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
```
Look for `"url"` pointing to your worker. If empty, re-set it:
```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>"
```

**Bot responds with error message:**
Check worker logs:
```bash
cd mobile/telegram-bot && npx wrangler tail
```
Then send a message to the bot — you'll see the error in real time.

**Want to change the model:**
Edit `MODEL` in `wrangler.toml`, then `npx wrangler deploy`.
