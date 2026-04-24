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

test("openai mode falls back to grounded answers when the provider fails", async () => {
  const failingLlm = {
    async generate() {
      throw new Error("provider unavailable");
    },
    async stream() {
      throw new Error("provider unavailable");
    }
  };
  const app = buildApp(
    {
      useMockResponses: false,
      openaiApiKey: "test-key",
      retrievalTopK: 5
    },
    failingLlm
  );

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
    answer: string;
    citations: Array<{ title: string }>;
  };

  assert.equal(json.mode, "openai");
  assert.ok(json.answer.includes("Tomorrow You"));
  assert.ok(json.citations.length >= 1);

  const streamResponse = await app.inject({
    method: "POST",
    url: "/v1/interview/stream",
    payload: {
      roleId: "ai-engineer",
      question: "Tell me about your strongest AI engineering project with voice and agent workflows."
    }
  });

  assert.equal(streamResponse.statusCode, 200);
  assert.match(streamResponse.body, /"type":"token"/);
  assert.match(streamResponse.body, /"type":"done"/);
  assert.match(streamResponse.body, /Tomorrow You/);
  assert.doesNotMatch(streamResponse.body, /"type":"error"/);

  await app.close();
});

test("response source chips only include sources named in the final answer", async () => {
  const answer =
    "One failure mode I had to design around in AI-lexandre was confident but poorly grounded output, so I made retrieval and citations explicit before answering.";
  const app = buildApp(
    {
      useMockResponses: false,
      openaiApiKey: "test-key",
      retrievalTopK: 6
    },
    {
      async generate() {
        return {
          answer,
          confidence: "high" as const
        };
      },
      async stream(_input, onToken) {
        await onToken(answer);
        return {
          answer,
          confidence: "high" as const
        };
      }
    }
  );

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "ai-engineer",
      question: "Pick one failure mode you actually had to design around. What did you change?"
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    projectsUsed: Array<{ title: string }>;
    citations: Array<{ title: string }>;
  };

  assert.deepEqual(
    json.projectsUsed.map((source) => source.title),
    ["AI-lexandre"]
  );
  assert.deepEqual(
    json.citations.map((citation) => citation.title),
    ["AI-lexandre"]
  );

  const streamResponse = await app.inject({
    method: "POST",
    url: "/v1/interview/stream",
    payload: {
      roleId: "ai-engineer",
      question: "Pick one failure mode you actually had to design around. What did you change?"
    }
  });

  assert.equal(streamResponse.statusCode, 200);
  const doneLine = streamResponse.body
    .split("\n")
    .find((line) => line.includes('"type":"done"'));
  assert.ok(doneLine);

  const doneEvent = JSON.parse(doneLine) as {
    payload: {
      projectsUsed: Array<{ title: string }>;
      citations: Array<{ title: string }>;
    };
  };

  assert.deepEqual(
    doneEvent.payload.projectsUsed.map((source) => source.title),
    ["AI-lexandre"]
  );
  assert.deepEqual(
    doneEvent.payload.citations.map((citation) => citation.title),
    ["AI-lexandre"]
  );

  await app.close();
});

test("mock answers use interviewer-oriented framing", async () => {
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
    answer: string;
  };

  assert.match(json.answer, /^The strongest technical example is Tomorrow You/);
  assert.match(json.answer, /In an interview, I would emphasize the decision path/);
  assert.doesNotMatch(json.answer, /Summary:|Tags:/);

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

test("medical field questions use direct healthcare evidence", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "ai-engineer",
      question: "Have you built projects in the medical field?"
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    answer: string;
    citations: Array<{ title: string; sourceType: string }>;
    projectsUsed: Array<{ title: string; sourceType: string }>;
    retrieval: { results: Array<{ title: string; reasons: string[] }> };
  };

  assert.doesNotMatch(json.answer, /Tomorrow You/);
  assert.match(json.answer, /CUIMC|Columbia University Irving Medical Center|Nantes University Hospital|healthcare/i);
  assert.ok(
    json.citations.some((citation) => /CUIMC|Appointment Scheduling|Nantes University Hospital/i.test(citation.title)),
    "Expected direct healthcare citation"
  );
  assert.ok(
    json.projectsUsed.some((source) => /CUIMC|Appointment Scheduling|Nantes University Hospital/i.test(source.title)),
    "Expected direct healthcare source chip"
  );
  assert.ok(
    json.retrieval.results.slice(0, 4).every((result) => result.reasons.includes("healthcare domain match")),
    "Expected healthcare evidence to outrank adjacent AI projects"
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
