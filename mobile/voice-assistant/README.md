# Mwalimu

Mwalimu is the learner's installable, realtime Kenyan Swahili voice coach. It runs as a Home Screen app on iPhone and uses OpenAI's current Realtime speech-to-speech models over WebRTC.

## iPhone setup

The production app is hosted privately with Sites. Open the private pairing link in Safari, tap **Share**, then **Add to Home Screen**. The pairing code is stored on the phone and removed from the visible URL.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, add local values, then run `npm install` and `npm run dev`.

Keep `.dev.vars` private. The browser never receives the standard OpenAI API key.

## Model choices

- **Best voice:** `gpt-realtime-2.1` (default)
- **Fast + lower cost:** `gpt-realtime-2.1-mini`

Both are selected server-side from a fixed allowlist. The frontend cannot request an arbitrary model.

## Security

- The standard OpenAI API key is stored as an encrypted Cloudflare Worker secret.
- A separate high-entropy pairing code protects the session endpoint from public use.
- The iPhone receives only the pairing code, never the API key.
- Realtime sessions are created by the Worker through the unified WebRTC interface.
