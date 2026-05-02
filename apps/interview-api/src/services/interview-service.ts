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
import { planInterviewTurn, topKForPlan, maxPerSourceForPlan } from "./intent-planner.js";
import type { PlannedInterviewTurn } from "./intent-planner.js";

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
  conversationSummary?: string;
  evidence: RetrievalMatch[];
}

export interface LlmService {
  generate(input: LlmGenerationInput): Promise<LlmAnswer>;
  stream?(input: LlmGenerationInput, onToken: (token: string) => Promise<void> | void): Promise<LlmAnswer>;
}

type InterviewIntent = "behavioral" | "comparison" | "inventory" | "role-fit" | "technical" | "general";

type InterviewFocus = "coursework" | "other-project" | "standard";

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

const SOURCE_TOKEN_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "based",
  "case",
  "data",
  "for",
  "from",
  "in",
  "of",
  "on",
  "project",
  "research",
  "study",
  "system",
  "systems",
  "the",
  "to",
  "using",
  "with"
]);

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

function normalizeReferenceText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sourceTokens(text: string): string[] {
  return normalizeReferenceText(text)
    .split(" ")
    .filter((token) => token.length > 0);
}

function meaningfulSourceTokens(text: string): string[] {
  return sourceTokens(text).filter((token) => token.length > 2 && !SOURCE_TOKEN_STOP_WORDS.has(token));
}

function sourceCandidateLabels(match: RetrievalMatch): string[] {
  const labels = [
    match.chunk.title,
    match.chunk.citationLabel.replace(/\s+-\s+.+$/, ""),
    match.chunk.projectId?.replace(/-/g, " "),
    match.chunk.sourceId.replace(/[:_-]+/g, " ")
  ].filter((label): label is string => Boolean(label));

  if (mentionsCentraleSupelec(labels.join(" "))) {
    labels.push("CentraleSupélec", "CentraleSupelec", "Centrale Supélec", "Centrale Supelec", "Supelec", "Supélec", "CS");
  }

  return labels;
}

function hasExactSourceLabel(answerText: string, match: RetrievalMatch): boolean {
  const normalizedAnswer = ` ${normalizeReferenceText(answerText)} `;

  return sourceCandidateLabels(match).some((label) => {
    const normalizedLabel = normalizeReferenceText(label);
    if (!normalizedLabel) return false;
    return normalizedAnswer.includes(` ${normalizedLabel} `);
  });
}

function hasSourceTokenOverlap(answerTokens: Set<string>, match: RetrievalMatch): boolean {
  const titleTokens = meaningfulSourceTokens(match.chunk.title);
  if (titleTokens.length === 1) return answerTokens.has(titleTokens[0]);
  if (titleTokens.length >= 2) {
    const matchedCount = titleTokens.filter((token) => answerTokens.has(token)).length;
    return matchedCount >= 2 && matchedCount / titleTokens.length >= 0.66;
  }

  return false;
}

function hasBrandLikeSourceReference(answerTokens: Set<string>, match: RetrievalMatch): boolean {
  if (!["case-study", "education", "experience"].includes(match.chunk.sourceType)) return false;

  return meaningfulSourceTokens(match.chunk.sourceId).some(
    (sourceToken) => sourceToken.length >= 5 && answerTokens.has(sourceToken)
  );
}

function sourceReferenceScore(answerText: string, match: RetrievalMatch): number {
  const answerTokens = new Set(sourceTokens(answerText));
  if (hasExactSourceLabel(answerText, match)) return 3;
  if (hasSourceTokenOverlap(answerTokens, match)) return 2;
  if (hasBrandLikeSourceReference(answerTokens, match)) return 1;
  return 0;
}

function sourceAppearsInAnswer(answerText: string, match: RetrievalMatch): boolean {
  return sourceReferenceScore(answerText, match) > 0;
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

function displayEvidenceForAnswer(answer: string, evidence: RetrievalMatch[]): RetrievalMatch[] {
  const concreteEvidence = answerEvidence(evidence);
  const referencedEvidence = concreteEvidence
    .map((match, index) => ({ match, index, score: sourceReferenceScore(answer, match) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.match);
  const displayEvidence = referencedEvidence.length > 0 ? referencedEvidence : concreteEvidence;
  return distinctEvidence(displayEvidence, referencedEvidence.length > 0 ? 4 : 1);
}

function defaultFollowUps(primarySource?: SourceUsage, question = "", history: InterviewTurn[] = []): string[] {
  const lowerQuestion = question.toLowerCase();
  const primarySourceTitle = primarySource?.title;
  const sourceSuffix = primarySourceTitle ? ` in ${primarySourceTitle}` : "";

  if (primarySource?.sourceType === "education") {
    return [
      "Which project applied that?",
      "How did that shape your modeling work?",
      "What evidence would you show?"
    ];
  }

  if (/\b(failure|fail|failed|hallucination|drift|grounded|grounding|unsupported|what did you change)\b/.test(lowerQuestion)) {
    return [
      `How did you detect that failure${sourceSuffix}?`,
      "How did you validate the fix?",
      "What would you harden next?"
    ];
  }

  if (history.length > 0 && /\b(tradeoff|trade-off|trade off)\b/.test(lowerQuestion)) {
    return [
      "How did that choice affect users?",
      "What signal told you it worked?",
      "What would you change next?"
    ];
  }

  if (history.length > 0) {
    return [
      "What evidence would you show?",
      "What would you harden next?",
      "How would you explain the impact?"
    ];
  }

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

function shouldDiversifyHealthcareEvidence(question: string): boolean {
  return /\b(care|clinical|clinic|cuimc|doctor|doctors|healthcare|health care|hospital|medical|medicine|nantes|patient|patients|physician|physicians|respiratory)\b/i.test(
    question
  );
}

function isQuantitativeFitQuestion(question: string): boolean {
  return /\b(classical quant|financial engineering|pricing|quant|quants|quantitative|risk|trading)\b/i.test(question);
}

function normalizeIntentText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isBackgroundBreadthQuestion(question: string): boolean {
  const lowerQuestion = normalizeIntentText(question);
  const asksForBreadth = /\b(beyond|broader|else|not just|other than|outside|range)\b/.test(lowerQuestion);
  const asksForFit = /\b(ai engineer|ai engineering|background|career|fit|position|role|roles|suited|suitable)\b/.test(lowerQuestion);

  return isQuantitativeFitQuestion(question) || (asksForBreadth && asksForFit);
}

function isDirectEducationQuestion(question: string): boolean {
  return /\b(class|classes|course|courses|coursework|course work|degree|education|school|university|college)\b/i.test(question);
}

function mentionsCentraleSupelec(question: string): boolean {
  const lowerQuestion = normalizeIntentText(question);
  return /\b(centrale|centrale supelec|centralesupelec|cs|supelec)\b/.test(lowerQuestion);
}

function isEducationFollowUp(question: string, history: InterviewTurn[] = []): boolean {
  if (isDirectEducationQuestion(question)) return true;

  const recentUserContext = history
    .filter((turn) => turn.role === "user")
    .slice(-2)
    .map((turn) => turn.content)
    .join(" ");

  return mentionsCentraleSupelec(question) && /\b(class|classes|course|courses|coursework|course work|optimization)\b/i.test(recentUserContext);
}

function isOtherProjectQuestion(question: string): boolean {
  return /\b(any\s+other|another|different|else|other)\b[^?!.]{0,60}\b(project|case study|work|example)\b/i.test(question);
}

function isOptimizationQuestion(question: string): boolean {
  return /\b(optimization|optimisation|solver|linear programming|integer programming|dynamic programming|nonlinear)\b/i.test(question);
}

function interviewRoleLabel(question: string, history: InterviewTurn[] = [], fallback = "the selected role", conversationSummary = ""): string {
  const text = normalizeIntentText([
    question,
    conversationSummary,
    ...history.filter((turn) => turn.role === "user").map((turn) => turn.content)
  ].join(" "));
  if (/\b(junior quant|quant team|quantitative finance|quant role|quant position|quants position)\b/.test(text)) return "junior quant";
  if (/\b(ml engineer|machine learning engineer)\b/.test(text)) return "ML Engineer";
  if (/\b(data scientist|data science)\b/.test(text)) return "Data Scientist";
  if (/\b(research engineer|research role)\b/.test(text)) return "Research Engineer";
  if (/\b(optimization|operations research|analytics)\b/.test(text)) return "Optimization / Analytics";
  return fallback;
}

function interviewFocus(question: string, history: InterviewTurn[] = []): InterviewFocus {
  if (isOtherProjectQuestion(question)) return "other-project";
  if (isEducationFollowUp(question, history)) return "coursework";
  return "standard";
}

function ordinalSourceFromSummary(question: string, conversationSummary = ""): string {
  const lowerQuestion = question.toLowerCase();
  const ordinal = /\b(second|2nd)\b/.test(lowerQuestion)
    ? 2
    : /\b(third|3rd)\b/.test(lowerQuestion)
      ? 3
      : /\b(first|1st)\b/.test(lowerQuestion)
        ? 1
        : 0;

  if (!ordinal || !conversationSummary) return "";

  const pattern = new RegExp(`${ordinal}\\.\\s*([^.;]+)`, "i");
  return conversationSummary.match(pattern)?.[1]?.trim() ?? "";
}

function recentUserQuestions(history: InterviewTurn[] = [], count = 3): string {
  return history
    .filter((turn) => turn.role === "user")
    .slice(-count)
    .map((turn) => turn.content)
    .join(" ");
}

function buildRetrievalQuery(question: string, history: InterviewTurn[] = [], conversationSummary = ""): string {
  if (history.length === 0 && !conversationSummary) return question;

  const focus = interviewFocus(question, history);
  const recentUserContext = recentUserQuestions(history, focus === "other-project" ? 6 : 3);

  if (focus === "coursework") {
    const centraleHint = mentionsCentraleSupelec(`${question} ${recentUserContext}`)
      ? "CentraleSupélec CentraleSupelec Centrale Supelec Supelec CS engineering school coursework classes"
      : "";
    return [question, recentUserContext, centraleHint, "coursework classes education"].filter(Boolean).join("\n");
  }

  if (focus === "other-project") {
    return [question, recentUserContext, "different portfolio project case study work sample"].filter(Boolean).join("\n");
  }

  const sourceHint = ordinalSourceFromSummary(question, conversationSummary);

  return [sourceHint, question, sourceHint ? conversationSummary : "", recentUserContext].filter(Boolean).join("\n");
}

function recentSourceTitles(conversationSummary = ""): string[] {
  const match = conversationSummary.match(/Recent sources in order:\s*(.+)$/i);
  if (!match) return [];
  const sourceList = match[1].split(/\s+Earlier interviewer topics:/i)[0];

  return sourceList
    .split(";")
    .map((item) =>
      item
        .replace(/^\s*\d+\.\s*/, "")
        .replace(/\.\s*$/, "")
        .trim()
    )
    .filter(Boolean);
}

function sourceMatchesRecentTitle(match: RetrievalMatch, recentTitles: string[]): boolean {
  const candidates = [
    match.chunk.title,
    match.chunk.projectId?.replace(/-/g, " "),
    match.chunk.sourceId.replace(/[:_-]+/g, " ")
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeReferenceText);
  const normalizedRecent = recentTitles.map(normalizeReferenceText);

  return normalizedRecent.some((recent) =>
    candidates.some((candidate) => candidate === recent || candidate.includes(recent) || recent.includes(candidate))
  );
}

function sourceMentionsCentraleSupelec(match: RetrievalMatch): boolean {
  const haystack = normalizeIntentText(`${match.chunk.title} ${match.chunk.sourceId} ${match.chunk.text} ${match.chunk.keywords.join(" ")}`);
  return /\b(centrale|centralesupelec|supelec|cs)\b/.test(haystack);
}

function sourceMentionedInRecentAssistant(match: RetrievalMatch, history: InterviewTurn[] = []): boolean {
  const recentAssistantText = normalizeReferenceText(
    history
      .filter((turn) => turn.role === "assistant")
      .slice(-4)
      .map((turn) => turn.content)
      .join(" ")
  );

  return sourceCandidateLabels(match).some((label) => {
    const normalizedLabel = normalizeReferenceText(label);
    return normalizedLabel.length >= 4 && recentAssistantText.includes(normalizedLabel);
  });
}

function topicMatchScore(match: RetrievalMatch, context: string): number {
  const normalizedContext = normalizeIntentText(context);
  const sourceText = normalizeIntentText(`${match.chunk.title} ${match.chunk.section} ${match.chunk.text} ${match.chunk.keywords.join(" ")}`);
  let score = 0;

  if (isOptimizationQuestion(normalizedContext) || isQuantitativeFitQuestion(normalizedContext)) {
    if (/\b(optimization|optimisation|operations|scheduling|simulation|solver|constraint|constraints|linear|integer|dynamic|genetic)\b/.test(sourceText)) {
      score += 28;
    }
    if (/\b(probability|statistical|statistics|forecasting|modeling|modelling|calibration)\b/.test(sourceText)) {
      score += 10;
    }
  }

  return score;
}

function effectiveRetrievalRoleId(roleId: string, question: string, history: InterviewTurn[] = [], conversationSummary = ""): string {
  const context = normalizeIntentText(`${question} ${conversationSummary} ${recentUserQuestions(history, 6)}`);

  if (/\b(junior quant|quant|optimization|optimisation|operations research|scheduling|simulation|solver)\b/.test(context)) {
    return "optimization-analytics";
  }

  return roleId;
}

function refineEvidenceForFocus(params: {
  evidence: RetrievalMatch[];
  question: string;
  history: InterviewTurn[];
  conversationSummary: string;
  topK: number;
}): RetrievalMatch[] {
  const focus = interviewFocus(params.question, params.history);

  if (focus === "standard") {
    if (isOptimizationQuestion(params.question)) {
      const [recentPrimaryTitle] = recentSourceTitles(params.conversationSummary);
      const freshEvidence = recentPrimaryTitle
        ? params.evidence.filter((match) => !sourceMatchesRecentTitle(match, [recentPrimaryTitle]))
        : params.evidence;
      const freshWorkEvidence = freshEvidence.filter(
        (match) => match.chunk.sourceType === "project" || match.chunk.sourceType === "case-study" || match.chunk.sourceType === "experience"
      );

      if (freshWorkEvidence.length > 0) {
        return [
          ...freshWorkEvidence,
          ...params.evidence.filter((match) => !freshWorkEvidence.includes(match))
        ].slice(0, params.topK);
      }
    }

    return params.evidence;
  }

  if (focus === "coursework") {
    const context = `${params.question} ${recentUserQuestions(params.history)}`;
    const education = params.evidence.filter((match) => match.chunk.sourceType === "education");
    const sortedEducation = mentionsCentraleSupelec(context)
      ? [...education].sort((a, b) => Number(sourceMentionsCentraleSupelec(b)) - Number(sourceMentionsCentraleSupelec(a)) || b.score - a.score)
      : education;
    const support = params.evidence.filter((match) => match.chunk.sourceType !== "education");
    return [...sortedEducation, ...support].slice(0, params.topK);
  }

  const recentTitles = recentSourceTitles(params.conversationSummary);
  const projectEvidence = params.evidence.filter(
    (match) => match.chunk.sourceType === "project" || match.chunk.sourceType === "case-study"
  );
  const context = `${params.question} ${recentUserQuestions(params.history, 6)} ${params.conversationSummary}`;
  const sortedProjectEvidence = [...projectEvidence].sort(
    (a, b) => topicMatchScore(b, context) - topicMatchScore(a, context) || b.score - a.score
  );
  const freshProjectEvidence = sortedProjectEvidence.filter(
    (match) => !sourceMatchesRecentTitle(match, recentTitles) && !sourceMentionedInRecentAssistant(match, params.history)
  );

  return (freshProjectEvidence.length > 0 ? freshProjectEvidence : sortedProjectEvidence).slice(0, params.topK);
}

function inferInterviewIntent(question: string): InterviewIntent {
  const lowerQuestion = question.toLowerCase();

  if (shouldBroadenRetrieval(question)) return "inventory";
  if (/\b(compare|contrast|different|range|sides)\b/.test(lowerQuestion)) return "comparison";
  if (/\b(fit|hire|position|role|suited|suitable|internship specifically|why you|strong candidate)\b/.test(lowerQuestion)) return "role-fit";
  if (isBackgroundBreadthQuestion(question)) return "role-fit";
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
    .replace(/\bCoursework category:\s*/gi, "")
    .replace(/\bCourses and applied work:\s*/gi, "")
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

function buildBackgroundFitAnswer(question: string, evidence: RetrievalMatch[]): string {
  const lowerQuestion = question.toLowerCase();
  const outsideAi = /\b(beyond|not just|other than|outside)\b/.test(lowerQuestion) && /\bai engineer|ai engineering\b/.test(lowerQuestion);
  const quantQuestion = isQuantitativeFitQuestion(question);
  const quantAdjacentWorkPattern =
    /\b(accounting|analytics|anomaly|chanel|commercial|cuimc|finance|forecasting|healthcare|hospital|optimization|operations|probabilistic|research|scheduling|sigma|simulation|statistical|tracking)\b/i;
  const aiProjectIds = new Set(["ai-lexandre", "tomorrow-you", "codebase-analyzer", "linkedin-note-copilot"]);

  const scoreBackgroundWork = (match: RetrievalMatch) => {
    const sourceTypeScore = match.chunk.sourceType === "experience" ? 42 : 34;
    const searchText = `${match.chunk.title} ${match.chunk.text} ${match.chunk.keywords.join(" ")}`;
    const quantBoost = quantQuestion && quantAdjacentWorkPattern.test(searchText) ? 20 : 0;
    const outsideAiPenalty = outsideAi && match.chunk.projectId && aiProjectIds.has(match.chunk.projectId) ? -18 : 0;

    return sourceTypeScore + quantBoost + outsideAiPenalty + Math.min(match.score / 20, 4);
  };

  const experienceEvidence = distinctEvidence(
    evidence
      .filter((match) => match.chunk.sourceType === "experience")
      .sort((a, b) => scoreBackgroundWork(b) - scoreBackgroundWork(a)),
    2
  );
  const projectEvidence = distinctEvidence(
    evidence
      .filter((match) => match.chunk.sourceType === "project" || match.chunk.sourceType === "case-study")
      .sort((a, b) => scoreBackgroundWork(b) - scoreBackgroundWork(a)),
    2
  );
  const educationEvidence = distinctEvidence(
    evidence.filter((match) => match.chunk.sourceType === "education"),
    2
  );
  const [primaryEducation] = educationEvidence;
  const workEvidence = [
    experienceEvidence[0],
    projectEvidence[0],
    experienceEvidence[1] ?? projectEvidence[1]
  ].filter((match): match is RetrievalMatch => Boolean(match));
  const [primaryWork, secondaryWork, tertiaryWork] = workEvidence;
  const educationExample = primaryEducation ? truncateForInterview(primaryEducation.chunk.text, 220) : "";
  const isQuantQuestion = isQuantitativeFitQuestion(question);

  if (isQuantQuestion && !primaryWork && !primaryEducation) {
    return "I would not position myself as a pure finance quant without evidence for market research or pricing work, but I do have a strong quantitative and technical foundation for data, AI, optimization, and systems roles.";
  }

  const workTitle = (match: RetrievalMatch) =>
    match.chunk.sourceType === "experience"
      ? `experience in ${match.chunk.title}`
      : `project work in ${match.chunk.title}`;
  const workSignals = [
    primaryWork ? `The main evidence should be ${workTitle(primaryWork)}.` : "",
    secondaryWork ? `I would also point to ${workTitle(secondaryWork)}.` : "",
    tertiaryWork ? `${tertiaryWork.chunk.title} adds a third signal.` : ""
  ].filter(Boolean);
  const educationSignal = primaryEducation
    ? `The coursework should sit behind that as foundation: ${primaryEducation.chunk.title} covered ${educationExample}`
    : "";

  const opening = isQuantQuestion
    ? "Quant was one example: I would be careful about pure trading or derivatives-pricing roles, but I should not frame myself as a light technical candidate."
    : "Yes. I should not frame myself only as an AI Engineer; the evidence supports a broader technical profile.";
  const roleRange =
    "The strongest adjacent lanes are ML or data science, optimization and operations research, research engineering, analytics or product data science, systems-oriented software work, and domain analytics in healthcare or finance operations.";

  return [opening, roleRange, workSignals.join(" "), educationSignal].filter(Boolean).join(" ");
}

function buildCourseworkAnswer(question: string, evidence: RetrievalMatch[], history: InterviewTurn[] = []): string {
  const educationEvidence = distinctEvidence(
    evidence.filter((match) => match.chunk.sourceType === "education"),
    2
  );
  const [primary, secondary] = educationEvidence;

  if (!primary) return "I do have relevant coursework, but I do not have enough education evidence loaded here to answer the exact class precisely.";

  const context = `${question} ${recentUserQuestions(history)}`;
  const schoolPrefix = sourceMentionsCentraleSupelec(primary)
    ? "At CentraleSupélec, yes"
    : primary.chunk.title.includes("Columbia")
      ? "At Columbia, yes"
      : "Yes";
  const evidenceText = truncateForInterview(primary.chunk.text, 340);
  const secondaryText = secondary ? ` I can also point to ${secondary.chunk.title} as supporting coursework.` : "";

  return [
    `${schoolPrefix}: the relevant coursework evidence is ${evidenceText}`,
    mentionsCentraleSupelec(context)
      ? "For a CentraleSupélec-specific answer, I would cite the engineering curriculum directly rather than substituting an internship example."
      : "I would treat the class as the foundation and then connect it to projects or experience only after answering the coursework question.",
    secondaryText
  ]
    .filter(Boolean)
    .join(" ");
}

function buildOtherProjectAnswer(evidence: RetrievalMatch[], roleLabel: string): string {
  const [primary, secondary] = distinctEvidence(
    evidence.filter((match) => match.chunk.sourceType === "project" || match.chunk.sourceType === "case-study"),
    2
  );

  if (!primary) return "Yes, but I would need a different project source loaded to answer that without repeating the prior example.";

  const example = truncateForInterview(primary.chunk.text, 330);
  const support = secondary ? `If you wanted a second option, I could also talk about ${secondary.chunk.title}.` : "";
  return [
    `Yes. A different project I would talk about is ${primary.chunk.title}.`,
    `The evidence is: ${example}`,
    `For a ${roleLabel} conversation, I would use it to show a different part of my profile instead of repeating the previous source.`,
    support
  ]
    .filter(Boolean)
    .join(" ");
}

function buildOptimizationAnswer(evidence: RetrievalMatch[], roleLabel: string): string {
  const workEvidence = distinctEvidence(
    evidence.filter((match) => match.chunk.sourceType === "project" || match.chunk.sourceType === "case-study" || match.chunk.sourceType === "experience"),
    2
  );
  const educationEvidence = distinctEvidence(
    evidence.filter((match) => match.chunk.sourceType === "education"),
    1
  );
  const [primaryWork, secondaryWork] = workEvidence;
  const [education] = educationEvidence;

  if (!primaryWork) return "For optimization, I would explain both the formulation and the operational constraints, then ground it in coursework if needed.";

  const educationSupport = education
    ? ` The coursework foundation behind that is ${education.chunk.title}, especially ${truncateForInterview(education.chunk.text, 220)}`
    : "";
  const secondary = secondaryWork ? ` I can also compare it with ${secondaryWork.chunk.title}.` : "";

  return [
    `For optimization, I would lead with ${primaryWork.chunk.title}.`,
    `The core idea is: ${truncateForInterview(primaryWork.chunk.text, 330)}`,
    `For a ${roleLabel} conversation, the point is that I understand optimization as constraint design, feasibility, and validation, not just solving an objective.${educationSupport}${secondary}`
  ].join(" ");
}

function answerEvidence(matches: RetrievalMatch[]): RetrievalMatch[] {
  const concrete = matches.filter((match) => match.chunk.sourceType !== "overview" && match.chunk.sourceType !== "skills");
  return concrete.length > 0 ? concrete : matches;
}

function buildMockAnswerText(
  question: string,
  role: RolePreset,
  evidence: RetrievalMatch[],
  history: InterviewTurn[] = [],
  conversationSummary = ""
): string {
  const intent = inferInterviewIntent(question);
  if (intent === "inventory") return buildInventoryAnswer(role, evidence);

  const [primary, secondary] = distinctEvidence(answerEvidence(evidence), 2);

  if (!primary) return "I do not have enough published evidence loaded to answer that precisely.";

  const lowerQuestion = question.toLowerCase();
  const example = truncateForInterview(primary.chunk.text);
  const isFollowUp = history.length > 0;
  const roleLabel = interviewRoleLabel(question, history, role.label, conversationSummary);

  if (!isFollowUp && isBackgroundBreadthQuestion(question)) {
    return buildBackgroundFitAnswer(question, evidence);
  }

  if (isEducationFollowUp(question, history)) {
    return buildCourseworkAnswer(question, evidence, history);
  }

  if (isOtherProjectQuestion(question)) {
    return buildOtherProjectAnswer(evidence, roleLabel);
  }

  if (isOptimizationQuestion(question)) {
    return buildOptimizationAnswer(evidence, roleLabel);
  }

  if (isFollowUp && /\b(tradeoff|trade-off|trade off)\b/.test(lowerQuestion)) {
    return [
      `Building on that example, the tradeoff I would focus on is control versus flexibility in ${primary.chunk.title}.`,
      `The evidence I can ground that in is: ${example}`,
      "The interviewer-relevant point is that I chose the more controlled path when the cost of an unsupported or hard-to-audit answer was higher than the cost of narrowing the system's behavior."
    ].join(" ");
  }

  if (isFollowUp && /\b(validate|validated|validation|test|tested|signal|worked|measure|measured)\b/.test(lowerQuestion)) {
    return [
      `Building on that example, I would be careful not to overclaim validation beyond the evidence I have for ${primary.chunk.title}.`,
      `The defensible evidence is: ${example}`,
      "In an interview, I would separate the shipped signal from the next hardening step: add targeted regression questions, check source-answer alignment, and track unsupported-answer cases."
    ].join(" ");
  }

  if (isFollowUp) {
    return [
      `Building on the prior answer, I would keep the focus on the new angle rather than restating ${primary.chunk.title}.`,
      `The relevant evidence is: ${example}`,
      `For ${roleLabel}, the useful takeaway is how that detail changes the decision, reliability, or user-facing outcome.`
    ].join(" ");
  }

  const openingByIntent: Record<InterviewIntent, string> = {
    behavioral: `A good interview example is ${primary.chunk.title}, because it gives me a concrete situation, action, and outcome to discuss.`,
    comparison: `I would start with ${primary.chunk.title} and then compare it with another source of evidence if the interviewer wants range.`,
    general: `The clearest answer is ${primary.chunk.title}.`,
    inventory: "",
    "role-fit": `For a ${roleLabel} screen, I would anchor the answer in ${primary.chunk.title}.`,
    technical: `The strongest technical example is ${primary.chunk.title}, because it lets me talk about implementation choices and tradeoffs.`
  };
  const takeawayByIntent: Record<InterviewIntent, string> = {
    behavioral: "The interviewer-relevant takeaway is that I can operate with constraints, make the work usable, and explain what I learned without overselling it.",
    comparison: "The useful discussion is the contrast: what each example proves, where the constraints differed, and how I adapted my approach.",
    general: `What it shows for ${roleLabel} is that I can connect technical execution to a concrete work product.`,
    inventory: "",
    "role-fit": `That maps to ${roleLabel} because it shows the kind of evidence a hiring manager can probe: scope, decisions, tradeoffs, and results.`,
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
  return {
    mode: config.useMockResponses ? ("mock" as const) : ("openai" as const),
    role,
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

function buildSourceDisplay(
  answer: string,
  evidence: RetrievalMatch[],
  question = "",
  history: InterviewTurn[] = [],
  plan?: PlannedInterviewTurn
) {
  let sourceEvidence: RetrievalMatch[];

  if (plan && plan.sourceTypes.length > 0) {
    // Evidence was already pre-filtered by sourceTypes at retrieval time.
    // No secondary filter needed — using the evidence as-is preserves the
    // planner's intent without double-restricting on display.
    sourceEvidence = evidence;
  } else {
    // Legacy path: derive display filter from interviewFocus (for callers
    // that don't yet pass a plan, or for general-intent questions).
    const focus = interviewFocus(question, history);
    sourceEvidence =
      focus === "coursework"
        ? evidence.filter((match) => match.chunk.sourceType === "education")
        : focus === "other-project"
          ? evidence.filter((match) => match.chunk.sourceType === "project" || match.chunk.sourceType === "case-study")
          : evidence;
  }

  const displayEvidence = displayEvidenceForAnswer(answer, sourceEvidence.length > 0 ? sourceEvidence : evidence);
  const projectsUsed = inferSourceUsage(displayEvidence);
  const primarySource = projectsUsed[0];

  return {
    citations: displayEvidence.map(citationFromMatch),
    projectsUsed,
    followUps: defaultFollowUps(primarySource, question, history)
  };
}

export function createInterviewService(config: AppConfig, llmService: LlmService) {
  const corpus = loadGeneratedCorpus();

  function buildQuestionContext(params: {
    question: string;
    roleId?: string;
    history?: InterviewTurn[];
    conversationSummary?: string;
    topK?: number;
  }) {
    const role = ROLE_PRESET_MAP.get(params.roleId ?? "") ?? ROLE_PRESET_MAP.get(DEFAULT_ROLE_ID)!;
    const history = params.history ?? [];
    const conversationSummary = params.conversationSummary?.trim() || "";

    // Plan the turn: classifies intent, extracts entities, derives source-type
    // filters and retrieval query. All downstream code reads the plan instead of
    // re-running intent detection ad-hoc.
    const plan = planInterviewTurn({
      question: params.question,
      history,
      compactMemory: conversationSummary,
      roleId: role.id
    });

    const topK = params.topK ?? topKForPlan(plan, config.retrievalTopK);
    const retrievalRoleId = effectiveRetrievalRoleId(role.id, params.question, history, conversationSummary);

    // Healthcare diversification still applies on top of planner source types:
    // a healthcare question can map to experience-specific but still benefit
    // from maxPerSource=1 to surface both CUIMC and Nantes.
    const forceMaxPerSource =
      maxPerSourceForPlan(plan) !== undefined ||
      shouldDiversifyHealthcareEvidence(params.question);

    const rawEvidence = retrieveEvidence(corpus, plan.retrievalQuery, {
      roleId: retrievalRoleId,
      topK,
      maxPerSource: forceMaxPerSource ? 1 : undefined,
      sourceTypes: plan.sourceTypes.length > 0 ? plan.sourceTypes : undefined
    });

    const evidence = refineEvidenceForFocus({
      evidence: rawEvidence,
      question: params.question,
      history,
      conversationSummary,
      topK
    });

    return {
      role,
      topK,
      evidence,
      history,
      conversationSummary,
      plan
    };
  }

  function fallbackGenerationFromInput(input: LlmGenerationInput): LlmAnswer {
    return {
      answer: buildMockAnswerText(input.question, input.role, input.evidence, input.history, input.conversationSummary),
      confidence: confidenceFromEvidence(input.evidence)
    };
  }

  async function generateAnswer(input: LlmGenerationInput): Promise<LlmAnswer> {
    try {
      return await llmService.generate(input);
    } catch {
      return fallbackGenerationFromInput(input);
    }
  }

  async function streamAnswer(
    input: LlmGenerationInput,
    onToken: (token: string) => Promise<void> | void
  ): Promise<LlmAnswer> {
    let emittedToken = false;
    const guardedOnToken = async (token: string) => {
      emittedToken = true;
      await onToken(token);
    };

    try {
      if (llmService.stream) {
        return await llmService.stream(input, guardedOnToken);
      }

      const generation = await llmService.generate(input);
      await streamTextByWord(generation.answer, guardedOnToken, 0);
      return generation;
    } catch (error) {
      if (emittedToken) throw error;

      const fallback = fallbackGenerationFromInput(input);
      await streamTextByWord(fallback.answer, guardedOnToken, 0);
      return fallback;
    }
  }

  async function answerQuestion(params: {
    question: string;
    roleId?: string;
    history?: InterviewTurn[];
    conversationSummary?: string;
    topK?: number;
  }): Promise<InterviewResponsePayload> {
    const context = buildQuestionContext(params);
    const base = buildResponseBase(config, context.role, context.evidence, context.topK);
    const generation = config.useMockResponses
      ? {
          answer: buildMockAnswerText(params.question, context.role, context.evidence, context.history, context.conversationSummary),
          confidence: confidenceFromEvidence(context.evidence)
        }
      : await generateAnswer({
          question: params.question,
          role: context.role,
          history: context.history,
          conversationSummary: context.conversationSummary,
          evidence: context.evidence
        });

    return {
      ...base,
      ...buildSourceDisplay(generation.answer, context.evidence, params.question, context.history, context.plan),
      answer: generation.answer,
      confidence: generation.confidence ?? confidenceFromEvidence(context.evidence)
    };
  }

  async function streamQuestion(
    params: {
      question: string;
      roleId?: string;
      history?: InterviewTurn[];
      conversationSummary?: string;
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
      citations: [],
      projectsUsed: []
    });

    let generation: LlmAnswer;

    if (config.useMockResponses) {
      const answer = buildMockAnswerText(params.question, context.role, context.evidence, context.history, context.conversationSummary);
      await streamTextByWord(answer, async (token) => emit({ type: "token", text: token }));
      generation = {
        answer,
        confidence: confidenceFromEvidence(context.evidence)
      };
    } else if (llmService.stream) {
      generation = await streamAnswer(
        {
          question: params.question,
          role: context.role,
          history: context.history,
          conversationSummary: context.conversationSummary,
          evidence: context.evidence
        },
        async (token) => emit({ type: "token", text: token })
      );
    } else {
      generation = await streamAnswer(
        {
          question: params.question,
          role: context.role,
          history: context.history,
          conversationSummary: context.conversationSummary,
          evidence: context.evidence
        },
        async (token) => emit({ type: "token", text: token })
      );
    }

    const payload: InterviewResponsePayload = {
      ...base,
      ...buildSourceDisplay(generation.answer, context.evidence, params.question, context.history, context.plan),
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
