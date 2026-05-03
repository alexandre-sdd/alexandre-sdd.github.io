/**
 * retrieval-policy.ts
 *
 * Converts a `PlannedInterviewTurn` into concrete retrieval parameters
 * and a post-retrieval refinement function.
 *
 * ## Why this module exists
 *
 * Phase 1 scattered retrieval configuration across `buildQuestionContext`
 * (ad-hoc topK/maxPerSource calculations, a `shouldDiversifyHealthcareEvidence`
 * call) and `refineEvidenceForFocus` (inline focus-based sorting/exclusion).
 * Both used different representations of the same intent information.
 *
 * Phase 2 consolidates that into a single `buildRetrievalPolicy` call.
 * Callers get a `RetrievalPolicy` with:
 * - `retrievalOptions`: passed directly to `retrieveEvidence`
 * - `refine(matches)`: called on the scored results to apply ordering,
 *   section preferences, entity boosting, and source freshness rules
 *
 * ## Pipeline position
 *
 * planInterviewTurn()
 *   → buildRetrievalPolicy(plan)      ← this module
 *   → retrieveEvidence(query, options)
 *   → policy.refine(rawResults)
 *   → evidence used for answer + chips
 *
 * ## Testing
 *
 * All functions are pure (no I/O, no corpus access). Tests in
 * `retrieval-policy.test.ts` use mock `RetrievalMatch` arrays.
 */

import type { InterviewTurn, RetrievalMatch, RetrievalOptions, SourceType } from "@portfolio/interview-core";
import { ENTITY_ALIASES } from "@portfolio/interview-core";
import type { KnownEntity } from "@portfolio/interview-core";

import type { PlannedInterviewTurn } from "./intent-planner.js";
import { topKForPlan, maxPerSourceForPlan } from "./intent-planner.js";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface RetrievalPolicy {
  /** Passed to `retrieveEvidence` (roleId is set separately in the service). */
  retrievalOptions: Omit<RetrievalOptions, "roleId">;
  /**
   * Applied to the scored, diversified results returned by `retrieveEvidence`.
   * Returns a re-ordered or filtered slice of the same matches.
   */
  refine(matches: RetrievalMatch[]): RetrievalMatch[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the chunk's title, sourceId, or first 200 chars of text contain
 * any alias for the given entity.
 */
function chunkMatchesEntity(match: RetrievalMatch, entity: KnownEntity): boolean {
  const aliases = ENTITY_ALIASES[entity];
  const haystack = normalizeText(
    `${match.chunk.title} ${match.chunk.sourceId} ${match.chunk.text.slice(0, 200)}`
  );
  return aliases.some((alias) => {
    const norm = normalizeText(alias);
    const pattern = new RegExp(`(?<![a-z0-9])${norm.replace(/\s+/g, "[\\s\\-]+")}(?![a-z0-9])`);
    return pattern.test(haystack);
  });
}

function chunkMatchesAnyEntity(match: RetrievalMatch, entities: KnownEntity[]): boolean {
  return entities.some((e) => chunkMatchesEntity(match, e));
}

/**
 * True when the chunk's title or sourceId is a substring/superset of any
 * of the given recent source titles (normalised, order-independent).
 */
function titleMatchesRecent(match: RetrievalMatch, recentTitles: string[]): boolean {
  if (recentTitles.length === 0) return false;
  const candidates = [
    match.chunk.title,
    match.chunk.projectId?.replace(/-/g, " "),
    match.chunk.sourceId.replace(/[:_-]+/g, " ")
  ]
    .filter((v): v is string => Boolean(v))
    .map(normalizeText);
  const normalRecent = recentTitles.map(normalizeText);
  return normalRecent.some((recent) =>
    candidates.some((c) => c === recent || c.includes(recent) || recent.includes(c))
  );
}

/** True when the chunk's section starts with "Coursework -". */
function isCourseworkSection(match: RetrievalMatch): boolean {
  return match.chunk.section.toLowerCase().startsWith("coursework -");
}

/**
 * Exclude chunks whose title/sourceId appears in the last N assistant turns.
 *
 * Mirrors the V1 `sourceMentionedInRecentAssistant` check: when the assistant
 * already cited a project in a previous answer, the next "any other project"
 * question should skip it even if the compact memory hasn't been updated yet.
 *
 * Falls back to the unfiltered set if exclusion would leave it empty.
 */
function refineExcludeRecentAssistantMentions(
  matches: RetrievalMatch[],
  history: InterviewTurn[]
): RetrievalMatch[] {
  const recentAssistantText = normalizeText(
    history
      .filter((t) => t.role === "assistant")
      .slice(-4)
      .map((t) => t.content)
      .join(" ")
  );
  if (!recentAssistantText) return matches;

  const filtered = matches.filter((match) => {
    const candidateLabels = [
      match.chunk.title,
      match.chunk.projectId?.replace(/-/g, " "),
      match.chunk.sourceId.replace(/[:_-]+/g, " ")
    ]
      .filter((v): v is string => Boolean(v))
      .map(normalizeText);

    return !candidateLabels.some(
      (label) => label.length >= 4 && recentAssistantText.includes(label)
    );
  });

  return filtered.length > 0 ? filtered : matches;
}

/** Healthcare detection — same pattern as in intent-planner.ts. */
const HEALTHCARE_QUESTION_PATTERN =
  /\b(care|clinical|clinic|cuimc|doctor|doctors|healthcare|health care|hospital|medical|medicine|nantes|patient|patients|physician|physicians|respiratory)\b/i;

/** Optimization-domain detection for freshness-filter trigger in technical-depth. */
const OPTIMIZATION_QUESTION_PATTERN =
  /\b(optimization|optimisation|solver|linear programming|integer programming|dynamic programming|nonlinear|scheduling|operations research)\b/i;

// ─── Refinement functions ─────────────────────────────────────────────────────

/**
 * education-schools: base school records (degree, dates, location) rank before
 * coursework sections so "what schools did you go to" surfaces school names
 * rather than course titles.
 *
 * The retrieval scorer gives coursework sections +44 vs base sections +20 for
 * direct education queries. Without this reorder, coursework sections would
 * dominate even for school-list questions.
 */
export function refineEducationSchools(matches: RetrievalMatch[]): RetrievalMatch[] {
  const base = matches.filter((m) => !isCourseworkSection(m));
  const coursework = matches.filter((m) => isCourseworkSection(m));
  return [...base, ...coursework];
}

/**
 * education-coursework: coursework sections rank before base school summaries.
 * When a specific school entity is present (CentraleSupelec), that school's
 * coursework chunks are surfaced first.
 */
export function refineEducationCoursework(
  matches: RetrievalMatch[],
  entities: KnownEntity[]
): RetrievalMatch[] {
  const coursework = matches.filter((m) => isCourseworkSection(m));
  const base = matches.filter((m) => !isCourseworkSection(m));

  if (entities.some((e) => e === "CentraleSupelec")) {
    const centraleCw = coursework.filter((m) => chunkMatchesEntity(m, "CentraleSupelec"));
    const otherCw = coursework.filter((m) => !chunkMatchesEntity(m, "CentraleSupelec"));
    return [...centraleCw, ...otherCw, ...base];
  }

  return [...coursework, ...base];
}

/**
 * experience-specific: chunks from the named entities rank before unrelated
 * experience chunks. Preserves the score-based order within each tier.
 */
export function refineExperienceSpecific(
  matches: RetrievalMatch[],
  entities: KnownEntity[]
): RetrievalMatch[] {
  if (entities.length === 0) return matches;
  const entityMatches = matches.filter((m) => chunkMatchesAnyEntity(m, entities));
  const other = matches.filter((m) => !chunkMatchesAnyEntity(m, entities));
  return [...entityMatches, ...other];
}

/**
 * role-fit: work evidence (experience) first, then project/case-study,
 * then education as supporting context, then skills.
 */
export function refineRoleFit(matches: RetrievalMatch[]): RetrievalMatch[] {
  const byType = (types: SourceType[]) => matches.filter((m) => types.includes(m.chunk.sourceType));
  return [
    ...byType(["experience"]),
    ...byType(["project", "case-study"]),
    ...byType(["education"]),
    ...byType(["skills", "overview"])
  ];
}

/**
 * Exclude matches whose title/sourceId appears in `excludeTitles`.
 * Falls back to the unfiltered set if all matches are excluded.
 */
export function refineWithExclusion(
  matches: RetrievalMatch[],
  excludeTitles: string[]
): RetrievalMatch[] {
  if (excludeTitles.length === 0) return matches;
  const kept = matches.filter((m) => !titleMatchesRecent(m, excludeTitles));
  return kept.length > 0 ? kept : matches;
}

/**
 * technical-depth (optimization variant): when the interviewer asks about
 * optimization after already seeing a specific example, exclude the primary
 * recently-cited source and put work/project evidence first.
 *
 * This prevents answers from leading with the same source a second time when
 * the question is "Can you tell me about optimization?" in a quant context.
 */
export function refineOptimizationTechnical(
  matches: RetrievalMatch[],
  recentSourceTitles: string[]
): RetrievalMatch[] {
  const [recentPrimary] = recentSourceTitles;
  if (!recentPrimary) return matches;

  const fresh = matches.filter((m) => !titleMatchesRecent(m, [recentPrimary]));
  const workAndProject = fresh.filter(
    (m) =>
      m.chunk.sourceType === "project" ||
      m.chunk.sourceType === "case-study" ||
      m.chunk.sourceType === "experience"
  );

  if (workAndProject.length === 0) return matches;

  const usedSet = new Set(workAndProject);
  const remainder = matches.filter((m) => !usedSet.has(m));
  return [...workAndProject, ...remainder];
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build a `RetrievalPolicy` from the planner output.
 *
 * @param plan      Output of `planInterviewTurn`
 * @param baseTopK  Default topK from app config (policy may increase it)
 * @param question  Raw question string (used for healthcare / optimization checks)
 * @param history   Conversation history (used to exclude recently assistant-cited sources)
 */
export function buildRetrievalPolicy(
  plan: PlannedInterviewTurn,
  baseTopK: number,
  question: string,
  history: InterviewTurn[] = []
): RetrievalPolicy {
  const isHealthcare = HEALTHCARE_QUESTION_PATTERN.test(question);
  const isOptimization = OPTIMIZATION_QUESTION_PATTERN.test(question);

  const topK = topKForPlan(plan, baseTopK);

  // maxPerSource: policy resolves the value once
  const planMax = maxPerSourceForPlan(plan);
  const maxPerSource: number | undefined = planMax ?? (isHealthcare ? 1 : undefined);

  const sourceTypes = plan.sourceTypes.length > 0 ? plan.sourceTypes : undefined;

  const retrievalOptions: Omit<RetrievalOptions, "roleId"> = {
    topK,
    maxPerSource,
    sourceTypes
  };

  const { intent, entities, excludeSources, recentSourceTitles } = plan;

  function refine(matches: RetrievalMatch[]): RetrievalMatch[] {
    switch (intent) {
      case "education-schools":
        return refineEducationSchools(matches);

      case "education-coursework":
        return refineEducationCoursework(matches, entities);

      case "experience-specific": {
        const withEntityOrder = refineExperienceSpecific(matches, entities);
        // Apply exclusion for "another company like X" type questions
        return refineWithExclusion(withEntityOrder, excludeSources);
      }

      case "experience-list":
        return refineWithExclusion(matches, excludeSources);

      case "project-list": {
        const excluded = refineWithExclusion(matches, excludeSources);
        return refineExcludeRecentAssistantMentions(excluded, history);
      }

      case "project-specific": {
        const excluded = refineWithExclusion(matches, excludeSources);
        return refineExcludeRecentAssistantMentions(excluded, history);
      }

      case "follow-up": {
        const excluded = refineWithExclusion(matches, excludeSources);
        // Only apply assistant-mention filter when the active topic is projects
        if (plan.topic === "projects") {
          return refineExcludeRecentAssistantMentions(excluded, history);
        }
        return excluded;
      }

      case "role-fit":
        return refineRoleFit(matches);

      case "technical-depth":
        // For optimization follow-ups: prevent re-surfacing the primary recent source
        if (isOptimization && recentSourceTitles.length > 0) {
          return refineOptimizationTechnical(matches, recentSourceTitles);
        }
        return matches;

      default:
        return matches;
    }
  }

  return { retrievalOptions, refine };
}
