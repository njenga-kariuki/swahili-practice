// Swahili Coach Telegram Bot (Cloudflare Worker)
//
// Architecture:
//   BASE_PROMPT         — static system prompt baked at deploy time (role, format, grammar, vocab)
//   chat:{chatId}       — sliding conversation window (last 30 turns, 24hr TTL)
//   profile:{chatId}    — persistent learner model (no TTL) — concepts, vocab, gaps, teaching log
//   log:{chatId}:{ts}   — persistent exchange log (no TTL), batch-processed via /review-telegram
//
// Each response includes a hidden <<META:...>> line that the handler strips before
// delivery and uses to update the learner profile.

import BASE_PROMPT from './system-prompt.txt';

const HISTORY_CAP = 30;
const HISTORY_TTL = 86400; // 24 hours

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('OK', { status: 200 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    const message = update.message;
    if (!message?.text || !message?.chat?.id) {
      return new Response('OK', { status: 200 });
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim();
    const allowedIds = (env.ALLOWED_CHAT_IDS || '').split(',').map(s => s.trim());

    // Chat ID guard — silent 200 for unauthorized users
    if (!allowedIds.includes(chatId)) {
      return new Response('OK', { status: 200 });
    }

    // /start command
    if (text === '/start') {
      await sendTelegram(env, chatId,
        'Habari! 🇰🇪\n\n' +
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
      // Read conversation history (sliding window, 24hr TTL)
      const historyRaw = await env.CHAT_MEMORY.get(`chat:${chatId}`, 'json');
      let history = [];
      if (Array.isArray(historyRaw)) {
        history = historyRaw;
      } else if (historyRaw && historyRaw.user) {
        // Backward compat: old format was { user, assistant }
        history = [historyRaw];
      }

      // Read learner profile (persistent, no TTL)
      const profile = await env.CHAT_MEMORY.get(`profile:${chatId}`, 'json');

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
        await sendTelegram(env, chatId, userMsg);
        return new Response('OK', { status: 200 });
      }

      const result = await apiResponse.json();
      const rawResponse = result.content?.[0]?.text;

      console.log(`Claude response: stop_reason=${result.stop_reason}, usage=${JSON.stringify(result.usage)}`);

      if (!rawResponse) {
        console.error('Empty response from Claude:', JSON.stringify(result));
        await sendTelegram(env, chatId, 'Got an empty response — try rephrasing your question.');
        return new Response('OK', { status: 200 });
      }

      // Extract and strip META line before delivery
      const { cleanText, meta } = extractMeta(rawResponse);

      // Format for Telegram HTML
      const html = formatForTelegram(cleanText);

      // Send with HTML parse mode, fallback to plain text
      const sent = await sendTelegram(env, chatId, html, 'HTML');
      if (!sent) {
        await sendTelegram(env, chatId, cleanText);
      }

      // Update conversation history (sliding window, cap at HISTORY_CAP)
      const updatedHistory = [
        ...history,
        { user: text, assistant: cleanText, ts: new Date().toISOString() },
      ].slice(-HISTORY_CAP);

      await env.CHAT_MEMORY.put(
        `chat:${chatId}`,
        JSON.stringify(updatedHistory),
        { expirationTtl: HISTORY_TTL }
      );

      // Update learner profile if META was extracted
      if (meta) {
        const updatedProfile = updateProfile(profile, meta, text);
        await env.CHAT_MEMORY.put(`profile:${chatId}`, JSON.stringify(updatedProfile));
      }

      // Persistent exchange log for batch processing via /review-telegram
      await env.CHAT_MEMORY.put(`log:${chatId}:${Date.now()}`, JSON.stringify({
        ts: new Date().toISOString(),
        user: text,
        assistant: cleanText,
        had_context: history.length > 0,
      }));
    } catch (err) {
      console.error('Worker error:', err.message, err.stack);
      await sendTelegram(env, chatId, `Samahani — unexpected error: ${err.message}. Check worker logs: npx wrangler tail`);
    }

    return new Response('OK', { status: 200 });
  },
};

// --- META extraction ---

function extractMeta(responseText) {
  // Match <<META:{...}>> on its own line (typically the last line)
  const metaRegex = /\n?<<META:(.*?)>>\s*$/;
  const match = responseText.match(metaRegex);

  if (!match) {
    // Strip any partial/malformed META lines to be safe
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

    lines.push('\n### Vocabulary Jay Encounters');
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
  lines.push('- When Jay asks about something near a detected gap, explain more carefully with extra examples');
  lines.push('- Reference prior interactions naturally ("This connects to the kwa pattern you asked about")');
  lines.push('- Use vocabulary Jay has encountered before in your example sentences');
  lines.push('- Use family conversation scenarios when giving contextual examples');
  lines.push('- When Jay demonstrates solid understanding, be briefer and reference the pattern by name');

  return lines.join('\n');
}

// --- Telegram formatting ---

function formatForTelegram(text) {
  // Escape HTML entities first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Triple-backtick code blocks → <pre>
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
    `<pre>${code.trim()}</pre>`
  );

  // Table separator rows (|---|---|) → remove
  html = html.replace(/^\|[-\s|:]+\|$/gm, '');
  // Table rows (| col | col |) → strip pipes, keep content
  html = html.replace(/^\|(.+)\|$/gm, (_, row) =>
    row.split('|').map(cell => cell.trim()).filter(Boolean).join('  —  ')
  );

  // Horizontal rules (--- or ***) → blank line
  html = html.replace(/^[-*]{3,}\s*$/gm, '');

  // Headings (### text or ## text) → bold
  html = html.replace(/^#{1,4}\s+(.+)$/gm, '<b>$1</b>');

  // Bold: **text** → <b>text</b>
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  // Italic: *text* → <i>text</i> (after bold to avoid conflicts)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>');
  // Inline code: `text` → <code>text</code>
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Collapse 3+ consecutive blank lines → 2
  html = html.replace(/\n{3,}/g, '\n\n');

  return html.trim();
}

async function sendTelegram(env, chatId, text, parseMode) {
  const body = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;

  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Telegram API error:', res.status, err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Telegram send error:', err);
    return false;
  }
}
