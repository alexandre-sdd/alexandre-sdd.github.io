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

export interface LlmStructuredAnswer {
  answer: string;
  citationIds: string[];
  projectIds: string[];
  followUps: string[];
  confidence: "high" | "medium" | "low";
}

export interface LlmGenerationInput {
  question: string;
  role: RolePreset;
  history: InterviewTurn[];
  evidence: RetrievalMatch[];
}

export interface LlmService {
  generate(input: LlmGenerationInput): Promise<LlmStructuredAnswer>;
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
        why: match.chunk.section
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

function defaultFollowUps(role: RolePreset): string[] {
  return [
    `Ask me for a deeper ${role.label.toLowerCase()} example.`,
    "Challenge the answer and ask for a more technical version.",
    "Ask me to compare this project with another one in the portfolio."
  ];
}

function buildMockAnswer(question: string, role: RolePreset, evidence: RetrievalMatch[]): LlmStructuredAnswer {
  const [primary, secondary] = preferredProjectEvidence(evidence, 2);
  const usage = inferProjectUsage(evidence);

  const opening = primary
    ? `For ${role.label.toLowerCase()} interviews, I would usually anchor this answer on ${primary.chunk.title}. ${primary.chunk.text}`
    : "I do not have enough evidence loaded to answer that confidently yet.";

  const supporting = secondary
    ? `A second useful piece of evidence is ${secondary.chunk.title}, which helps show range beyond the first example.`
    : "";

  const tradeoffHint = /tradeoff|why|decision|architecture|system/i.test(question)
    ? `What makes this relevant is the way it combines product judgment with technical tradeoffs, which is central to the role lens: ${role.recruiterLens}`
    : `What this demonstrates for the role is ${role.summary}`;

  return {
    answer: [opening, supporting, tradeoffHint].filter(Boolean).join(" "),
    citationIds: preferredProjectEvidence(evidence, 3).map((match) => match.chunk.id),
    projectIds: usage.map((project) => project.id),
    followUps: defaultFollowUps(role),
    confidence: evidence.length >= 3 ? "high" : evidence.length >= 2 ? "medium" : "low"
  };
}

export function createInterviewService(config: AppConfig, llmService: LlmService) {
  const corpus = loadGeneratedCorpus();

  async function answerQuestion(params: {
    question: string;
    roleId?: string;
    history?: InterviewTurn[];
    topK?: number;
  }): Promise<InterviewResponsePayload> {
    const role = ROLE_PRESET_MAP.get(params.roleId ?? "") ?? ROLE_PRESET_MAP.get(DEFAULT_ROLE_ID)!;
    const evidence = retrieveEvidence(corpus, params.question, {
      roleId: role.id,
      topK: params.topK ?? config.retrievalTopK
    });

    const generation = config.useMockResponses
      ? buildMockAnswer(params.question, role, evidence)
      : await llmService.generate({
          question: params.question,
          role,
          history: params.history ?? [],
          evidence
        });

    const citationsById = new Map(evidence.map((match) => [match.chunk.id, citationFromMatch(match)]));
    const citations = generation.citationIds
      .map((id) => citationsById.get(id))
      .filter((citation): citation is CitationView => Boolean(citation));
    const fallbackCitations = citations.length > 0 ? citations : evidence.slice(0, 3).map(citationFromMatch);

    const projectsUsed = generation.projectIds.length > 0
      ? generation.projectIds
          .map((projectId) => inferProjectUsage(evidence).find((project) => project.id === projectId))
          .filter((project): project is ProjectUsage => Boolean(project))
      : inferProjectUsage(evidence);

    return {
      mode: config.useMockResponses ? "mock" : "openai",
      role,
      answer: generation.answer,
      confidence: generation.confidence,
      citations: fallbackCitations,
      projectsUsed,
      followUps: generation.followUps.length > 0 ? generation.followUps : defaultFollowUps(role),
      retrieval: {
        topK: params.topK ?? config.retrievalTopK,
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
    getConfigPayload,
    searchEvidence
  };
}
