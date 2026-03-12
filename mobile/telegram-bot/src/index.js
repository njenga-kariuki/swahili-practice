// Swahili Q&A Telegram Bot (Cloudflare Worker)
//
// Architecture note — PROGRESS ISOLATION:
// This bot is a lookup tool with zero access to the local filesystem and NEVER
// writes to progress.json. The system prompt is a static snapshot baked in at
// deploy time via build-prompt.sh.
//
// KV usage (both under CHAT_MEMORY namespace):
//   chat:{chatId}  — ephemeral 1-turn context (30-min TTL)
//   log:{chatId}:{ts} — persistent exchange log (no TTL), batch-processed
//                        into progress.json via /review-telegram command
//
// Jay's structured progress tracking happens exclusively through /swahili, /ask,
// and /review-telegram commands in Claude Code.
// This bot is the "field reference" — quick lookups while out in Nairobi.

import SYSTEM_PROMPT from './system-prompt.txt';

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
        'Quick follow-ups work too (just reply within 30 min).');
      return new Response('OK', { status: 200 });
    }

    try {
      // Read previous exchange from KV (1-turn memory, 30-min TTL)
      const prevExchange = await env.CHAT_MEMORY.get(`chat:${chatId}`, 'json');
      const messages = [];

      if (prevExchange) {
        messages.push({ role: 'user', content: prevExchange.user });
        messages.push({ role: 'assistant', content: prevExchange.assistant });
      }

      // Quick translate: `q ` prefix → explicit translation request
      let userText = text;
      if (/^q\s+/i.test(text)) {
        userText = `Translate this to Swahili: "${text.slice(2).trim()}"`;
      }

      messages.push({ role: 'user', content: userText });

      // Call Claude API
      const model = env.MODEL || 'claude-sonnet-4-6';
      const requestBody = {
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      };

      console.log(`Claude request: model=${model}, messages=${messages.length}, prompt_len=${SYSTEM_PROMPT.length}`);

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
        const errMsg = `Claude API ${apiResponse.status}: ${errBody}`;
        console.error(errMsg);

        // Surface actionable detail in Telegram for known error types
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
      const responseText = result.content?.[0]?.text;

      console.log(`Claude response: stop_reason=${result.stop_reason}, usage=${JSON.stringify(result.usage)}`);

      if (!responseText) {
        console.error('Empty response from Claude:', JSON.stringify(result));
        await sendTelegram(env, chatId, 'Got an empty response — try rephrasing your question.');
        return new Response('OK', { status: 200 });
      }

      // Format for Telegram HTML
      const html = formatForTelegram(responseText);

      // Send with HTML parse mode, fallback to plain text on error
      const sent = await sendTelegram(env, chatId, html, 'HTML');
      if (!sent) {
        await sendTelegram(env, chatId, responseText);
      }

      // Save exchange to KV (30-min TTL)
      await env.CHAT_MEMORY.put(
        `chat:${chatId}`,
        JSON.stringify({ user: text, assistant: responseText }),
        { expirationTtl: 1800 }
      );

      // Persistent exchange log (no TTL) for batch processing via /review-telegram
      const logKey = `log:${chatId}:${Date.now()}`;
      await env.CHAT_MEMORY.put(logKey, JSON.stringify({
        ts: new Date().toISOString(),
        user: text,
        assistant: responseText,
        had_context: !!prevExchange,
      }));
    } catch (err) {
      console.error('Worker error:', err.message, err.stack);
      await sendTelegram(env, chatId, `Samahani — unexpected error: ${err.message}. Check worker logs: npx wrangler tail`);
    }

    return new Response('OK', { status: 200 });
  },
};

function formatForTelegram(text) {
  // Escape HTML entities first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert markdown-style formatting to Telegram HTML
  // Bold: **text** → <b>text</b>
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  // Inline code: `text` → <code>text</code>
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  return html;
}

async function sendTelegram(env, chatId, text, parseMode) {
  const body = {
    chat_id: chatId,
    text,
  };
  if (parseMode) {
    body.parse_mode = parseMode;
  }

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
