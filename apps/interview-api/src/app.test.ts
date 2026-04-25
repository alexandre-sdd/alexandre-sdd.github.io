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

test("cors only allows configured origins", async () => {
  const app = buildApp({
    useMockResponses: true,
    corsOrigins: ["https://alexandre-sdd.github.io"]
  });

  const allowed = await app.inject({
    method: "GET",
    url: "/v1/health",
    headers: {
      origin: "https://alexandre-sdd.github.io"
    }
  });
  const blocked = await app.inject({
    method: "GET",
    url: "/v1/health",
    headers: {
      origin: "https://example.com"
    }
  });

  assert.equal(allowed.headers["access-control-allow-origin"], "https://alexandre-sdd.github.io");
  assert.equal(blocked.headers["access-control-allow-origin"], undefined);

  await app.close();
});

test("rate limit protects public endpoints", async () => {
  const app = buildApp({
    useMockResponses: true,
    rateLimitMax: 1,
    rateLimitTimeWindow: "1 minute"
  });

  const first = await app.inject({
    method: "GET",
    url: "/v1/health"
  });
  const second = await app.inject({
    method: "GET",
    url: "/v1/health"
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 429);
  assert.match(second.body, /Rate limit exceeded/);

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

test("failure-mode answers suggest non-repetitive follow-ups", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });

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
    followUps: string[];
  };

  assert.ok(json.followUps.includes("How did you validate the fix?"));
  assert.ok(!json.followUps.includes("What tradeoff mattered most?"));

  await app.close();
});

test("tradeoff follow-ups build on prior history", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "ai-engineer",
      question: "What tradeoff mattered most?",
      history: [
        {
          role: "user",
          content: "Pick one failure mode you actually had to design around. What did you change?"
        },
        {
          role: "assistant",
          content:
            "I designed around confident but poorly grounded output in AI-lexandre by adding role-aware retrieval and source-backed citations."
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    followUps: string[];
  };

  assert.deepEqual(json.followUps, [
    "How did that choice affect users?",
    "What signal told you it worked?",
    "What would you change next?"
  ]);

  await app.close();
});

test("mock follow-up answers avoid restarting the project summary", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "ai-engineer",
      question: "How did you validate the fix?",
      history: [
        {
          role: "user",
          content: "Pick one failure mode you actually had to design around. What did you change?"
        },
        {
          role: "assistant",
          content:
            "I designed around confident but poorly grounded output in AI-lexandre by adding role-aware retrieval and source-backed citations."
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    answer: string;
    followUps: string[];
  };

  assert.match(json.answer, /^Building on that example/);
  assert.doesNotMatch(json.answer, /^The clearest answer is/);
  assert.deepEqual(json.followUps, [
    "What evidence would you show?",
    "What would you harden next?",
    "How would you explain the impact?"
  ]);

  await app.close();
});

test("compact memory summary supports longer follow-up threads", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });

  const history = Array.from({ length: 8 }, (_, index) => ({
    role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content:
      index % 2 === 0
        ? `Earlier interviewer question ${index + 1}`
        : "I compared Tomorrow You first and Codebase Analyzer second as AI systems with different reliability lessons."
  }));

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "ai-engineer",
      question: "What did you learn from the second one?",
      conversationSummary: "Recent sources in order: 1. Tomorrow You; 2. Codebase Analyzer.",
      history
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    answer: string;
    retrieval: { results: Array<{ title: string; section: string }> };
  };

  assert.equal(json.retrieval.results[0]?.title, "Codebase Analyzer");
  assert.match(json.answer, /^Building on/);
  assert.doesNotMatch(json.answer, /^The clearest answer is/);

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
    json.retrieval.results.slice(0, 3).every((result) => result.reasons.includes("healthcare domain match")),
    "Expected healthcare evidence to outrank adjacent AI projects"
  );
  assert.ok(
    json.retrieval.results.slice(0, 3).some((result) => /Nantes University Hospital/i.test(result.title)),
    "Expected Nantes hospital evidence in the primary healthcare retrieval set"
  );

  await app.close();
});

test("quant fit questions lead with work evidence and use coursework as support", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "ai-engineer",
      question: "Would you be suited for a quants position?"
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    answer: string;
    citations: Array<{ title: string; sourceType: string }>;
    projectsUsed: Array<{ title: string; sourceType: string }>;
    retrieval: { results: Array<{ title: string; section: string; reasons: string[] }> };
  };

  assert.doesNotMatch(json.answer, /Codebase Analyzer/);
  assert.match(json.answer, /main evidence should be|experience in|project work/i);
  assert.match(json.answer, /coursework should sit behind|foundation/i);
  assert.ok(
    json.citations.some((citation) => citation.sourceType === "education"),
    "Expected education coursework citation as support"
  );
  assert.ok(
    json.citations.some((citation) => ["experience", "project", "case-study"].includes(citation.sourceType)),
    "Expected work evidence citation"
  );
  assert.doesNotMatch(json.retrieval.results[0]?.section ?? "", /^Coursework - /);

  await app.close();
});

test("broader fit questions map roles outside AI engineering", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 8
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "ai-engineer",
      question: "Based on my background, what roles could fit me outside AI engineer?"
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    answer: string;
    citations: Array<{ title: string; sourceType: string }>;
    retrieval: { results: Array<{ sourceType?: string; section: string; reasons: string[] }> };
  };

  assert.match(json.answer, /not frame myself only as an AI Engineer/i);
  assert.match(json.answer, /ML or data science|optimization and operations research|research engineering|product data science/i);
  assert.match(json.answer, /main evidence should be/i);
  assert.match(json.answer, /coursework should sit behind/i);
  assert.ok(
    json.citations.some((citation) => citation.sourceType === "education"),
    "Expected education evidence as supporting context"
  );
  assert.ok(
    json.citations.some((citation) => citation.sourceType === "experience"),
    "Expected experience evidence in broader role-fit citations"
  );
  assert.ok(
    json.citations.some((citation) => citation.sourceType === "project" || citation.sourceType === "case-study"),
    "Expected project or case-study evidence in broader role-fit citations"
  );
  assert.ok(
    json.retrieval.results.some((result) => result.reasons.includes("background education support")),
    "Expected broader fit retrieval to include education support"
  );

  await app.close();
});

test("education source follow-ups do not ask for exact role", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "optimization-analytics",
      question: "What coursework did you take in machine learning?"
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    followUps: string[];
    citations: Array<{ sourceType: string }>;
  };

  assert.ok(json.citations.some((citation) => citation.sourceType === "education"));
  assert.ok(json.followUps.every((followUp) => !/exact role/i.test(followUp)));
  assert.ok(json.followUps.includes("Which project applied that?"));

  await app.close();
});

test("CentraleSupelec class follow-ups use Centrale coursework instead of Nantes", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "optimization-analytics",
      question: "class at supelec?",
      history: [
        {
          role: "user",
          content: "But did you take any optimization class?"
        },
        {
          role: "assistant",
          content: "At Columbia, I took Optimization Models and Methods."
        }
      ],
      conversationSummary: "Recent sources in order: 1. MS in Business Analytics at Columbia University; 2. Data & Operations Consultant (Healthcare Planning & Forecasting) at Junior CentraleSupelec (JCS) – Nantes University Hospital."
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    answer: string;
    citations: Array<{ title: string; sourceType: string }>;
    projectsUsed: Array<{ title: string; sourceType: string }>;
  };

  assert.match(json.answer, /CentraleSupélec|Centrale/i);
  assert.match(json.answer, /Optimization|linear|nonlinear|dynamic/i);
  assert.ok(
    json.citations.some((citation) => citation.sourceType === "education" && /Centrale/i.test(citation.title)),
    "Expected Centrale education citation"
  );
  assert.ok(
    json.projectsUsed.every((source) => !/Nantes University Hospital/i.test(source.title)),
    "Expected class follow-up not to source Nantes hospital work"
  );

  await app.close();
});

test("other project follow-ups switch away from recent source", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "optimization-analytics",
      question: "any other project you can talk to me about",
      history: [
        {
          role: "user",
          content: "Can you talk about Nantes University Hospital?"
        },
        {
          role: "assistant",
          content:
            "I can talk about my Data & Operations Consultant work at Nantes University Hospital."
        }
      ],
      conversationSummary: "Recent sources in order: 1. Data & Operations Consultant (Healthcare Planning & Forecasting) at Junior CentraleSupelec (JCS) – Nantes University Hospital."
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    answer: string;
    citations: Array<{ title: string; sourceType: string }>;
  };

  assert.match(json.answer, /different project/i);
  assert.doesNotMatch(json.answer, /Nantes University Hospital/);
  assert.ok(
    json.citations.every((citation) => citation.sourceType === "project" || citation.sourceType === "case-study"),
    "Expected another-project answer to use project or case-study sources"
  );

  await app.close();
});

test("other project follow-ups keep the active technical lane", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "ai-engineer",
      question: "any other project you can talk to me about",
      history: [
        {
          role: "user",
          content: "Can you tell me about optimization?"
        },
        {
          role: "assistant",
          content:
            "For optimization, I would lead with Childcare Deserts NYC and compare it with DNA Plasmid Closure with Genetic Algorithms."
        },
        {
          role: "user",
          content: "But did you take any optimization class?"
        },
        {
          role: "assistant",
          content: "At Columbia, I took Optimization Models and Methods."
        },
        {
          role: "user",
          content: "class at supelec?"
        },
        {
          role: "assistant",
          content: "At CentraleSupélec, I took mathematical optimization."
        }
      ],
      conversationSummary:
        "Recent sources in order: 1. Diplome d'Ingenieur (MEng) in Mathematics and Data Science at Universite Paris-Saclay: CentraleSupélec. Earlier interviewer topics: I am looking for a junior quant, can you fit into my team?."
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    answer: string;
    citations: Array<{ title: string; sourceType: string }>;
  };
  const citationTitles = json.citations.map((citation) => citation.title).join(" | ");

  assert.match(json.answer, /junior quant/i);
  assert.match(citationTitles, /CUIMC Appointment Scheduling Research|Zeit|Forvia Multi-Sensor Localization Research/i);
  assert.doesNotMatch(json.answer, /Tomorrow You/);
  assert.doesNotMatch(json.answer, /Childcare Deserts NYC/);

  await app.close();
});

test("quant conversation keeps junior quant framing on follow-up", async () => {
  const app = buildApp({
    useMockResponses: true,
    retrievalTopK: 6
  });

  const response = await app.inject({
    method: "POST",
    url: "/v1/interview/respond",
    payload: {
      roleId: "ai-engineer",
      question: "Can you tell me about optimization?",
      history: [
        {
          role: "user",
          content: "I am looking for a junior quant, can you fit into my team?"
        },
        {
          role: "assistant",
          content:
            "I can fit a junior quant team where the role values applied modeling, optimization, and validation."
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);

  const json = response.json() as {
    answer: string;
  };

  assert.match(json.answer, /junior quant/i);
  assert.doesNotMatch(json.answer, /AI Engineer/);

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
