Answer a Swahili question with a self-contained mini lesson.

**Question**: $ARGUMENTS

---

## Instructions

1. Read `CLAUDE.md` for user context and preferences
2. Read `data/progress.json` for current tier, mastery levels, and known concepts
3. Read `data/grammar-reference.md` for grammar accuracy
4. Read `data/vocabulary-bank.md` for vocabulary accuracy

## Output Format

Provide a complete, non-interactive answer — no questions, no exercises, just a thorough context package.

```
📎 [English phrase/question restated]

**Swahili:** [Translation]

**Breakdown:**
- [morpheme-by-morpheme breakdown, e.g. ni-na-m-penda = I + present + him/her + love]
- [noun class, verb form, or pattern name identified]

**Grammar note:**
[1-3 sentences: which rule applies, why this form, any irregularities]
[If user already knows the underlying grammar (check mastery), reference it: "You already know -na- present tense — this uses the same pattern"]
[If user doesn't know the grammar yet, explain simply and note it's coming in lessons]

**In context:**
1. [Example sentence using it naturally] = [translation]
2. [Second example, different context] = [translation]

**Kenyan usage:** [How it's used in Kenya specifically — register, alternatives, when to use/avoid. Skip this section entirely if not relevant.]

**Related:** [1-2 related words/phrases they might also want]

🏷️ Logged for reinforcement in a future lesson.
```

## Answer Principles

- **Non-interactive**: No questions, no exercises — just a complete answer
- **Calibrated**: Check `progress.json` for current tier and mastery. If the question involves grammar they've mastered, reference it briefly ("You know this pattern"). If it's above their current tier, explain simply without full teach complexity.
- **Kenyan dialect preferred**: Use Kenyan Swahili forms — default to casual Nairobi conversational register
- **Casual but correct**: Natural conversational Swahili, not textbook formal. Lead with how people actually say it. If a formal version exists, note it briefly as background.
- **Ambiguity**: If the question has multiple interpretations, give the most common/useful one first, then note alternatives
- **Multiple translations**: If several valid translations exist, lead with the most natural Kenyan option
- **Reverse direction**: If the user asks "what does X mean?" (Swahili → English), flip the format — put the Swahili first, then break it down

## Logging

After displaying the answer, update `data/progress.json`:

Append an entry to the `ad_hoc_questions` array:

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

- `related_concepts`: Use keys matching `grammar_mastery` categories (e.g., "present_na", "object_infixes", "possessives")
- `related_vocab`: Individual words from the answer that should be reinforced
- `reinforced`: Starts `false` — flipped to `true` by `/swahili` sessions when practiced
- `reinforced_date`: Set by `/swahili` when reinforced
