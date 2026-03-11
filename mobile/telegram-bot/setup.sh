#!/usr/bin/env bash
set -euo pipefail

# Interactive setup script for the Swahili Telegram bot.
# Handles: wrangler login, KV creation, secrets, deploy, webhook.
# Run from: mobile/telegram-bot/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRANGLER="$SCRIPT_DIR/node_modules/.bin/wrangler"
TOML="$SCRIPT_DIR/wrangler.toml"
PROMPT="$SCRIPT_DIR/src/system-prompt.txt"

echo "=== Swahili Telegram Bot Setup ==="
echo ""

# Pre-checks
if [[ ! -f "$PROMPT" ]]; then
  echo "Error: system-prompt.txt not found. Run build-prompt.sh first:"
  echo "  cd $(dirname "$SCRIPT_DIR") && ./build-prompt.sh"
  exit 1
fi

if [[ ! -x "$WRANGLER" ]]; then
  echo "Error: wrangler not found. Run: cd $SCRIPT_DIR && npm install"
  exit 1
fi

# Step 1: Collect info upfront
echo "I need 3 things from you before we start. Instructions for getting each:"
echo ""
echo "  1. TELEGRAM BOT TOKEN"
echo "     Open Telegram → search @BotFather → send /newbot"
echo "     Follow the prompts (pick a name and username)"
echo "     BotFather replies with a token like: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
echo ""
echo "  2. YOUR TELEGRAM CHAT ID"
echo "     Open Telegram → search @userinfobot → send any message"
echo "     It replies with your ID (a number like 123456789)"
echo ""
echo "  3. ANTHROPIC API KEY"
echo "     Go to console.anthropic.com → API Keys → Create Key"
echo "     Starts with sk-ant-..."
echo ""
echo "---"
echo ""

read -rp "Paste your TELEGRAM BOT TOKEN: " BOT_TOKEN
if [[ -z "$BOT_TOKEN" ]]; then echo "Error: token required"; exit 1; fi

read -rp "Paste your TELEGRAM CHAT ID: " CHAT_ID
if [[ -z "$CHAT_ID" ]]; then echo "Error: chat ID required"; exit 1; fi

read -rp "Paste your ANTHROPIC API KEY: " API_KEY
if [[ -z "$API_KEY" ]]; then echo "Error: API key required"; exit 1; fi

echo ""
echo "Got it. Starting setup..."
echo ""

# Step 2: Wrangler login
echo "--- Step 1/5: Cloudflare login ---"
echo "A browser window will open. Log in to Cloudflare (free account is fine)."
echo ""
"$WRANGLER" login
echo ""

# Step 3: Create KV namespace
echo "--- Step 2/5: Creating KV namespace ---"
KV_OUTPUT=$("$WRANGLER" kv namespace create CHAT_MEMORY 2>&1) || true
echo "$KV_OUTPUT"

# Extract KV ID from output
KV_ID=$(echo "$KV_OUTPUT" | grep -oE 'id = "[^"]+"' | head -1 | sed 's/id = "//;s/"//')
if [[ -z "$KV_ID" ]]; then
  # Might already exist — try to extract from list
  KV_ID=$("$WRANGLER" kv namespace list 2>/dev/null | grep -A1 'CHAT_MEMORY' | grep -oE '"id": "[^"]+"' | head -1 | sed 's/"id": "//;s/"//') || true
fi

if [[ -z "$KV_ID" ]]; then
  echo ""
  echo "Warning: Could not auto-extract KV namespace ID."
  echo "Look at the output above for a line like: id = \"abc123...\""
  read -rp "Paste the KV namespace ID: " KV_ID
fi

echo "KV namespace ID: $KV_ID"
echo ""

# Step 4: Update wrangler.toml
echo "--- Step 3/5: Configuring wrangler.toml ---"
# Update KV namespace ID
sed -i '' "s|id = \"<created-during-setup>\"|id = \"${KV_ID}\"|" "$TOML"
# Update allowed chat IDs
sed -i '' "s|ALLOWED_CHAT_IDS = \"<your-telegram-chat-id>\"|ALLOWED_CHAT_IDS = \"${CHAT_ID}\"|" "$TOML"
echo "Updated wrangler.toml with KV ID and chat ID."
echo ""

# Step 5: Set secrets
echo "--- Step 4/5: Setting secrets ---"
echo "$BOT_TOKEN" | "$WRANGLER" secret put TELEGRAM_BOT_TOKEN 2>&1
echo "$API_KEY" | "$WRANGLER" secret put ANTHROPIC_API_KEY 2>&1
echo "Secrets set."
echo ""

# Step 6: Deploy
echo "--- Step 5/5: Deploying worker ---"
DEPLOY_OUTPUT=$("$WRANGLER" deploy 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract worker URL
WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[^ ]+workers\.dev' | head -1)
if [[ -z "$WORKER_URL" ]]; then
  echo ""
  echo "Warning: Could not auto-extract worker URL."
  echo "Look at the output above for a URL like: https://swahili-bot.xxx.workers.dev"
  read -rp "Paste the worker URL: " WORKER_URL
fi
echo ""

# Step 7: Set webhook
echo "--- Setting Telegram webhook ---"
WEBHOOK_RESULT=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${WORKER_URL}")
echo "Webhook response: $WEBHOOK_RESULT"
echo ""

# Verify
if echo "$WEBHOOK_RESULT" | grep -q '"ok":true'; then
  echo "=== SETUP COMPLETE ==="
  echo ""
  echo "Your bot is live! Open Telegram and send it a message:"
  echo "  Try: How do I say 'excuse me'?"
  echo "  Try: What does 'hatutakuja' mean?"
  echo ""
  echo "Pin the bot chat in Telegram for one-tap access."
else
  echo "=== WARNING ==="
  echo "Webhook setup may have failed. Check the response above."
  echo "You can retry manually:"
  echo "  curl \"https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${WORKER_URL}\""
fi
