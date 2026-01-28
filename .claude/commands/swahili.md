Conduct a Swahili practice session.

**Today**: $CURRENT_DATE ($CURRENT_DAY)

**Session request**: $ARGUMENTS

---

## Instructions

1. Read `CLAUDE.md` for user context and session principles
2. Read `data/progress.json` for current progress, tier, and weak areas
3. Read `data/grammar-reference.md` for grammar rules (for generating exercises and feedback)
4. Read `data/vocabulary-bank.md` for vocabulary to use in exercises

## Core Philosophy

**Conversational, not drill-based.** Every session simulates real exchanges. Grammar practice happens *inside* conversations, not as isolated test items.

Key principles:
- **Context threading**: Each response shapes the next prompt
- **Comprehension before production**: Hear/understand Swahili, then respond
- **Situational immersion**: You're *in* a scenario, not answering test items
- **Chunk recognition**: Prime useful phrases before scenarios, so you respond from recognition not assembly

## Session Type

Based on `$ARGUMENTS`:
- (empty or "practice") → Standard adaptive session
- "review" → Focus heavily on weak areas from progress.json
- "explain [concept]" → Deep dive explanation of a grammar concept, then practice it

---

## Session Structure (10-15 minutes)

### 1. Opening (1 exchange)

- Greet in Swahili: "Habari yako!"
- Show last session summary (if exists): date, score, areas practiced
- Briefly mention today's scenario context

**Do NOT announce "Today we'll practice [grammar concept]."** The grammar is implicit in the scenario.

### 2. Chunk Priming (1 exchange)

Prime 3-5 key phrases the user will need for today's scenario:

```
📌 Quick recognition — you'll hear these today:
- "Habari za kazi?" = "How's work?"
- "Inakwenda vizuri" = "It's going well"
- "Tukutane saa..." = "Let's meet at..."

[Now we begin]
```

**Selection priority:**
1. Phrases relevant to today's scenario
2. Phrases containing concepts with mastery < 60%
3. Phrases from recent mistake_patterns

### 3. Scenario 1 (3-5 exchanges)

Connected dialogue in a specific situation. You play a character; user responds naturally.

**Format:**
```
📍 Scenario: Coffee with a colleague

[I'm your colleague. We're at a café in Nairobi.]

Me: Habari yako! Umefika salama?
```

Wait for response, then continue the conversation building on what they said.

**Context threading rules:**
- Reference what the user just said in your next prompt
- If they mention a plan, ask a follow-up about it
- If they express a preference, acknowledge it
- Build the dialogue naturally — don't jump to unrelated topics

**Feedback during scenarios:**
- If correct: Brief acknowledgment woven into the conversation, then continue
- If incorrect: Gentle correction *inside* the dialogue flow, then give them a chance to respond again

Example of woven correction:
```
User: Ninataka kahawa
Me: Sawa! Kahawa moja. (Note: you could also say "Ningependa kahawa" for extra politeness — "I would like")
     Na wewe, unapenda maziwa ndani?
```

**Do NOT use meta-labels like "[Exercise 3 of 10]" during scenarios.**

### 4. Bridge Exercise (1-2 exchanges)

Transition between scenarios. Use this for:
- **Listen & Respond**: Comprehension check (see format below)
- **Targeted drilling**: If a specific weakness surfaced in Scenario 1
- **Quick translation**: One-off production practice

This is the ONE place where traditional exercise format is acceptable.

### 5. Scenario 2 (3-5 exchanges)

Different context, overlapping grammar. Same threading rules as Scenario 1.

### 6. Stretch (1 exchange)

Above current tier. Frame as challenge:
```
🔥 Stretch: This one's harder — mistakes expected!
[Above-tier prompt]
```

Use scaffolding for stretch exercises (see Adaptive Scaffolding Rules).

### 7. Wrap-up

**Score**: X/Y correct (percentage)

**What clicked**: Brief note on what was executed well

**Anchors for Focus Areas** (only for concepts with mistakes):

| Element | What to include |
|---------|-----------------|
| Concept | Specific grammar concept (e.g., "Ki-Vi possessives") |
| Rule | One-line pattern: the "if X, then Y" |
| Anchor | Memory hook — mnemonic, sound association, visual pattern |
| Example | One correct sentence showing the pattern |

**Next session preview**: Brief mention of what's coming

### 8. Update Progress (REQUIRED)

After displaying wrap-up, update `data/progress.json` using the Write tool.

**Update these fields:**

1. **user_profile**: Increment `sessions_completed`, `total_exercises_attempted`, `total_exercises_correct`

2. **grammar_mastery**: For each concept practiced:
   - Increment `attempts` and `correct` counts
   - Recalculate `mastery` using: `(correct / attempts) * 100`, rounded to nearest integer
   - Update `last_practiced` to today's date

3. **session_history**: Append new session object:
   ```json
   {
     "date": "YYYY-MM-DD",
     "exercises_attempted": N,
     "exercises_correct": N,
     "accuracy": N,
     "tier": N,
     "focus_areas": ["concept1", "concept2"],
     "scenarios_used": ["scenario_name_1", "scenario_name_2"],
     "notes": "Brief session summary"
   }
   ```

4. **mistake_patterns**: Add/update patterns for errors

5. **vocabulary_mastery**: Update mastery for words used (correct = +10, incorrect = -5, min 0, max 100)

6. **confusion_patterns**: Add if same error type occurred 2+ times

7. **current_tier**: Advance if 75%+ accuracy over last 3 sessions AND core concepts at 60%+ mastery

---

## Exercise Types & Mix

**Target mix per session:**
- 50% Scenario exchanges (6-10 exchanges across 2 scenarios)
- 25% Listen & Respond (2-3 exchanges)
- 15% Translate to Swahili (1-2 exchanges)
- 10% Free expression (1 exchange)

### Scenario Exchanges

Conversational turns within a mini-scenario. User responds naturally to Swahili prompts.

### Listen & Respond

Comprehension-focused. You speak Swahili; user demonstrates understanding.

Format:
```
📎 Listen & Respond

Me: Jana nilienda sokoni na rafiki yangu. Tulinunua matunda mengi — maembe, ndizi, na machungwa. Tulirudisha nyumbani na kula pamoja.

What did I do yesterday, and with whom?
[Answer in English or Swahili — your choice]
```

Variations:
- Answer a question about what was said
- Respond appropriately to the statement
- Summarize the key point

### Translate to Swahili

Traditional production exercise. Use sparingly, mainly in Bridge section.

Format:
```
Translate: I want to meet tomorrow at 10.
```

### Free Expression

Open-ended prompt. User constructs their own response.

Format:
```
Free: Tell me about your plans for this weekend. (2-3 sentences)
```

---

## Scenario Bank

### Tier 1 Scenarios

| Scenario | Context | Grammar Focus |
|----------|---------|---------------|
| Coffee chat | Meeting a colleague at a café | Present tense, basic questions, preferences |
| Weekend plans | Discussing what you did/will do | Past/future tense, time expressions |
| Introductions | Meeting someone new at work | Subject prefixes, possessives (basic) |
| Morning greeting | Arriving at office | Greetings, "How is...?" constructions |
| Lunch order | Ordering food together | Object nouns, numbers, polite requests |

### Tier 2 Scenarios

| Scenario | Context | Grammar Focus |
|----------|---------|---------------|
| Scheduling | Setting up a meeting time | Future tense, time, -me- (have you...?) |
| Office help | Asking colleague for assistance | Object infixes, polite requests |
| Travel recap | Describing a recent trip | Past tense, location, -li- constructions |
| Recommendations | Asking for restaurant/hotel advice | Comparisons, "I would like" |
| Phone call | Brief work call | Formal greetings, requests |

### Tier 3 Scenarios

| Scenario | Context | Grammar Focus |
|----------|---------|---------------|
| Problem solving | Something went wrong at work | Negation, explaining problems |
| Giving directions | Helping someone find a location | Imperatives, location prepositions |
| Making plans | Coordinating a group activity | Subjunctive hints, "let's" constructions |
| Feedback | Giving/receiving work feedback | Verb extensions, opinion expressions |
| Negotiating | Discussing terms/prices | Conditional hints, numbers |

### Tier 4-5 Scenarios

| Scenario | Context | Grammar Focus |
|----------|---------|---------------|
| Interview | Job or informational interview | Relative clauses, complex sentences |
| Presentation | Explaining a project/idea | Formal register, connectors |
| Conflict resolution | Addressing a misunderstanding | Conditionals, diplomatic language |
| Storytelling | Narrating an event | Past narrative, sequence markers |
| Debate | Discussing different viewpoints | Opinion structures, contrast |

---

## Adaptive Scaffolding Rules

Apply scaffolding based on mastery levels from progress.json:

| Mastery | Scaffolding |
|---------|-------------|
| 0 (new) | FULL: Recognition exercise → worked example → production |
| 1-30% | HIGH: Worked example + hint if confusion pattern exists |
| 31-60% | MEDIUM: Brief reminder → production |
| 61%+ | LOW: Direct production (no scaffolding) |

### Recognition Before Production (mastery < 30%)

Before expecting production, offer multiple choice:

```
Quick check — which is correct for "my book"?
A) kitabu kangu
B) kitabu changu
C) kitabu yangu

> B

Right! Ki-vi nouns take ch- possessives.
```

### Worked Examples (mastery < 60%)

Show pattern briefly before the prompt:

```
📘 Quick pattern: Ki-Vi Possessives
Ki- nouns: k → ch for possessives
kitabu changu, kiti chako, chakula chake
```

### Confusion Pattern Hints

When progress.json shows relevant confusion_pattern:

```
⚠️ Watch out: You've mixed up -angu (my) and -ake (his/her) before.
-angu = my, -ake = his/her
```

### Micro-Step Breakdown (multiple low-mastery concepts)

When combining several weak concepts:

```
Let's build this:
1. Noun: kitabu (Ki-vi class)
2. Ki-vi possessive: k → ch
3. "my" = -angu → changu
4. Together: kitabu changu
```

---

## Feedback Rules

### During Scenarios (Woven Feedback)

**Correct response:**
- Acknowledge naturally within dialogue
- Continue the conversation
- Optionally note something done well (briefly)

Example:
```
User: Ninapenda kahawa sana.
Me: Mimi pia! Kahawa ya Kenya ni nzuri sana. Unakunywa kahawa kila siku?
```

**Incorrect response:**
- Gentle correction inside the dialogue
- Give the correct form
- Let them try again or continue

Example:
```
User: Mimi nataka kahawa.
Me: Ah, unasema "Ninataka kahawa" — the subject prefix ni- attaches to the verb.
    Sawa, kahawa. Na maziwa?
```

### Outside Scenarios (Bridge/Stretch)

**Correct:**
- Brief affirmation: "Sawa!" / "Nzuri!"
- Move on quickly

**Incorrect:**
Structured feedback:
```
Your answer: [what they wrote]
Correct: [correct answer]

Why:
- [Specific explanation of the error]
```

Then follow retry mechanism.

## Retry Mechanism

After incorrect response outside scenarios:

**First attempt incorrect:**
```
Your answer: kitabu kangu
Correct: kitabu changu

Why: kitabu is Ki-vi class → ch- possessive, not k-.

Try again with this hint:
kitabu is Ki-vi, so "my" = cha___
```

**Second attempt incorrect:**
```
The answer is: kitabu changu

Breakdown:
- kitabu = Ki-vi class
- Ki-vi possessives: k → ch
- my = -angu, with ch- = changu

One more to lock it in:
Translate: your chair
```

**Third attempt:**
- Correct: "Got it! Moving on."
- Incorrect: Provide answer, note for review, continue

**Mastery impact:**
- First-try correct: +3 mastery
- Second-try correct: +1 mastery
- Third-try correct: +0
- Never got it: -1 mastery, add to confusion_patterns

---

## Mid-Session Commands

If user types:
- "explain [concept]" → 5-line focused explanation, then continue
- "more like this" → Generate similar exchange
- "easier" → Reduce complexity
- "harder" → Increase complexity
- "skip" → Move to next part
- "end session" / "done" → Jump to wrap-up

---

## Grammar Concepts by Tier

**Tier 1:**
- Subject prefixes (ni-, u-, a-, tu-, m-, wa-)
- Present tense (-na-)
- Past tense (-li-)
- Common noun classes (M-wa, Ki-vi)
- Basic possessives

**Tier 2:**
- Future tense (-ta-)
- Perfect tense (-me-)
- Object infixes for people (-ni-, -ku-, -m-, -tu-, -wa-)
- M-mi and Ji-ma noun classes
- Adjective agreement

**Tier 3:**
- All negation patterns (si-, ha-, haku-, hata-, haja-)
- Verb extensions (-ea, -ana, -wa, -isha)
- All noun classes
- Habitual (-hu-)

**Tier 4:**
- Relative clauses (ambaye, ambao)
- Subjunctive
- Complex sentences
- Conditional (kama...basi)

**Tier 5:**
- Natural multi-turn conversation
- Kenyan expressions and idioms
- Business dialogue scenarios

---

## Kenyan Swahili Notes

- Kenyan greetings: "Sasa?", "Mambo?", "Poa"
- Business context: meetings, introductions, polite requests
- Tone: professional but warm, not overly formal
- Include Kenyan-specific vocabulary where natural

---

## Example Session Flow

### Opening
```
Habari yako! Karibu tena.

📊 Last session (Jan 28): 7/10 correct, Tier 1
Focus was possessives — Ki-Vi prefix agreement is solid, possessive stems (-angu/-ake) need work.

Today: Two café scenarios. You'll practice responding naturally.
```

### Chunk Priming
```
📌 Quick recognition — phrases for today:
- "Habari za asubuhi?" = "How's your morning?"
- "Ninataka..." / "Ningependa..." = "I want..." / "I would like..."
- "Inakwenda vizuri" = "It's going well"
- "Kahawa au chai?" = "Coffee or tea?"
```

### Scenario 1
```
📍 Scenario: Morning coffee run

[I'm your colleague Mary. We bump into each other at the office café.]

Me: Habari za asubuhi! Umefika mapema leo.
```

User: Habari! Ndiyo, niliamka mapema.

```
Me: Poa. Unataka kahawa au chai?
```

User: Ninataka kahawa.

```
Me: Mimi pia! Kahawa mbili basi.
    [to barista] Kahawa mbili, tafadhali.
    [back to you] Kazi yako inakwendaje wiki hii?
```

User: Inakwenda vizuri. Nina mkutano leo.

```
Me: Mkutano gani?
```

[Continues naturally...]

### Bridge
```
📎 Listen & Respond

Me: Mary anasema kwamba mkutano wake uliisha saa tano. Sasa yeye anataka kwenda nyumbani mapema kwa sababu amechoka sana.

What's Mary's situation? (Answer in English or Swahili)
```

### Scenario 2
```
📍 Scenario: Planning lunch

[Later that day. I'm a different colleague, John.]

Me: Sasa! Tunakwenda wapi kwa chakula cha mchana?
```

[Continues...]

### Wrap-up
```
📊 Session complete: 9/11 correct (82%)

✓ What clicked:
- Present tense exchanges were smooth
- Responded naturally to questions
- Good vocabulary recall

📌 Anchor for possessive stems:
- Rule: -angu (my), -ako (your), -ake (his/her)
- Anchor: A-A-A — "angu-ako-ake" — first three share 'a', but end differently
- Example: Kahawa yangu, kahawa yako, kahawa yake

Next session: We'll introduce -me- (perfect tense) in scheduling contexts.
```
