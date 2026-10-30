import {
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  buildSessionConfig,
  normalizeMode,
  normalizeModel,
} from "./session.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers || {}) },
  });
}

function constantTimeEqual(left = "", right = "") {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] || 0) ^ (b[index] || 0);
  }

  return mismatch === 0;
}

async function safetyIdentifier(accessCode) {
  const bytes = new TextEncoder().encode(`mwalimu:${accessCode}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  return new Response(response.body, { status: response.status, headers });
}

async function createRealtimeSession(request, env, fetchImpl) {
  if (!env.OPENAI_API_KEY) {
    return json(
      { error: "The server is missing its OpenAI API key." },
      { status: 503 },
    );
  }

  if (!env.ACCESS_CODE) {
    return json(
      { error: "The server is missing its private access code." },
      { status: 503 },
    );
  }

  const suppliedCode = request.headers.get("X-Mwalimu-Code") || "";
  if (!constantTimeEqual(suppliedCode, env.ACCESS_CODE)) {
    return json({ error: "That pairing code is not valid." }, { status: 401 });
  }

  if (!request.headers.get("Content-Type")?.includes("application/sdp")) {
    return json({ error: "Expected a WebRTC session offer." }, { status: 415 });
  }

  const sdp = await request.text();
  if (!sdp || sdp.length > 100_000) {
    return json({ error: "The WebRTC session offer is invalid." }, { status: 400 });
  }

  const requestedModel = request.headers.get("X-Mwalimu-Model") || "";
  const fallbackModel = ALLOWED_MODELS.has(env.DEFAULT_REALTIME_MODEL)
    ? env.DEFAULT_REALTIME_MODEL
    : DEFAULT_MODEL;
  const model = normalizeModel(requestedModel, fallbackModel);
  const mode = normalizeMode(request.headers.get("X-Mwalimu-Mode") || "");
  const session = buildSessionConfig({ model, mode });

  const form = new FormData();
  form.set(
    "sdp",
    new Blob([sdp], { type: "application/sdp" }),
    "offer.sdp",
  );
  form.set(
    "session",
    new Blob([JSON.stringify(session)], { type: "application/json" }),
    "session.json",
  );

  const upstream = await fetchImpl("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "OpenAI-Safety-Identifier": await safetyIdentifier(env.ACCESS_CODE),
    },
    body: form,
  });

  if (!upstream.ok) {
    let detail = "OpenAI could not start the voice session.";
    try {
      const body = await upstream.json();
      detail = body?.error?.message || detail;
    } catch {
      // Keep a short, non-sensitive message when the upstream body is not JSON.
    }

    return json({ error: detail }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 201,
    headers: {
      "Content-Type": "application/sdp",
      "Cache-Control": "no-store",
    },
  });
}

export async function handleRequest(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return json({
      ok: true,
      configured: Boolean(env.OPENAI_API_KEY && env.ACCESS_CODE),
      defaultModel: env.DEFAULT_REALTIME_MODEL || DEFAULT_MODEL,
    });
  }

  if (url.pathname === "/api/session") {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, { status: 405 });
    }
    return createRealtimeSession(request, env, fetchImpl);
  }

  if (url.pathname.startsWith("/api/")) {
    return json({ error: "Not found." }, { status: 404 });
  }

  return withSecurityHeaders(await env.ASSETS.fetch(request));
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
