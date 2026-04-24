import test from "node:test";
import assert from "node:assert/strict";
import { loadPortfolioContent } from "@portfolio/interview-core";

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

test("interview response can cite internship and experience evidence", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "ml-engineer",
      question: "Tell me about your CHANEL internship and finance analytics experience."
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    citations: Array<{ sourceType: string; title: string }>;
    projectsUsed: Array<{ sourceType: string; title: string }>;
    answer: string;
  };

  assert.match(json.answer, /CHANEL|Chanel/);
  assert.ok(
    json.citations.some((citation) => citation.sourceType === "experience" && /CHANEL/i.test(citation.title)),
    "Expected CHANEL internship experience in citations"
  );
  assert.ok(
    json.projectsUsed.some((source) => source.sourceType === "experience" && /CHANEL/i.test(source.title)),
    "Expected CHANEL internship experience in source chips"
  );

  await app.close();
});

test("broad project overview can retrieve every project and case study", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });
  const content = loadPortfolioContent();

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "ai-engineer",
      question: "Give me an overview of all my projects."
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    retrieval: {
      topK: number;
      results: Array<{ title: string }>;
    };
  };
  const retrievedTitles = new Set(json.retrieval.results.map((item) => item.title));

  assert.ok(json.retrieval.topK >= 14);
  [...content.projects, ...content.caseStudies].forEach((item) => {
    assert.ok(retrievedTitles.has(item.title), `Expected broad project overview to retrieve ${item.title}`);
  });

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
