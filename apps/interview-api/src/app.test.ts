import test from "node:test";
import assert from "node:assert/strict";

import { buildApp } from "./app.js";

test("health endpoint reports mock mode when configured", async () => {
  const app = buildApp({
    useMockResponses: true,
    openaiModel: "gpt-5.4-mini"
  });

  const response = await app.inject({
    method: "GET",
    url: "/v1/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    mode: "mock",
    model: "gpt-5.4-mini"
  });

  await app.close();
});

test("interview response returns grounded citations in mock mode", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 5
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "ai-engineer",
      question: "Tell me about your strongest AI engineering project with voice and agent workflows."
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    mode: string;
    citations: Array<{ title: string }>;
    answer: string;
    retrieval: { results: unknown[] };
  };

  assert.equal(json.mode, "mock");
  assert.ok(json.answer.includes("Tomorrow You"));
  assert.ok(json.citations.length >= 1);
  assert.ok(json.retrieval.results.length >= 1);

  await app.close();
});

test("stream endpoint emits token and done events in mock mode", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 5
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/stream",
    payload: {
      roleId: "ai-engineer",
      question: "Tell me about your strongest AI engineering project."
    }
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /application\/x-ndjson/);
  assert.match(response.body, /"type":"meta"/);
  assert.match(response.body, /"type":"token"/);
  assert.match(response.body, /"type":"done"/);

  await app.close();
});
