import assert from "node:assert/strict";
import test from "node:test";

import { buildSessionConfig, normalizeMode, normalizeModel } from "../src/session.js";
import { handleRequest } from "../src/index.js";

test("builds a personalized current-model conversation session", () => {
  const session = buildSessionConfig({
    model: "gpt-realtime-2.1",
    mode: "conversation",
  });

  assert.equal(session.model, "gpt-realtime-2.1");
  assert.equal(session.audio.output.voice, "marin");
  assert.equal(session.audio.input.transcription.model, "gpt-transcribe");
  assert.equal(session.audio.input.turn_detection.type, "semantic_vad");
  assert.match(session.instructions, /the learner's personal realtime Swahili coach/);
  assert.match(session.instructions, /negative perfect -ja-/);
  assert.match(session.instructions, /Session mode: Conversation/);
});

test("allows only the two intended realtime models and three modes", () => {
  assert.equal(normalizeModel("gpt-realtime-2.1-mini"), "gpt-realtime-2.1-mini");
  assert.equal(normalizeModel("made-up-model"), "gpt-realtime-2.1");
  assert.equal(normalizeMode("lesson"), "lesson");
  assert.equal(normalizeMode("unsupported"), "conversation");
});

test("health endpoint does not expose secrets", async () => {
  const response = await handleRequest(
    new Request("https://example.com/api/health"),
    {
      OPENAI_API_KEY: "secret-key",
      ACCESS_CODE: "secret-code",
      DEFAULT_REALTIME_MODEL: "gpt-realtime-2.1",
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.configured, true);
  assert.equal(JSON.stringify(body).includes("secret"), false);
});

test("session endpoint rejects an invalid pairing code before calling OpenAI", async () => {
  let called = false;
  const response = await handleRequest(
    new Request("https://example.com/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        "X-Mwalimu-Code": "wrong",
      },
      body: "v=0",
    }),
    {
      OPENAI_API_KEY: "secret-key",
      ACCESS_CODE: "correct",
    },
    async () => {
      called = true;
      return new Response();
    },
  );

  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("session endpoint proxies a valid SDP offer with server-side configuration", async () => {
  let upstreamRequest;
  const response = await handleRequest(
    new Request("https://example.com/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        "X-Mwalimu-Code": "correct",
        "X-Mwalimu-Mode": "lesson",
        "X-Mwalimu-Model": "gpt-realtime-2.1-mini",
      },
      body: "v=0\r\no=test",
    }),
    {
      OPENAI_API_KEY: "secret-key",
      ACCESS_CODE: "correct",
      DEFAULT_REALTIME_MODEL: "gpt-realtime-2.1",
    },
    async (url, init) => {
      upstreamRequest = { url, init };
      return new Response("v=0\r\no=answer", {
        status: 201,
        headers: { "Content-Type": "application/sdp" },
      });
    },
  );

  assert.equal(response.status, 201);
  assert.equal(upstreamRequest.url, "https://api.openai.com/v1/realtime/calls");
  assert.equal(upstreamRequest.init.headers.Authorization, "Bearer secret-key");
  const session = JSON.parse(await upstreamRequest.init.body.get("session").text());
  assert.equal(session.model, "gpt-realtime-2.1-mini");
  assert.match(session.instructions, /Session mode: Guided lesson/);
});
