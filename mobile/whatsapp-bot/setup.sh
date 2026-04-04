#!/usr/bin/env bash
set -euo pipefail

# Interactive setup script for the Swahili WhatsApp bot.
# Handles: wrangler login, KV creation, secrets, deploy, webhook instructions.
# Run from: mobile/whatsapp-bot/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRANGLER="$SCRIPT_DIR/node_modules/.bin/wrangler"
TOML="$SCRIPT_DIR/wrangler.toml"
PROMPT="$SCRIPT_DIR/src/system-prompt.txt"

echo "=== Swahili WhatsApp Bot Setup ==="
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
echo "I need 5 things from you before we start. Instructions for getting each:"
echo ""
echo "  1. WHATSAPP PHONE NUMBER ID"
echo "     Go to developers.facebook.com > Your App > WhatsApp > API Setup"
echo "     Look for 'Phone number ID' under the test number section"
echo "     It's a numeric ID like: 123456789012345"
echo ""
echo "  2. WHATSAPP PERMANENT ACCESS TOKEN"
echo "     Go to business.facebook.com > Business Settings > System Users"
echo "     Create a system user > Add your app with 'Full control'"
echo "     Generate Token > select 'whatsapp_business_messaging' permission"
echo "     Copy the token (starts with EAA...)"
echo ""
echo "  3. WEBHOOK VERIFY TOKEN"
echo "     Make up any secret string (e.g. 'swahili-bot-verify-2026')"
echo "     You'll enter this same string in the Meta dashboard later"
echo ""
echo "  4. ANTHROPIC API KEY"
echo "     Go to console.anthropic.com > Settings > API Keys > Create Key"
echo "     Starts with sk-ant-..."
echo ""
echo "  5. YOUR WHATSAPP PHONE NUMBER"
echo "     Your personal phone number in international format, no +"
echo "     Example: 254712345678 (Kenya)"
echo ""
echo "---"
echo ""

read -rp "Paste your WHATSAPP PHONE NUMBER ID: " PHONE_NUMBER_ID
if [[ -z "$PHONE_NUMBER_ID" ]]; then echo "Error: phone number ID required"; exit 1; fi

read -rp "Paste your WHATSAPP ACCESS TOKEN: " ACCESS_TOKEN
if [[ -z "$ACCESS_TOKEN" ]]; then echo "Error: access token required"; exit 1; fi

read -rp "Choose a WEBHOOK VERIFY TOKEN: " VERIFY_TOKEN
if [[ -z "$VERIFY_TOKEN" ]]; then echo "Error: verify token required"; exit 1; fi

read -rp "Paste your ANTHROPIC API KEY: " API_KEY
if [[ -z "$API_KEY" ]]; then echo "Error: API key required"; exit 1; fi

read -rp "Your phone number (international, no +): " PHONE_NUMBER
if [[ -z "$PHONE_NUMBER" ]]; then echo "Error: phone number required"; exit 1; fi

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
# Update allowed phone numbers
sed -i '' "s|ALLOWED_PHONE_NUMBERS = \"<your-phone-number>\"|ALLOWED_PHONE_NUMBERS = \"${PHONE_NUMBER}\"|" "$TOML"
echo "Updated wrangler.toml with KV ID and phone number."
echo ""

# Step 5: Set secrets
echo "--- Step 4/5: Setting secrets ---"
echo "$ACCESS_TOKEN" | "$WRANGLER" secret put WHATSAPP_ACCESS_TOKEN 2>&1
echo "$VERIFY_TOKEN" | "$WRANGLER" secret put WHATSAPP_VERIFY_TOKEN 2>&1
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

# Step 7: Print webhook setup instructions
echo "=== DEPLOY COMPLETE ==="
echo ""
echo "One final step — configure the WhatsApp webhook in Meta's dashboard:"
echo ""
echo "  1. Go to: developers.facebook.com > Your App > WhatsApp > Configuration"
echo "  2. Under 'Webhook', click 'Edit'"
echo "  3. Callback URL:   ${WORKER_URL}"
echo "  4. Verify token:   ${VERIFY_TOKEN}"
echo "  5. Click 'Verify and Save'"
echo "  6. Under 'Webhook fields', click 'Subscribe' next to 'messages'"
echo ""
echo "Once done, send a WhatsApp message to your test number to verify it works."
echo "  Try: How do I say 'excuse me'?"
echo "  Try: What does 'hatutakuja' mean?"
echo ""
echo "Your test number is shown in: developers.facebook.com > Your App > WhatsApp > API Setup"
