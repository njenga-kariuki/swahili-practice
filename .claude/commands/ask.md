Answer a Swahili question with a self-contained mini lesson — using the exact same structure, rules, and learner calibration as the WhatsApp bot.

**Question**: $ARGUMENTS

---

## Instructions

1. **Read the bot's system prompt** at `mobile/whatsapp-bot/src/system-prompt.txt` and follow it as the primary source of truth. It defines the Output Format, Rules, Hard rule for translation answers, Auto-Detected Translation Requests, Known Trouble Spots, and current Learner State. The bot's prompt is auto-generated from `data/progress.json`, `data/grammar-reference.md`, and `data/vocabulary-bank.md` — so it already reflects the learner's current tier, weak areas, and recurring mistakes. Use all of it.

2. **Apply these terminal-context overrides** (and only these — everything else in the bot prompt applies as written):
   - **Do NOT emit `<<COPY:...>>` lines.** Those are WhatsApp transport (so the learner can long-press to copy on his phone). In Claude Code he can select text directly.
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

5. **Copy the canonical Swahili to the clipboard via `pbcopy`** — every time, when applicable. Mirror the bot's `<<COPY:...>>` decision rule, just executed as a `pbcopy` command instead of an emitted line:

   **Copy when** the answer's primary purpose is to deliver a Swahili phrase the learner would actually send/say to someone:
   - "How do you say X?" / "What's the Swahili for X?" / "Translate X to Swahili" → English → Swahili
   - Bare English phrase (e.g. "looking forward to it", multi-sentence drafts) → English → Swahili
   - `q ` prefix (explicit quick-translate)

   **Skip the copy when** there's no canonical Swahili phrase to paste:
   - Bare Swahili phrase or "what does X mean?" → Swahili → English
   - Grammar question, comparison, or explanation
   - Conversational practice replies
   - Anything where you'd have to guess what the learner wants to paste

   Format rules for what gets piped to `pbcopy`:
   - Bare Swahili text taken from the **Swahili:** field — no markdown, no asterisks, no underscores, no quotes, no labels, no emoji, no leading/trailing whitespace
   - Single line, no internal newlines
   - The canonical primary translation only (Kenyan casual default) — even if your explanation lists formal/alternate variants, only the one the learner should send goes to clipboard
   - Use `printf '%s' '...' | pbcopy` (not `echo`, which adds a trailing newline)
   - For single-quote safety, prefer double-quoted heredoc or escape carefully

   After copying, end with: `📋 Copied to clipboard — paste and send.` followed by `🏷️ Logged for reinforcement in a future lesson.`

   If you skipped the copy (grammar question, etc.), end with just `🏷️ Logged for reinforcement in a future lesson.`
