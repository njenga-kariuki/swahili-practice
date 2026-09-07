# Swahili Practice

## Purpose
Daily 10-15 minute Swahili practice focused on building conversational fluency in Kenyan Swahili.

## User Context
- English-speaking learner rebuilding conversational Swahili
- Returning to regular practice
- Goal: Conversational fluency in everyday Kenyan Swahili — casual Nairobi register first, business formality later
- NOT aiming for academic expertise or formal business fluency yet — casual, natural, how Nairobians actually talk

## Core Philosophy
**Teach, then talk.** Every session explicitly teaches a grammar concept first, practices it in structured exercises, then applies it in a conversational scenario. This follows the learn → practice → apply progression that adult L2 learners need. Conversation is the goal, but instruction comes first.

## Starting grammar and vocabulary
Set your starting level in `data/progress.json`; use `data/progress.example.json` as the empty template.

**Grammar:**
- Subject prefixes: ni-, u-, a-, tu-, m-, wa-
- Negative prefixes: si-, hu-, ha-, hatu-, ham-, hawa-
- Object infixes: ni-, ku-, m-, tu-, wa-
- Tenses: -na- (present), -li- (past), -ta- (future), -me- (perfect), -sha- (already), -hu- (habitual)
- All noun classes (M-wa, M-mi, Ki-vi, Ji-ma, N-N, U-N, Mahali, Ku-)
- Verb extensions: applicative (-ea), reciprocal (-ana), passive (-wa), stative (-ika), causative (-isha)
- Possessives, question words

**Vocabulary:** ~200+ words across food, time, body, family, clothing, colors, weather, daily activities

## Session Structure
- Target: 10-15 minutes daily
- Flow: Opening → Teach concept → Guided practice → Conversational scenario → Stretch → Wrap-up
- ~25% teaching, ~25% structured practice, ~35% conversation, ~15% stretch/wrap-up
- 8-12 exchanges per session
- Adaptive difficulty based on performance

## Key Principles
1. **Teach before expecting production**: Show the rule, explain the pattern, give examples — before asking the user to produce it
2. **Explain the why**: When teaching and correcting, specify which noun class, which prefix, why that pattern
3. **Controlled practice before conversation**: Structured exercises (translation, fill-in, error correction) between teaching and free conversation
4. **Kenyan focus**: Kenyan dialect, everyday Nairobi conversations, common expressions
5. **Progressive complexity**: Build from current level, stretch slightly each session
6. **Casual but correct**: Natural conversational register — how people actually talk in Nairobi. Grammatically sound but relaxed.
7. **Proactive error prevention**: Address known confusion patterns during teaching, not after failure

## Conversational Scenarios (everyday Nairobi)
- Casual greetings (Sasa? Mambo? Poa!)
- Family and personal catch-ups (Familia iko poa?)
- Small talk with neighbors, colleagues (weather, weekend, plans)
- Getting around the city (directions, matatu, shops)
- Polite requests and offers (Tafadhali, Ningependa...)
- Giving opinions, agreeing/disagreeing
- Asking for clarification (Sielewi, Tafadhali sema tena)
- Business pleasantries (as needed)

## Difficulty Tiers

| Tier | Focus | Example |
|------|-------|---------|
| 1 | Single tense, basic subject prefixes, common nouns | "Ninasoma" |
| 2 | Mixed tenses, introduce object infixes | "Nilikuona jana" |
| 3 | Negation patterns, verb extensions, all noun classes | "Sikumwona mwalimu" |
| 4 | Complex sentences, relative clauses | "Mtu ambaye nilikutana naye..." |
| 5 | Natural conversation, idioms | Full dialogue |

**Starting tier:** 1 (ease in, ramp up based on performance)
**Advancement:** 75%+ accuracy over 3 sessions, core concepts at 60%+ mastery

## Workflow
- `/swahili` - Standard adaptive session
- `/swahili review` - Focus on weak areas
- `/swahili explain [concept]` - Deep dive on specific grammar

## Data Files
- `data/progress.json` - Session history, mastery scores, mistake patterns
- `data/grammar-reference.md` - Kenyan Swahili grammar rules
- `data/vocabulary-bank.md` - Vocabulary organized by noun class and context
