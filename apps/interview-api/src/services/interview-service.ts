import {
  DEFAULT_ROLE_ID,
  ROLE_PRESETS,
  ROLE_PRESET_MAP,
  SEEDED_QUESTIONS,
  loadGeneratedCorpus,
  retrieveEvidence
} from "@portfolio/interview-core";
import type { InterviewTurn, RetrievalMatch, RolePreset } from "@portfolio/interview-core";

import type { AppConfig } from "../config.js";

export interface CitationView {
  id: string;
  citationLabel: string;
  title: string;
  section: string;
  publicUrl: string;
  excerpt: string;
  sourceType: string;
  projectId?: string;
}

export interface ProjectUsage {
  id: string;
  title: string;
  why: string;
  publicUrl?: string;
}

export interface InterviewResponsePayload {
  mode: "mock" | "openai";
  role: RolePreset;
  answer: string;
  confidence: "high" | "medium" | "low";
  citations: CitationView[];
  projectsUsed: ProjectUsage[];
  followUps: string[];
  retrieval: {
    topK: number;
    results: Array<{
      id: string;
      score: number;
      reasons: string[];
      title: string;
      section: string;
      publicUrl: string;
    }>;
  };
}

export type InterviewStreamEvent =
  | {
      type: "meta";
      mode: "mock" | "openai";
      role: Pick<RolePreset, "id" | "label">;
      citations: CitationView[];
      projectsUsed: ProjectUsage[];
    }
  | {
      type: "token";
      text: string;
    }
  | {
      type: "done";
      payload: InterviewResponsePayload;
    }
  | {
      type: "error";
      message: string;
    };

export interface LlmAnswer {
  answer: string;
  confidence?: "high" | "medium" | "low";
}

export interface LlmGenerationInput {
  question: string;
  role: RolePreset;
  history: InterviewTurn[];
  evidence: RetrievalMatch[];
}

export interface LlmService {
  generate(input: LlmGenerationInput): Promise<LlmAnswer>;
  stream?(input: LlmGenerationInput, onToken: (token: string) => Promise<void> | void): Promise<LlmAnswer>;
}

function buildExcerpt(text: string): string {
  return text.length <= 220 ? text : `${text.slice(0, 217).trim()}...`;
}

function citationFromMatch(match: RetrievalMatch): CitationView {
  return {
    id: match.chunk.id,
    citationLabel: match.chunk.citationLabel,
    title: match.chunk.title,
    section: match.chunk.section,
    publicUrl: match.chunk.publicUrl,
    excerpt: buildExcerpt(match.chunk.text),
    sourceType: match.chunk.sourceType,
    projectId: match.chunk.projectId
  };
}

function inferProjectUsage(matches: RetrievalMatch[]): ProjectUsage[] {
  const ordered = new Map<string, ProjectUsage>();

  matches.forEach((match) => {
    if (match.chunk.sourceType !== "project" && match.chunk.sourceType !== "case-study") return;
    const key = match.chunk.projectId ?? match.chunk.sourceId;
    if (!ordered.has(key)) {
      ordered.set(key, {
        id: key,
        title: match.chunk.title,
        why: match.chunk.section,
        publicUrl: match.chunk.publicUrl
      });
    }
  });

  return Array.from(ordered.values()).slice(0, 3);
}

function distinctEvidence(matches: RetrievalMatch[], count: number): RetrievalMatch[] {
  const selected: RetrievalMatch[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const key = match.chunk.projectId ?? match.chunk.sourceId;
    if (seen.has(key)) continue;
    selected.push(match);
    seen.add(key);
    if (selected.length >= count) break;
  }

  return selected;
}

function preferredProjectEvidence(matches: RetrievalMatch[], count: number): RetrievalMatch[] {
  const projectMatches = matches.filter(
    (match) => match.chunk.sourceType === "project" || match.chunk.sourceType === "case-study"
  );
  const preferred = distinctEvidence(projectMatches, count);
  return preferred.length > 0 ? preferred : distinctEvidence(matches, count);
}

function defaultFollowUps(primaryProjectTitle?: string): string[] {
  if (!primaryProjectTitle) {
    return [
      "Go deeper on system design.",
      "Ask for a stronger example.",
      "Challenge the answer on tradeoffs."
    ];
  }

  return [
    `Go deeper on ${primaryProjectTitle}.`,
    "Ask about tradeoffs and failure modes.",
    "Compare this with another project."
  ];
}

function confidenceFromEvidence(evidence: RetrievalMatch[]): "high" | "medium" | "low" {
  if (evidence.length >= 3 && evidence[0] && evidence[0].score >= 24) return "high";
  if (evidence.length >= 2) return "medium";
  return "low";
}

function buildMockAnswerText(question: string, role: RolePreset, evidence: RetrievalMatch[]): string {
  const [primary, secondary] = preferredProjectEvidence(evidence, 2);
  const lowerQuestion = question.toLowerCase();

  const opening = primary
    ? `For ${role.label.toLowerCase()} interviews, I usually lead with ${primary.chunk.title}. ${primary.chunk.text}`
    : "I do not have enough published evidence loaded to answer that precisely.";

  const angle = /tradeoff|failure|challenge|constraint|why/i.test(lowerQuestion)
    ? "The main reason it matters is that it forced me to make concrete design tradeoffs instead of just building a demo."
    : /compare|range|different/i.test(lowerQuestion)
      ? "It is a good example because it shows one part of my profile clearly and lets me contrast it with other work."
      : "It is a strong fit because it shows how I turn technical work into something concrete and usable.";

  const support = secondary
    ? `A second supporting example is ${secondary.chunk.title}, which helps show range beyond that first system.`
    : "";

  return [opening, angle, support].filter(Boolean).join(" ");
}

async function streamTextByWord(
  text: string,
  onToken: (token: string) => Promise<void> | void,
  delayMs = 10
): Promise<void> {
  const chunks = text.match(/\S+\s*/g) ?? [text];
  for (const chunk of chunks) {
    await onToken(chunk);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function buildResponseBase(config: AppConfig, role: RolePreset, evidence: RetrievalMatch[], topK: number) {
  const citations = preferredProjectEvidence(evidence, 3).map(citationFromMatch);
  const projectsUsed = inferProjectUsage(evidence);
  const primaryProject = projectsUsed[0]?.title;

  return {
    mode: config.useMockResponses ? ("mock" as const) : ("openai" as const),
    role,
    citations,
    projectsUsed,
    followUps: defaultFollowUps(primaryProject),
    retrieval: {
      topK,
      results: evidence.map((match) => ({
        id: match.chunk.id,
        score: match.score,
        reasons: match.reasons,
        title: match.chunk.title,
        section: match.chunk.section,
        publicUrl: match.chunk.publicUrl
      }))
    }
  };
}

export function createInterviewService(config: AppConfig, llmService: LlmService) {
  const corpus = loadGeneratedCorpus();

  function buildQuestionContext(params: {
    question: string;
    roleId?: string;
    history?: InterviewTurn[];
    topK?: number;
  }) {
    const role = ROLE_PRESET_MAP.get(params.roleId ?? "") ?? ROLE_PRESET_MAP.get(DEFAULT_ROLE_ID)!;
    const topK = params.topK ?? config.retrievalTopK;
    const evidence = retrieveEvidence(corpus, params.question, {
      roleId: role.id,
      topK
    });

    return {
      role,
      topK,
      evidence,
      history: params.history ?? []
    };
  }

  async function answerQuestion(params: {
    question: string;
    roleId?: string;
    history?: InterviewTurn[];
    topK?: number;
  }): Promise<InterviewResponsePayload> {
    const context = buildQuestionContext(params);
    const base = buildResponseBase(config, context.role, context.evidence, context.topK);
    const generation = config.useMockResponses
      ? {
          answer: buildMockAnswerText(params.question, context.role, context.evidence),
          confidence: confidenceFromEvidence(context.evidence)
        }
      : await llmService.generate({
          question: params.question,
          role: context.role,
          history: context.history,
          evidence: context.evidence
        });

    return {
      ...base,
      answer: generation.answer,
      confidence: generation.confidence ?? confidenceFromEvidence(context.evidence)
    };
  }

  async function streamQuestion(
    params: {
      question: string;
      roleId?: string;
      history?: InterviewTurn[];
      topK?: number;
    },
    emit: (event: InterviewStreamEvent) => Promise<void> | void
  ): Promise<InterviewResponsePayload> {
    const context = buildQuestionContext(params);
    const base = buildResponseBase(config, context.role, context.evidence, context.topK);

    await emit({
      type: "meta",
      mode: base.mode,
      role: {
        id: base.role.id,
        label: base.role.label
      },
      citations: base.citations,
      projectsUsed: base.projectsUsed
    });

    let generation: LlmAnswer;

    if (config.useMockResponses) {
      const answer = buildMockAnswerText(params.question, context.role, context.evidence);
      await streamTextByWord(answer, async (token) => emit({ type: "token", text: token }));
      generation = {
        answer,
        confidence: confidenceFromEvidence(context.evidence)
      };
    } else if (llmService.stream) {
      generation = await llmService.stream(
        {
          question: params.question,
          role: context.role,
          history: context.history,
          evidence: context.evidence
        },
        async (token) => emit({ type: "token", text: token })
      );
    } else {
      generation = await llmService.generate({
        question: params.question,
        role: context.role,
        history: context.history,
        evidence: context.evidence
      });
      await streamTextByWord(generation.answer, async (token) => emit({ type: "token", text: token }), 0);
    }

    const payload: InterviewResponsePayload = {
      ...base,
      answer: generation.answer,
      confidence: generation.confidence ?? confidenceFromEvidence(context.evidence)
    };

    await emit({
      type: "done",
      payload
    });

    return payload;
  }

  function getConfigPayload() {
    return {
      defaultRoleId: DEFAULT_ROLE_ID,
      roles: ROLE_PRESETS,
      seededQuestions: SEEDED_QUESTIONS,
      corpus: {
        generatedAt: corpus.generatedAt,
        chunkCount: corpus.chunkCount
      }
    };
  }

  function searchEvidence(query: string, roleId?: string, topK?: number) {
    return retrieveEvidence(corpus, query, {
      roleId,
      topK: topK ?? config.retrievalTopK
    }).map((match) => ({
      id: match.chunk.id,
      title: match.chunk.title,
      section: match.chunk.section,
      citationLabel: match.chunk.citationLabel,
      excerpt: buildExcerpt(match.chunk.text),
      publicUrl: match.chunk.publicUrl,
      score: match.score,
      reasons: match.reasons
    }));
  }

  return {
    answerQuestion,
    streamQuestion,
    getConfigPayload,
    searchEvidence
  };
}
