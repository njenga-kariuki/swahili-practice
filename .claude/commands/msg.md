Draft a message the learner will send (WhatsApp/SMS) in casual Kenyan Swahili, then copy it to the clipboard.

**Request**: $ARGUMENTS

---

## Instructions

0. **Read what the learner gave you.** A request usually has one or more of these parts:
   - **Their message**: a text the learner received (family, friends), pasted in Swahili, Sheng, or mixed. The learner wants it explained and a reply drafted.
   - **Context**: who it is to, what is going on, tone.
   - **The learner's English**: what he wants to say. If there is a received message but no English, draft a natural reply that fits the context and say in one line what you assumed.
   - **A question**: "how do I say X", "what does Y mean", "is this too formal?". Answer it directly. Draft and copy a message only when the answer is a message to send.

   The learner may go back and forth (questions, tweaks, new context). Treat each turn on its own terms. Do not force a draft into a turn that only asks a question, and do not drop the received-message explanation from a turn that includes one.

1. **Draft the message** from the learner's English (or rough Swahili) content.
   - Register: casual Kenyan family/friend Swahili, the way Nairobians actually text. Mix in Sheng and English naturally (e.g. "so", "dinner", "soon", "kazi mingi", "alafu", "poa").
   - Keep the learner's meaning, order, and humour. Don't add facts, questions, or sign-offs he didn't give.
   - One paragraph unless the learner asks otherwise. No em dashes.
   - Use a time-appropriate greeting if the learner gives one (e.g. "Good morning" → "Habari za asubuhi").
   - Names: keep names and family titles (e.g. Shosh, Auntie) exactly as the learner writes them.
   - Times: write clock times as digits the way people text them (8:35pm, 9:30). Swahili time ("saa tatu na nusu") reads too formal for these messages.

2. **Copy the exact final message to the clipboard** with a quoted heredoc (safe for apostrophes, no trailing newline):

   ```bash
   printf '%s' "$(cat <<'EOF'
   <final message>
   EOF
   )" | pbcopy
   ```

3. **Output format.** Use the context to pick the order and depth. Default: reply first, since the learner usually wants to copy and send. Put the `Their message` explanation first when understanding it is the point (e.g. the learner asks what it means, or the reply depends on it). Scale the detail to the turn; a quick tweak needs less than a fresh exchange.
   - The final message as a bare paragraph: no heading, no quotes, no code block, no markdown. The learner may be on his phone via remote control, where `pbcopy` only reaches the Mac clipboard, so he long-presses this paragraph to copy.
   - A blank line, then `📋 Copied to clipboard.`
   - If the learner pasted a received message, a `**Their message**` section: a natural English translation first, then short bullets breaking down its phrases (same depth as below). Flag Sheng, slang, or anything ambiguous, and say what it likely means in context.
   - A `**Your reply**` section, always: short bullets that break down every phrase of the drafted message beyond basic greetings and words like "asante", "sana", "Dad". Explain each word in a phrase (prefixes, infixes, endings, noun-class agreement), not just the headline verb. No cap on bullet count.

   If the turn is only a question (no message to send), skip the clipboard and bare paragraph and just answer. Give any Swahili phrase as its own line so the learner can copy it.

4. **Revisions**: if the learner asks for a change, apply only that change, re-copy, and output in the same format. Re-explain only the phrases that changed; do not repeat the `Their message` section.

5. **Never send** the message anywhere. The learner sends it himself.
