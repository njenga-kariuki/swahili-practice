# WhatsApp deployment notes

The Worker receives WhatsApp Cloud API webhooks, sends questions to Claude, and returns formatted replies. Cloudflare KV stores a 30-turn conversation window with a 24-hour expiry, a persistent learner profile, and exchange logs for later review.

Local `data/progress.json` is updated through the lesson commands or `/review-whatsapp`; the Worker updates its own KV learner model after each response.

## Configuration

Use the setup sequence in the [root README](../../README.md). You need your own Meta app with WhatsApp Cloud API access, a permitted test recipient, a Cloudflare account, an Anthropic API key, and a random webhook verification token.

The setup script creates the KV namespace, fills the local `wrangler.toml`, stores API credentials as Worker secrets, and deploys. Finish by configuring the Worker URL as the WhatsApp callback and subscribing to messages in Meta's dashboard.

Required Worker secrets are `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN` and `ANTHROPIC_API_KEY`. `ALLOWED_PHONE_NUMBERS` and `MODEL` are local configuration variables. Keep credentials, the populated configuration and generated prompt out of Git.

After changing the learner baseline or local progress, regenerate the prompt with `bash mobile/build-prompt.sh`, then deploy from `mobile/whatsapp-bot` using `npx wrangler deploy`.

Provider pricing, token expiry, message rules and setup screens can change. Consult the provider dashboards before operating a new deployment. The original 2026 personal deployment is not included with this source release.
