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

export interface SourceUsage {
  id: string;
  title: string;
  why: string;
  publicUrl?: string;
  sourceType: string;
}

export interface InterviewResponsePayload {
  mode: "mock" | "openai";
  role: RolePreset;
  answer: string;
  confidence: "high" | "medium" | "low";
  citations: CitationView[];
  projectsUsed: SourceUsage[];
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
      projectsUsed: SourceUsage[];
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

type InterviewIntent = "behavioral" | "comparison" | "inventory" | "role-fit" | "technical" | "general";

const PORTFOLIO_GROUPS = [
  {
    label: "AI product systems",
    projectIds: ["ai-lexandre", "tomorrow-you", "codebase-analyzer", "linkedin-note-copilot"]
  },
  {
    label: "applied ML and data quality",
    projectIds: ["chanel-europe-analytics-pipeline", "helpfullens"]
  },
  {
    label: "optimization and research",
    projectIds: [
      "zeit-project",
      "childcare-deserts-nyc",
      "appointment-scheduling-dynamics",
      "dna-plasmid-closure",
      "forvia-camera-radar-fusion-prototype"
    ]
  }
];

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

function inferSourceUsage(matches: RetrievalMatch[]): SourceUsage[] {
  const ordered = new Map<string, SourceUsage>();

  matches.forEach((match) => {
    const key = match.chunk.projectId ?? match.chunk.sourceId;
    if (!ordered.has(key)) {
      ordered.set(key, {
        id: key,
        title: match.chunk.title,
        why: match.chunk.section,
        publicUrl: match.chunk.publicUrl,
        sourceType: match.chunk.sourceType
      });
    }
  });

  return Array.from(ordered.values()).slice(0, 4);
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

function defaultFollowUps(primarySourceTitle?: string): string[] {
  if (!primarySourceTitle) {
    return [
      "What was your exact role?",
      "What tradeoff would you defend?",
      "What would you improve next?"
    ];
  }

  return [
    `What was your exact role in ${primarySourceTitle}?`,
    "What tradeoff mattered most?",
    "What would you improve next?"
  ];
}

function confidenceFromEvidence(evidence: RetrievalMatch[]): "high" | "medium" | "low" {
  if (evidence.length >= 3 && evidence[0] && evidence[0].score >= 24) return "high";
  if (evidence.length >= 2) return "medium";
  return "low";
}

function shouldBroadenRetrieval(question: string): boolean {
  const lowerQuestion = question.toLowerCase();
  const asksForList = /\b(all|every|list|overview|range)\b/.test(lowerQuestion);
  const asksForPortfolioSources = /\b(project|projects|experience|experiences|internship|internships|work)\b/.test(lowerQuestion);

  return asksForList && asksForPortfolioSources;
}

function inferInterviewIntent(question: string): InterviewIntent {
  const lowerQuestion = question.toLowerCase();

  if (shouldBroadenRetrieval(question)) return "inventory";
  if (/\b(compare|contrast|different|range|sides)\b/.test(lowerQuestion)) return "comparison";
  if (/\b(fit|hire|role|internship specifically|why you|strong candidate)\b/.test(lowerQuestion)) return "role-fit";
  if (/\b(time|stakeholder|ambigu|conflict|challenge|failure|mistake|pressure|requirements|worked with)\b/.test(lowerQuestion)) {
    return "behavioral";
  }
  if (
    /\b(architecture|system design|pipeline|model|evaluation|tradeoff|failure mode|scale|latency|constraint|solver|data quality|agent|agents|voice|workflow|workflows|api|llm)\b/.test(
      lowerQuestion
    )
  ) {
    return "technical";
  }

  return "general";
}

function cleanEvidenceText(text: string): string {
  return text
    .replace(/\bSummary:\s*/gi, "")
    .replace(/\bContext:\s*/gi, "Context: ")
    .replace(/\bProblem:\s*/gi, "Problem: ")
    .replace(/\bApproach:\s*/gi, "I approached it by ")
    .replace(/\bResult:\s*/gi, "The result was ")
    .replace(/\bResults:\s*/gi, "The result was ")
    .replace(/\bTags:\s*[^.]+\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateForInterview(text: string, maxLength = 360): string {
  const cleaned = cleanEvidenceText(text);
  if (cleaned.length <= maxLength) return cleaned;

  const slice = cleaned.slice(0, maxLength);
  const sentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "));
  const cut = sentenceEnd > 180 ? slice.slice(0, sentenceEnd + 1) : slice;
  return `${cut.trim()}...`;
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function buildInventoryAnswer(role: RolePreset, evidence: RetrievalMatch[]): string {
  const projectEvidence = distinctEvidence(evidence, evidence.length).filter(
    (match) => match.chunk.sourceType === "project" || match.chunk.sourceType === "case-study"
  );
  const byProjectId = new Map(projectEvidence.map((match) => [match.chunk.projectId ?? match.chunk.sourceId, match.chunk.title]));
  const grouped = PORTFOLIO_GROUPS.map((group) => {
    const titles = group.projectIds.map((id) => byProjectId.get(id)).filter((title): title is string => Boolean(title));
    return titles.length > 0 ? `${group.label}: ${formatList(titles)}` : "";
  }).filter(Boolean);

  if (grouped.length === 0) {
    return "I would frame the portfolio by the role requirements first, then use the strongest available evidence for the interviewer instead of listing unrelated work.";
  }

  return [
    `I would frame my portfolio in three interviewer-friendly buckets for a ${role.label} conversation.`,
    `${grouped.join("; ")}.`,
    "The throughline is that I can move from ambiguous technical problems to usable systems, while explaining the tradeoffs and evidence behind each project."
  ].join(" ");
}

function answerEvidence(matches: RetrievalMatch[]): RetrievalMatch[] {
  const concrete = matches.filter((match) => match.chunk.sourceType !== "overview" && match.chunk.sourceType !== "skills");
  return concrete.length > 0 ? concrete : matches;
}

function buildMockAnswerText(question: string, role: RolePreset, evidence: RetrievalMatch[]): string {
  const intent = inferInterviewIntent(question);
  if (intent === "inventory") return buildInventoryAnswer(role, evidence);

  const [primary, secondary] = distinctEvidence(answerEvidence(evidence), 2);

  if (!primary) return "I do not have enough published evidence loaded to answer that precisely.";

  const example = truncateForInterview(primary.chunk.text);
  const openingByIntent: Record<InterviewIntent, string> = {
    behavioral: `A good interview example is ${primary.chunk.title}, because it gives me a concrete situation, action, and outcome to discuss.`,
    comparison: `I would start with ${primary.chunk.title} and then compare it with another source of evidence if the interviewer wants range.`,
    general: `The clearest answer is ${primary.chunk.title}.`,
    inventory: "",
    "role-fit": `For a ${role.label} screen, I would anchor the answer in ${primary.chunk.title}.`,
    technical: `The strongest technical example is ${primary.chunk.title}, because it lets me talk about implementation choices and tradeoffs.`
  };
  const takeawayByIntent: Record<InterviewIntent, string> = {
    behavioral: "The interviewer-relevant takeaway is that I can operate with constraints, make the work usable, and explain what I learned without overselling it.",
    comparison: "The useful discussion is the contrast: what each example proves, where the constraints differed, and how I adapted my approach.",
    general: `What it shows for ${role.label} is that I can connect technical execution to a concrete work product.`,
    inventory: "",
    "role-fit": `That maps to ${role.label} because it shows the kind of evidence a hiring manager can probe: scope, decisions, tradeoffs, and results.`,
    technical: "In an interview, I would emphasize the decision path: the constraint, the system or model choice, the tradeoff, and how I made the output usable."
  };
  const support = secondary ? `If the interviewer wanted a second signal, I would connect it to ${secondary.chunk.title}.` : "";

  return [openingByIntent[intent], `The portfolio evidence is: ${example}`, takeawayByIntent[intent], support]
    .filter(Boolean)
    .join(" ");
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
  const citations = distinctEvidence(evidence, 4).map(citationFromMatch);
  const projectsUsed = inferSourceUsage(evidence);
  const primarySource = projectsUsed[0]?.title;

  return {
    mode: config.useMockResponses ? ("mock" as const) : ("openai" as const),
    role,
    citations,
    projectsUsed,
    followUps: defaultFollowUps(primarySource),
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
    const broadenRetrieval = !params.topK && shouldBroadenRetrieval(params.question);
    const topK =
      params.topK ??
      (broadenRetrieval ? Math.max(config.retrievalTopK, 14) : config.retrievalTopK);
    const evidence = retrieveEvidence(corpus, params.question, {
      roleId: role.id,
      topK,
      maxPerSource: broadenRetrieval ? 1 : undefined
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
