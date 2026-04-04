# Review WhatsApp Exchanges

Batch-process logged WhatsApp bot exchanges into `ad_hoc_questions` entries in `data/progress.json`.

## Steps

1. **Fetch log keys** from Cloudflare KV:

```bash
cd mobile/whatsapp-bot && npx wrangler kv key list --namespace-id=<your-kv-namespace-id> --prefix="log:"
```

If no keys are returned, tell Jay "No unprocessed WhatsApp exchanges found." and stop.

2. **Fetch each exchange** value:

For each key from step 1, run:
```bash
cd mobile/whatsapp-bot && npx wrangler kv key get --namespace-id=<your-kv-namespace-id> "<key>"
```

Parse the JSON: `{ ts, user, assistant, had_context }`

3. **Analyze and generate `ad_hoc_questions` entries**

For each exchange, create an entry matching the existing schema in `data/progress.json` under `ad_hoc_questions`:

```json
{
  "date": "<ts date portion, e.g. 2026-03-12>",
  "question": "<user's original message>",
  "answer_summary": "<1-2 sentence summary of the bot's response>",
  "concepts_touched": ["<grammar concepts or vocab categories involved>"],
  "source": "whatsapp",
  "reinforced_in_session": false
}
```

Guidelines:
- `answer_summary`: Distill the bot's response to the key takeaway (not the full response)
- `concepts_touched`: Tag with grammar categories matching `grammar_mastery` keys in progress.json (e.g. "subject_prefixes", "tenses/present_-na-", "noun_classes/m-wa") and/or vocabulary categories
- Skip entries that are clearly just `/start` commands or error messages
- Deduplicate: if the same question already exists in `ad_hoc_questions`, skip it

4. **Append to progress.json**

Read `data/progress.json`, append the new entries to the `ad_hoc_questions` array, and write back. Preserve all existing data.

5. **Delete processed keys** from KV:

For each processed key:
```bash
cd mobile/whatsapp-bot && npx wrangler kv key delete --namespace-id=<your-kv-namespace-id> "<key>" --force
```

6. **Report** a summary to Jay:
- How many exchanges were processed
- Key concepts touched (aggregated)
- Any exchanges that were skipped and why
