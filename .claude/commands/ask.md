Answer a Swahili question with a self-contained mini lesson — using the exact same structure, rules, and learner calibration as the WhatsApp bot.

**Question**: $ARGUMENTS

---

## Instructions

1. **Read the bot's system prompt** at `mobile/whatsapp-bot/src/system-prompt.txt` and follow it as the primary source of truth. It defines the Output Format, Rules, Hard rule for translation answers, Auto-Detected Translation Requests, Known Trouble Spots, and current Learner State. The bot's prompt is auto-generated from `data/progress.json`, `data/grammar-reference.md`, and `data/vocabulary-bank.md` — so it already reflects Jay's current tier, weak areas, and recurring mistakes. Use all of it.

2. **Apply these terminal-context overrides** (and only these — everything else in the bot prompt applies as written):
   - **Do NOT emit `<<COPY:...>>` lines.** Those are WhatsApp transport (so Jay can long-press to copy on his phone). In Claude Code he can select text directly.
   - **Do NOT emit `<<META:...>>` lines.** Those are bot-internal tracking. The skill does its own logging — see step 4.
   - **Standard markdown is fine.** The bot prompt restricts to WhatsApp formatting (single `*bold*`, `_italic_`, no tables/headings). In Claude Code, standard markdown renders properly — use `**bold**` for labels, tables and `###` headings if they aid clarity, etc. Keep it scannable.

3. **If progress data appears stale**, the bot's system prompt may not have been regenerated recently. If you notice tier/sessions in the prompt don't match the latest entries in `data/progress.json`, prefer the JSON and mention it briefly. (To regenerate: `bash mobile/build-prompt.sh`.)

4. **After displaying the answer**, append an entry to `data/progress.json` under the `ad_hoc_questions` array:

```json
{
  "date": "YYYY-MM-DD",
  "question": "[the user's original question]",
  "swahili": "[the primary Swahili translation/answer]",
  "answer_summary": "[1-2 sentence summary of the answer including key alternatives]",
  "related_concepts": ["concept_key_1", "concept_key_2"],
  "related_vocab": ["word1", "word2"],
  "reinforced": false,
  "reinforced_date": null
}
```

- `related_concepts`: keys matching `grammar_mastery` categories in progress.json (e.g., "present_na", "object_infixes", "possessives")
- `related_vocab`: individual Swahili words from the answer worth reinforcing later
- `reinforced` / `reinforced_date`: leave as `false` / `null` — flipped by `/swahili` sessions when practiced

End with a single line: `🏷️ Logged for reinforcement in a future lesson.`
