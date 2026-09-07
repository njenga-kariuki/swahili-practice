# Swahili Practice

An adaptive Swahili learning system combining structured lessons with a WhatsApp language coach. Built by Njenga Kariuki in 2026 for everyday Kenyan Swahili.

The project connects two kinds of practice: deliberate teaching at a desk and quick translation or grammar help in the middle of a conversation. Both contribute to a persistent picture of what the learner understands and where more practice would help.

## What is implemented

- A teach → practice → conversation lesson flow, with five difficulty tiers and concept-level mastery tracking.
- Reusable grammar and vocabulary references, plus commands for structured sessions and ad hoc questions.
- A Cloudflare Worker that receives WhatsApp messages, calls Claude and formats the response for WhatsApp.
- A bounded conversation window and a persistent learner profile in Cloudflare KV: vocabulary encountered, concepts practiced, detected gaps and teaching history.
- Structured response metadata that updates the learner model without appearing in the delivered answer.
- A review workflow that brings mobile exchanges into the local lesson record.

## Try the lesson workflow

Copy `data/progress.example.json` to `data/progress.json` and set your starting profile. The example is empty; it contains no real session history. Review `CLAUDE.md`, then use the commands under `.claude/commands/` in Claude Code: `/swahili`, `/ask`, and `/review-whatsapp`.

The grammar and vocabulary notes are included. Private learner records and the original class handout are excluded.

## Set up your own WhatsApp bot

Install Node.js, npm and `jq`, then:

```bash
cd mobile/whatsapp-bot
npm ci
cd ../..
bash mobile/build-prompt.sh
bash mobile/whatsapp-bot/setup.sh
```

The setup script creates a local `wrangler.toml` from the example and guides you through your own Cloudflare and WhatsApp credentials. It deploys a Worker, so review its configuration before running it. API usage may incur charges.

Customize the learner baseline in `mobile/build-prompt.sh` before generating the prompt. Local progress, deployment identifiers, credentials and the generated learner-specific prompt are ignored by Git. For `/review-whatsapp`, set `CHAT_MEMORY_NAMESPACE_ID` to your own namespace identifier.

See [deployment notes](mobile/whatsapp-bot/DEPLOY.md) for the integration layout. The bot was developed during January–May 2026; provider setup screens, model availability and pricing should be checked when creating a new deployment. This public release contains source and clean examples, without the original personal conversations or live service configuration.
