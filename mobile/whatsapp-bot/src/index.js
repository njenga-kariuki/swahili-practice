// Swahili Coach WhatsApp Bot (Cloudflare Worker)
//
// Architecture:
//   BASE_PROMPT              — static system prompt baked at deploy time (role, format, grammar, vocab)
//   chat:{phoneNumber}       — sliding conversation window (last 30 turns, 24hr TTL)
//   profile:{phoneNumber}    — persistent learner model (no TTL) — concepts, vocab, gaps, teaching log
//   log:{phoneNumber}:{ts}   — persistent exchange log (no TTL), batch-processed via /review-whatsapp
//
// Each response includes a hidden <<META:...>> line that the handler strips before
// delivery and uses to update the learner profile.

import BASE_PROMPT from './system-prompt.txt';

const HISTORY_CAP = 30;
const HISTORY_TTL = 86400; // 24 hours

export default {
  async fetch(request, env) {
    // Handle GET: WhatsApp webhook verification
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    // WhatsApp sends status updates (delivered, read) with no messages — acknowledge silently
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== 'text' || !message.text?.body) {
      return new Response('OK', { status: 200 });
    }

    const phoneNumber = message.from;
    const text = message.text.body.trim();
    const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;
    const allowedNumbers = (env.ALLOWED_PHONE_NUMBERS || '').split(',').map(s => s.trim());

    // Phone number guard — silent 200 for unauthorized users
    if (!allowedNumbers.includes(phoneNumber)) {
      return new Response('OK', { status: 200 });
    }

    // Help command
    if (text.toLowerCase() === 'help') {
      await sendWhatsApp(env, phoneNumberId, phoneNumber,
        'Habari! \n\n' +
        'Send me any Swahili question — translations, grammar breakdowns, Kenyan usage.\n\n' +
        'Examples:\n' +
        '• "How do I say excuse me?"\n' +
        '• "What does hatutakuja mean?"\n' +
        '• "Difference between -me- and -li-"\n' +
        '• "looking forward to it" (bare phrases auto-translate)\n' +
        '• "q where is the meeting" (q prefix = quick translate)\n\n' +
        'I remember our conversations throughout the day and learn what you need over time.');
      return new Response('OK', { status: 200 });
    }

    try {
      // Sanitize prior assistant turns against leaked markers before replaying to Claude.
      const historyRaw = await env.CHAT_MEMORY.get(`chat:${phoneNumber}`, 'json');
      let history = [];
      if (Array.isArray(historyRaw)) {
        history = historyRaw.map(turn => ({
          ...turn,
          assistant: turn.assistant ? stripMarkers(turn.assistant) : turn.assistant,
        }));
      } else if (historyRaw && historyRaw.user) {
        // Backward compat: old format was { user, assistant }
        history = [{
          ...historyRaw,
          assistant: historyRaw.assistant ? stripMarkers(historyRaw.assistant) : historyRaw.assistant,
        }];
      }

      // Read learner profile (persistent, no TTL)
      const profile = await env.CHAT_MEMORY.get(`profile:${phoneNumber}`, 'json');

      // Build messages from conversation history
      const messages = [];
      for (const turn of history) {
        messages.push({ role: 'user', content: turn.user });
        messages.push({ role: 'assistant', content: turn.assistant });
      }

      // Quick translate: `q ` prefix → explicit translation request
      let userText = text;
      if (/^q\s+/i.test(text)) {
        userText = `Translate this to Swahili: "${text.slice(2).trim()}"`;
      }

      messages.push({ role: 'user', content: userText });

      // Assemble system prompt: static base + dynamic learner model
      const systemPrompt = profile
        ? `${BASE_PROMPT}\n\n${formatLearnerModel(profile)}`
        : BASE_PROMPT;

      // Call Claude API
      const model = env.MODEL || 'claude-sonnet-4-6';
      const requestBody = {
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      };

      console.log(`Claude request: model=${model}, messages=${messages.length}, system_len=${systemPrompt.length}`);

      const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!apiResponse.ok) {
        const errBody = await apiResponse.text();
        console.error(`Claude API ${apiResponse.status}: ${errBody}`);

        let userMsg;
        if (apiResponse.status === 401) {
          userMsg = 'API key error — check ANTHROPIC_API_KEY secret.';
        } else if (apiResponse.status === 404) {
          userMsg = `Model not found: "${model}". Update MODEL in wrangler.toml and redeploy.`;
        } else if (apiResponse.status === 429) {
          userMsg = 'Rate limited — wait a moment and try again.';
        } else if (apiResponse.status === 529) {
          userMsg = 'Claude is overloaded — try again in a minute.';
        } else {
          userMsg = `Samahani — translation service error (${apiResponse.status}). Check worker logs: npx wrangler tail`;
        }
        await sendWhatsApp(env, phoneNumberId, phoneNumber, userMsg);
        return new Response('OK', { status: 200 });
      }

      const result = await apiResponse.json();
      const rawResponse = result.content?.[0]?.text;

      console.log(`Claude response: stop_reason=${result.stop_reason}, usage=${JSON.stringify(result.usage)}`);

      if (!rawResponse) {
        console.error('Empty response from Claude:', JSON.stringify(result));
        await sendWhatsApp(env, phoneNumberId, phoneNumber, 'Got an empty response — try rephrasing your question.');
        return new Response('OK', { status: 200 });
      }

      // Extract and strip META + COPY lines before delivery
      const afterMeta = extractMeta(rawResponse);
      const { cleanText, copy } = extractCopy(afterMeta.cleanText);
      const meta = afterMeta.meta;

      console.log(`extracted copy: ${copy ?? 'none'}`);

      // Format for WhatsApp
      const formatted = formatForWhatsApp(cleanText);

      await sendWhatsApp(env, phoneNumberId, phoneNumber, formatted);

      // Second message lets the learner long-press the bare phrase — WhatsApp can't select inside a message.
      if (copy) {
        const copySent = await sendWhatsApp(env, phoneNumberId, phoneNumber, copy);
        if (!copySent) {
          console.error('WhatsApp COPY send failed (main message succeeded)');
        }
      }

      // Update conversation history (sliding window, cap at HISTORY_CAP)
      const updatedHistory = [
        ...history,
        { user: text, assistant: cleanText, ts: new Date().toISOString() },
      ].slice(-HISTORY_CAP);

      await env.CHAT_MEMORY.put(
        `chat:${phoneNumber}`,
        JSON.stringify(updatedHistory),
        { expirationTtl: HISTORY_TTL }
      );

      // Update learner profile if META was extracted
      if (meta) {
        const updatedProfile = updateProfile(profile, meta, text);
        await env.CHAT_MEMORY.put(`profile:${phoneNumber}`, JSON.stringify(updatedProfile));
      }

      // Persistent exchange log for batch processing via /review-whatsapp
      await env.CHAT_MEMORY.put(`log:${phoneNumber}:${Date.now()}`, JSON.stringify({
        ts: new Date().toISOString(),
        user: text,
        assistant: cleanText,
        copy_phrase: copy || null,
        had_context: history.length > 0,
      }));
    } catch (err) {
      console.error('Worker error:', err.message, err.stack);
      await sendWhatsApp(env, phoneNumberId, phoneNumber, `Samahani — unexpected error: ${err.message}. Check worker logs: npx wrangler tail`);
    }

    return new Response('OK', { status: 200 });
  },
};

// --- META + COPY extraction ---
// Regexes are non-anchored: order of the two trailing markers is not load-bearing.

function extractMeta(responseText) {
  const metaRegex = /\n?<<META:([^\n]*?)>>\s*/;
  const match = responseText.match(metaRegex);

  if (!match) {
    // Strip any malformed <<META:... fragments (no closing >>) to be safe
    const cleaned = responseText.replace(/\n?<<META:.*$/s, '').trimEnd();
    return { cleanText: cleaned, meta: null };
  }

  const cleanText = responseText.replace(metaRegex, '').trimEnd();
  let meta = null;
  try {
    meta = JSON.parse(match[1]);
  } catch (e) {
    console.error('META parse error:', e.message, 'raw:', match[1]);
  }

  return { cleanText, meta };
}

function extractCopy(responseText) {
  const copyRegex = /\n?<<COPY:([^\n]*?)>>\s*/;
  const match = responseText.match(copyRegex);

  if (!match) {
    // Strip any malformed <<COPY:... fragments (no closing >>) to be safe
    const cleaned = responseText.replace(/\n?<<COPY:.*$/s, '').trimEnd();
    return { cleanText: cleaned, copy: null };
  }

  const cleanText = responseText.replace(copyRegex, '').trimEnd();
  const raw = match[1].trim();

  if (raw.length === 0) return { cleanText, copy: null };
  if (raw.length > 200) {
    console.error('COPY rejected: too long', raw.length);
    return { cleanText, copy: null };
  }
  if (raw.includes('<<') || raw.includes('>>')) {
    console.error('COPY rejected: contains marker chars', raw);
    return { cleanText, copy: null };
  }

  return { cleanText, copy: raw };
}

function stripMarkers(text) {
  return extractCopy(extractMeta(text).cleanText).cleanText;
}

// --- Learner profile management ---

function updateProfile(existing, meta, userMessage) {
  const today = new Date().toISOString().split('T')[0];
  const profile = existing || {
    last_updated: today,
    interaction_count: 0,
    recent_lookups: [],
    concepts_practiced: {},
    vocabulary_encountered: {},
    detected_gaps: [],
    teaching_log: [],
    family_context: { common_topics: [], recent_translations: [] },
  };

  profile.last_updated = today;
  profile.interaction_count = (profile.interaction_count || 0) + 1;

  // Append to recent_lookups (cap at 50, FIFO)
  profile.recent_lookups = [
    ...profile.recent_lookups,
    {
      q: userMessage.slice(0, 100),
      topics: meta.topics || [],
      date: today,
      understanding: meta.understanding || 'partial',
    },
  ].slice(-50);

  // Update concepts_practiced
  if (meta.topics) {
    for (const topic of meta.topics) {
      const entry = profile.concepts_practiced[topic];
      if (entry) {
        entry.encounters += 1;
        entry.last_seen = today;
        entry.confidence = meta.understanding || entry.confidence;
      } else {
        profile.concepts_practiced[topic] = {
          encounters: 1,
          last_seen: today,
          confidence: meta.understanding || 'partial',
        };
      }
    }
  }

  // Update vocabulary_encountered (cap at 150 entries)
  if (meta.new_vocab) {
    for (const word of meta.new_vocab) {
      const lw = word.toLowerCase();
      if (profile.vocabulary_encountered[lw]) {
        profile.vocabulary_encountered[lw].times_seen += 1;
        profile.vocabulary_encountered[lw].last_seen = today;
      } else {
        const entries = Object.entries(profile.vocabulary_encountered);
        if (entries.length >= 150) {
          const oldest = entries.sort((a, b) =>
            a[1].last_seen.localeCompare(b[1].last_seen)
          )[0];
          delete profile.vocabulary_encountered[oldest[0]];
        }
        profile.vocabulary_encountered[lw] = {
          times_seen: 1,
          last_seen: today,
          source: meta.type || 'general',
        };
      }
    }
  }

  // Update detected_gaps (cap at 30, deduplicate by concept)
  if (meta.gap) {
    const existingGap = profile.detected_gaps.find(g => g.concept === meta.gap);
    if (existingGap) {
      existingGap.evidence = `asked about ${meta.gap} ${
        (profile.concepts_practiced[meta.gap]?.encounters || 1)
      } times`;
    } else {
      if (profile.detected_gaps.length >= 30) {
        profile.detected_gaps.shift();
      }
      profile.detected_gaps.push({
        concept: meta.gap,
        evidence: `detected from question: "${userMessage.slice(0, 60)}"`,
        first_detected: today,
        status: 'active',
      });
    }
  }

  // Update teaching_log (cap at 40)
  if (meta.taught) {
    profile.teaching_log = [
      ...profile.teaching_log,
      {
        date: today,
        concept: meta.taught,
        context: userMessage.slice(0, 80),
        reinforce: true,
      },
    ].slice(-40);
  }

  // Update family_context for family messages
  if (meta.type === 'family_message') {
    profile.family_context = profile.family_context || {
      common_topics: [],
      recent_translations: [],
    };

    profile.family_context.recent_translations = [
      ...profile.family_context.recent_translations,
      {
        text: userMessage.slice(0, 120),
        concepts: meta.topics || [],
        date: today,
      },
    ].slice(-20);

    if (meta.topics) {
      for (const topic of meta.topics) {
        if (!profile.family_context.common_topics.includes(topic)) {
          profile.family_context.common_topics = [
            ...profile.family_context.common_topics, topic,
          ].slice(-15);
        }
      }
    }
  }

  return profile;
}

// --- Format learner model for system prompt injection ---

function formatLearnerModel(profile) {
  const lines = ['## Learner Model (live, auto-updated from interactions)\n'];

  lines.push('### Interaction History');
  lines.push(`- Total interactions: ${profile.interaction_count || 0}`);

  // Recent topics with frequency (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const recentLookups = (profile.recent_lookups || []).filter(l => l.date >= sevenDaysAgo);
  if (recentLookups.length > 0) {
    const topicCounts = {};
    for (const lookup of recentLookups) {
      for (const topic of (lookup.topics || [])) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }
    const sorted = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    if (sorted.length > 0) {
      lines.push(`- Recent topics (last 7 days): ${sorted.map(([t, c]) => `${t} (${c}x)`).join(', ')}`);
    }
  }

  // Confidence map
  const concepts = profile.concepts_practiced || {};
  const conceptEntries = Object.entries(concepts);
  if (conceptEntries.length > 0) {
    const solid = conceptEntries.filter(([, v]) => v.confidence === 'solid').map(([k]) => k);
    const growing = conceptEntries.filter(([, v]) => v.confidence === 'partial').map(([k]) => k);
    const shaky = conceptEntries.filter(([, v]) => v.confidence === 'confused').map(([k]) => k);

    lines.push('\n### Confidence Map');
    if (solid.length > 0) lines.push(`- Solid: ${solid.join(', ')}`);
    if (growing.length > 0) lines.push(`- Growing: ${growing.join(', ')}`);
    if (shaky.length > 0) lines.push(`- Shaky: ${shaky.join(', ')}`);
  }

  // Active gaps
  const activeGaps = (profile.detected_gaps || []).filter(g => g.status === 'active');
  if (activeGaps.length > 0) {
    lines.push('\n### Active Gaps');
    for (const gap of activeGaps.slice(-10)) {
      lines.push(`- ${gap.concept}: ${gap.evidence}`);
    }
  }

  // Recently taught
  const recentTeaching = (profile.teaching_log || []).slice(-8);
  if (recentTeaching.length > 0) {
    lines.push('\n### Recently Taught (reinforce when relevant)');
    for (const t of recentTeaching) {
      lines.push(`- ${t.concept} (${t.date})`);
    }
  }

  // Vocabulary encountered
  const vocab = Object.entries(profile.vocabulary_encountered || {});
  if (vocab.length > 0) {
    const recent = vocab
      .sort((a, b) => b[1].last_seen.localeCompare(a[1].last_seen))
      .slice(0, 20);
    const familyVocab = recent.filter(([, v]) => v.source === 'family_message').map(([k]) => k);
    const otherVocab = recent.filter(([, v]) => v.source !== 'family_message').map(([k]) => k);

    lines.push('\n### Vocabulary the learner Encounters');
    if (familyVocab.length > 0) lines.push(`- From family messages: ${familyVocab.join(', ')}`);
    if (otherVocab.length > 0) lines.push(`- From questions: ${otherVocab.join(', ')}`);
  }

  // Family context
  const family = profile.family_context || {};
  if (family.recent_translations?.length > 0) {
    lines.push('\n### Family Conversation Patterns');
    if (family.common_topics?.length > 0) {
      lines.push(`- Common topics: ${family.common_topics.join(', ')}`);
    }
    const recentFam = family.recent_translations.slice(-5);
    lines.push(`- Recent: ${recentFam.map(t => `"${t.text}" (${t.date})`).join(', ')}`);
  }

  // Usage instructions
  lines.push('\n### How to Use This');
  lines.push('- When the learner asks about something near a detected gap, explain more carefully with extra examples');
  lines.push('- Reference prior interactions naturally ("This connects to the kwa pattern you asked about")');
  lines.push('- Use vocabulary the learner has encountered before in your example sentences');
  lines.push('- Use family conversation scenarios when giving contextual examples');
  lines.push('- When the learner demonstrates solid understanding, be briefer and reference the pattern by name');

  return lines.join('\n');
}

// --- WhatsApp formatting ---

function formatForWhatsApp(text) {
  // Protect triple-backtick code blocks from other transformations
  const codeBlocks = [];
  let result = text.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push('```\n' + code.trim() + '\n```');
    return `__CODEBLOCK_${codeBlocks.length - 1}__`;
  });

  // Table separator rows (|---|---|) → remove
  result = result.replace(/^\|[-\s|:]+\|$/gm, '');
  // Table rows (| col | col |) → strip pipes, keep content
  result = result.replace(/^\|(.+)\|$/gm, (_, row) =>
    row.split('|').map(cell => cell.trim()).filter(Boolean).join('  —  ')
  );

  // Horizontal rules (--- or ***) → blank line
  result = result.replace(/^[-*]{3,}\s*$/gm, '');

  // Headings (### text or ## text) → WhatsApp bold
  result = result.replace(/^#{1,4}\s+(.+)$/gm, '*$1*');

  // Bold: **text** → *text* (WhatsApp bold is single asterisk)
  result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');
  // Italic: *text* → _text_ (after bold conversion to avoid conflict)
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '_$1_');

  // Restore code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    result = result.replace(`__CODEBLOCK_${i}__`, codeBlocks[i]);
  }

  // Collapse 3+ consecutive blank lines → 2
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

async function sendWhatsApp(env, phoneNumberId, to, text) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('WhatsApp API error:', res.status, err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('WhatsApp send error:', err);
    return false;
  }
}
