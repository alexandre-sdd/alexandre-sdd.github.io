/**
 * intent-planner.ts
 *
 * Owns the first decision about what the interviewer is asking before any
 * retrieval happens.
 *
 * ## Why this exists
 *
 * V1 interview-service.ts accumulated intent detection as inline functions
 * (`isDirectEducationQuestion`, `isOtherProjectQuestion`, etc.) that were
 * applied ad-hoc and could not see each other's outputs. This caused routing
 * failures: school questions retrieved projects, work questions returned
 * education chips, and vague follow-ups lost topic context.
 *
 * The planner consolidates all intent logic into a single `planInterviewTurn`
 * call that returns a `PlannedInterviewTurn`. Downstream code (retrieval,
 * evidence selection, answer generation) reads the plan instead of re-running
 * intent detection.
 *
 * ## Pipeline position
 *
 * question + history + compact memory
 *   → planInterviewTurn()        ← this module
 *   → retrieval (sourceTypes filter applied)
 *   → evidence selection
 *   → answer generation
 *   → source chips
 *
 * ## Testing
 *
 * All exports are pure functions with no I/O. Tests live in
 * `intent-planner.test.ts` and run independently of the corpus or retrieval.
 */

import {
  ENTITY_ALIASES,
  EXPERIENCE_ENTITIES,
  SCHOOL_ENTITIES
} from "@portfolio/interview-core";
import type { InterviewTurn, KnownEntity, SourceType } from "@portfolio/interview-core";

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * Expanded intent vocabulary for V2.
 *
 * More granular than the V1 `"behavioral" | "comparison" | "inventory" | ...`
 * because routing decisions differ within each broad category:
 * a school question and a coursework question are both "education" but need
 * different source-type filters and answer policies.
 */
export type InterviewIntent =
  | "education-schools"   // "what schools did you go to" / entity = school
  | "education-coursework" // "what courses have you taken"
  | "experience-list"     // "do you have work experience" / "any internships"
  | "experience-specific" // "when were you at CHANEL" / entity = work org
  | "project-list"        // "what projects have you built"
  | "project-specific"    // "tell me about ai-lexandre"
  | "role-fit"            // "could you do something outside AI engineering"
  | "technical-depth"     // "walk me through the architecture"
  | "behavioral"          // "tell me about a time you faced ambiguity"
  | "follow-up"           // "what else" / "anything else" — inherits topic from memory
  | "inventory"           // "list all your projects and experiences"
  | "general";            // catch-all

/**
 * Coarse topic label carried through a conversation.
 * Used by the planner to resolve vague follow-ups ("what else?") back to the
 * active category rather than starting a fresh retrieval.
 */
export type InterviewTopic =
  | "education"
  | "experience"
  | "projects"
  | "fit"
  | "technical"
  | "general";

/** Per-intent answer style guidance consumed by answer generation. */
export interface AnswerPolicy {
  /** Lead with a direct factual answer before elaborating. */
  preferDirectAnswer: boolean;
  /** Coursework is allowed as supporting (not primary) evidence. */
  allowCourseworkSupport: boolean;
  /** Project evidence is allowed even for non-project questions. */
  allowProjectSupport: boolean;
  /** Maximum number of distinct primary sources to surface. */
  maxPrimarySources: number;
}

/**
 * The output of a single planner call.
 * Every field is derived from the question, history, and compact memory —
 * no corpus or retrieval access required.
 */
export interface PlannedInterviewTurn {
  /** What the interviewer is asking. Drives all downstream routing. */
  intent: InterviewIntent;
  /**
   * Source types allowed in retrieval.
   * Empty array means no restriction (all types are candidates).
   * When non-empty, retrieval discards chunks outside this set before scoring.
   */
  sourceTypes: SourceType[];
  /** Canonical entity names extracted from the question + recent history. */
  entities: KnownEntity[];
  /** Active conversation topic, used to resolve vague follow-ups. */
  topic: InterviewTopic;
  /**
   * Source titles to exclude from retrieval results.
   * Populated when the question explicitly asks for "other" or "different"
   * sources, so recently used sources don't re-appear.
   */
  excludeSources: string[];
  /** Retrieval query to pass to `retrieveEvidence`. Intent-aware, entity-augmented. */
  retrievalQuery: string;
  /** Per-intent answer style rules for generation / source-chip filtering. */
  answerPolicy: AnswerPolicy;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Strip accents, lower-case, collapse whitespace, remove non-alphanumeric chars.
 * Used to normalise both question text and alias strings before comparison.
 */
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
 * Return canonical entity names found anywhere in the question or the last
 * four history turns.
 *
 * Matching uses substring search on normalised text so "CentraleSupélec",
 * "Centrale Supelec", and "Centrale" all resolve to "CentraleSupelec".
 */
export function extractEntities(question: string, history: InterviewTurn[] = []): KnownEntity[] {
  const haystack = normalizeText(
    [question, ...history.slice(-4).map((t) => t.content)].join(" ")
  );

  return (Object.entries(ENTITY_ALIASES) as [KnownEntity, string[]][])
    .filter(([, aliases]) =>
      aliases.some((alias) => {
        const normalized = normalizeText(alias);
        // Use word-boundary-style check: match full alias as a contiguous substring
        // surrounded by non-alphanumeric chars (or start/end of string).
        const pattern = new RegExp(`(?<![a-z0-9])${normalized.replace(/\s+/g, "[\\s-]+")}(?![a-z0-9])`);
        return pattern.test(haystack);
      })
    )
    .map(([entity]) => entity);
}

/**
 * True when the normalised question text contains work / employment keywords.
 * Used to disambiguate school-entity questions ("What about Columbia's career
 * services?") from pure education questions.
 */
function isWorkQuestion(lowerQ: string): boolean {
  return /\b(work|job|internship|intern|employed|company|companies|hire|hired)\b/.test(lowerQ);
}

/** True when the question is asking for a list of work experiences. */
function isExperienceListQuestion(lowerQ: string): boolean {
  return (
    /\b(internship|internships|intern|job|jobs|work history|work experience|professional experience)\b/.test(lowerQ) ||
    (/\b(experience|experiences)\b/.test(lowerQ) &&
      /\b(any|all|have|do you|what|which|tell me about)\b/.test(lowerQ))
  );
}

/**
 * Classify a single turn into a structured intent.
 *
 * Priority order (first match wins):
 * 1. School entity detected → education-schools
 * 2. Work entity detected   → experience-specific
 * 3. Vague follow-up        → follow-up (inherits topic from memory)
 * 4. Explicit school/degree keywords → education-schools
 * 5. Coursework keywords    → education-coursework
 * 6. Experience list        → experience-list
 * 7. Experience continuation ("other experiences") → experience-list
 * 8. Project patterns       → project-list / project-specific
 * 9. Inventory (all/list)   → inventory
 * 10. Role fit              → role-fit
 * 11. Technical depth       → technical-depth
 * 12. Behavioral            → behavioral
 * 13. Default               → general
 */
export function classifyIntent(
  question: string,
  entities: KnownEntity[],
  history: InterviewTurn[],
  compactMemory: string
): InterviewIntent {
  const lowerQ = normalizeText(question);
  const isConversation = history.length > 0 || compactMemory.length > 0;

  // 1. Coursework keywords — checked first so "what classes did you take at
  //    university?" and "your Centrale coursework" route here rather than to
  //    education-schools via entity or school-keyword detection.
  if (/\b(course|courses|coursework|class|classes|curriculum|studied|studying|gpa|took in school)\b/.test(lowerQ)) {
    return "education-coursework";
  }

  // 2. School entity → education-schools (unless question is about work at that school)
  const schoolEntities = entities.filter((e) => SCHOOL_ENTITIES.has(e));
  if (schoolEntities.length > 0 && !isWorkQuestion(lowerQ)) {
    return "education-schools";
  }

  // 3. Work entity → experience-specific
  const workEntities = entities.filter((e) => EXPERIENCE_ENTITIES.has(e));
  if (workEntities.length > 0) {
    return "experience-specific";
  }

  // 4. Very short vague follow-up — "what else", "anything else", "more", "go on"
  if (
    isConversation &&
    /^(what else|anything else|what more|go on|continue|tell me more|more|and|also|too)\??$/.test(lowerQ.trim())
  ) {
    return "follow-up";
  }

  // 5. Explicit school/degree/university keywords (without work context)
  if (
    /\b(school|schools|university|universities|college|degree|where did you study|studied at)\b/.test(lowerQ) &&
    !isWorkQuestion(lowerQ)
  ) {
    return "education-schools";
  }

  // 6. Experience list
  if (isExperienceListQuestion(lowerQ)) {
    return "experience-list";
  }

  // 7. "Other/another/different experience(s)" — experience list with exclusion
  if (
    isConversation &&
    /\b(other|another|different|else)\b.{0,40}\b(experience|experiences|work|job|internship|internships|company|role)\b/.test(lowerQ)
  ) {
    return "experience-list";
  }

  // 8. Inventory (asks for ALL/EVERY/OVERVIEW/RANGE of projects or experiences).
  // Checked before project-specific patterns because "Give me an overview of all
  // my projects" satisfies both, but inventory routing is more appropriate.
  if (
    /\b(all|every|overview|range)\b/.test(lowerQ) &&
    /\b(project|projects|experience|experiences|portfolio|background)\b/.test(lowerQ)
  ) {
    return "inventory";
  }

  // 9. Project patterns (specific or list, but not broad inventory)
  if (/\b(project|projects|portfolio|case stud|work sample|demo|built|build)\b/.test(lowerQ)) {
    if (/\b(list|what|which|have you|tell me about)\b/.test(lowerQ)) {
      return "project-list";
    }
    return "project-specific";
  }

  // 10. Role fit / career breadth
  if (
    /\b(fit|suited|suitable|hire|beyond|outside|not just|other than|career|broader|range|adjacent|transferable)\b/.test(
      lowerQ
    )
  ) {
    return "role-fit";
  }

  // 11. Technical depth
  if (
    /\b(architecture|pipeline|model|evaluation|tradeoff|agent|agents|api|llm|implementation|system design|how did you build|how does it work)\b/.test(
      lowerQ
    )
  ) {
    return "technical-depth";
  }

  // 12. Behavioral
  if (
    /\b(stakeholder|conflict|challenge|failure|mistake|pressure|ambiguous|ambiguity|worked with|team|tell me about a time|situation where)\b/.test(
      lowerQ
    )
  ) {
    return "behavioral";
  }

  return "general";
}

/** Source types that match each intent. Empty array = no restriction. */
const SOURCE_TYPES_BY_INTENT: Record<InterviewIntent, SourceType[]> = {
  "education-schools": ["education"],
  "education-coursework": ["education"],
  "experience-list": ["experience", "case-study"],
  "experience-specific": ["experience", "case-study"],
  "project-list": ["project", "case-study"],
  "project-specific": ["project", "case-study"],
  "role-fit": ["experience", "project", "case-study", "education", "skills"],
  "technical-depth": ["project", "case-study", "experience"],
  behavioral: ["experience", "project", "case-study"],
  "follow-up": [], // resolved via active topic
  inventory: ["project", "case-study"],
  general: [] // no restriction
};

/**
 * Healthcare questions (containing clinical/hospital/medical/etc. keywords)
 * have evidence split across "experience", "project", and "case-study" source
 * types in the corpus. Restricting sourceTypes would silently drop half the
 * relevant evidence. This guard is checked before applying any sourceTypes
 * restriction so healthcare questions always search across all types.
 */
const HEALTHCARE_QUESTION_PATTERN =
  /\b(care|clinical|clinic|cuimc|doctor|doctors|healthcare|health care|hospital|medical|medicine|nantes|patient|patients|physician|physicians|respiratory)\b/i;

function isHealthcareQuestion(question: string): boolean {
  return HEALTHCARE_QUESTION_PATTERN.test(question);
}

/** Map topic to the source types most relevant for follow-ups in that topic. */
function topicToSourceTypes(topic: InterviewTopic): SourceType[] {
  switch (topic) {
    case "education":
      return ["education"];
    case "experience":
      return ["experience", "case-study"];
    case "projects":
      return ["project", "case-study"];
    case "fit":
      return ["experience", "project", "case-study", "education", "skills"];
    case "technical":
      return ["project", "case-study", "experience"];
    default:
      return [];
  }
}

function deriveSourceTypes(intent: InterviewIntent, activeTopic: InterviewTopic): SourceType[] {
  if (intent === "follow-up") {
    return topicToSourceTypes(activeTopic);
  }
  return SOURCE_TYPES_BY_INTENT[intent] ?? [];
}

/** Derive conversation topic from intent. */
const INTENT_TO_TOPIC: Record<InterviewIntent, InterviewTopic> = {
  "education-schools": "education",
  "education-coursework": "education",
  "experience-list": "experience",
  "experience-specific": "experience",
  "project-list": "projects",
  "project-specific": "projects",
  "role-fit": "fit",
  "technical-depth": "technical",
  behavioral: "experience",
  "follow-up": "general", // overridden by active topic resolution
  inventory: "projects",
  general: "general"
};

/**
 * Parse the active topic from compact memory text.
 *
 * The current compact memory format is:
 *   "Recent sources in order: 1. CHANEL Europe; 2. SIGMA Group.
 *    Earlier interviewer topics: work experience discussion"
 *
 * This parser inspects keywords in the full memory string to infer which
 * topic was active. Phase 3 will replace this with a structured memory object.
 */
export function parseActiveTopic(compactMemory: string): InterviewTopic {
  const lower = normalizeText(compactMemory);
  if (/\b(education|school|university|coursework|degree|course|classe|gpa)\b/.test(lower)) return "education";
  if (/\b(work|experience|internship|job|employment|chanel|sigma|cuimc|nantes)\b/.test(lower)) return "experience";
  if (/\b(project|portfolio|case study|built|demo|ai lexandre|tomorrow you|codebase|copilot)\b/.test(lower)) return "projects";
  if (/\b(fit|role|career|suited|position|beyond|outside)\b/.test(lower)) return "fit";
  return "general";
}

/**
 * Parse titles of recently cited sources from compact memory.
 *
 * Reads the "Recent sources in order: 1. X; 2. Y." section of the current
 * string-format compact memory. Returns at most the 3 most recent titles.
 *
 * Phase 3 will replace this with structured memory parsing.
 */
export function parseRecentSourceTitles(compactMemory: string): string[] {
  const match = compactMemory.match(/Recent sources in order:\s*(.+?)(?=\s*Earlier interviewer topics:|$)/is);
  if (!match) return [];

  return match[1]
    .split(";")
    .map((item) =>
      item
        .replace(/^\s*\d+\.\s*/, "")
        .replace(/\.\s*$/, "")
        .trim()
    )
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * Return source titles to exclude from retrieval.
 *
 * Exclusion only applies when the intent calls for a different source
 * than what was used most recently — i.e., "other" / "another" questions.
 * For all other intents, exclusion would remove relevant evidence.
 */
function deriveExcludeSources(
  intent: InterviewIntent,
  question: string,
  compactMemory: string
): string[] {
  const lowerQ = normalizeText(question);
  // "else" is intentionally excluded: "what else?" is a vague continuation
  // (handled by follow-up topic inheritance) while "other/another/different"
  // is an explicit request for a distinct source.
  const asksForOther =
    /\b(other|another|different|not that one|aside from|besides)\b/.test(lowerQ);

  if (!asksForOther) return [];
  if (intent === "follow-up" || intent === "experience-list" || intent === "project-list") {
    return parseRecentSourceTitles(compactMemory);
  }
  return [];
}

/** Build query hints from entity names for better lexical matching. */
function entityQueryHints(entities: KnownEntity[]): string {
  if (entities.length === 0) return "";
  return entities
    .flatMap((entity) => ENTITY_ALIASES[entity].slice(0, 3))
    .join(" ");
}

/**
 * Extract the title of a source referenced by ordinal position in the question.
 * Handles "the second one", "2nd one", "first project", etc.
 *
 * Reads the "Recent sources in order: 1. X; 2. Y." section of compact memory.
 * Used in the retrieval query for "general" follow-ups so that "what did you
 * learn from the second one?" correctly boosts Codebase Analyzer, not a
 * random top result.
 */
function extractOrdinalSourceHint(question: string, compactMemory: string): string {
  if (!compactMemory) return "";

  const lowerQ = question.toLowerCase();
  const ordinal = /\b(second|2nd)\b/.test(lowerQ)
    ? 2
    : /\b(third|3rd)\b/.test(lowerQ)
      ? 3
      : /\b(first|1st)\b/.test(lowerQ)
        ? 1
        : 0;

  if (!ordinal) return "";

  const pattern = new RegExp(`${ordinal}\\.\\s*([^.;]+)`, "i");
  return compactMemory.match(pattern)?.[1]?.trim() ?? "";
}

/** Short keyword hint for a topic, used in follow-up queries. */
function topicQueryHint(topic: InterviewTopic): string {
  switch (topic) {
    case "education":
      return "coursework education school";
    case "experience":
      return "work experience internship job";
    case "projects":
      return "project portfolio case study";
    case "fit":
      return "role fit background career";
    case "technical":
      return "technical implementation architecture";
    default:
      return "";
  }
}

/**
 * Build the retrieval query string.
 *
 * The goal is to give the lexical retriever enough signal to surface the right
 * evidence when the question alone is vague (e.g., "What about Columbia and
 * CentraleSupelec?" needs entity aliases added to match education chunks).
 */
export function buildRetrievalQuery(
  question: string,
  intent: InterviewIntent,
  entities: KnownEntity[],
  history: InterviewTurn[],
  compactMemory: string
): string {
  const recentUserContext = history
    .filter((t) => t.role === "user")
    .slice(-3)
    .map((t) => t.content)
    .join(" ");

  switch (intent) {
    case "education-schools":
      return [question, entityQueryHints(entities), "school education degree university"].filter(Boolean).join("\n");

    case "education-coursework": {
      const centraleHint = entities.includes("CentraleSupelec")
        ? "CentraleSupelec Centrale engineering school coursework classes"
        : "";
      return [question, recentUserContext, centraleHint, "coursework classes education"].filter(Boolean).join("\n");
    }

    case "experience-specific":
      return [question, entityQueryHints(entities), "work experience dates"].filter(Boolean).join("\n");

    case "experience-list":
      return [question, recentUserContext, "work experience internship job"].filter(Boolean).join("\n");

    case "project-list":
    case "inventory":
      return [question, recentUserContext, "portfolio project case study"].filter(Boolean).join("\n");

    case "follow-up": {
      const activeTopic = parseActiveTopic(compactMemory);
      return [question, recentUserContext, topicQueryHint(activeTopic)].filter(Boolean).join("\n");
    }

    default: {
      // For general intent, preserve the old ordinal-source hint so that
      // "what did you learn from the second one?" boosts the second recent source.
      const ordinalHint = extractOrdinalSourceHint(question, compactMemory);
      return [ordinalHint, question, ordinalHint ? compactMemory : "", recentUserContext].filter(Boolean).join("\n");
    }
  }
}

/** Answer policies indexed by intent. */
const ANSWER_POLICIES: Record<InterviewIntent, AnswerPolicy> = {
  "education-schools": {
    preferDirectAnswer: true,
    allowCourseworkSupport: false,
    allowProjectSupport: false,
    maxPrimarySources: 2
  },
  "education-coursework": {
    preferDirectAnswer: true,
    allowCourseworkSupport: true,
    allowProjectSupport: false,
    maxPrimarySources: 2
  },
  "experience-list": {
    preferDirectAnswer: false,
    allowCourseworkSupport: false,
    allowProjectSupport: false,
    maxPrimarySources: 4
  },
  "experience-specific": {
    preferDirectAnswer: true,
    allowCourseworkSupport: false,
    allowProjectSupport: false,
    maxPrimarySources: 2
  },
  "project-list": {
    preferDirectAnswer: false,
    allowCourseworkSupport: false,
    allowProjectSupport: true,
    maxPrimarySources: 6
  },
  "project-specific": {
    preferDirectAnswer: true,
    allowCourseworkSupport: false,
    allowProjectSupport: true,
    maxPrimarySources: 2
  },
  "role-fit": {
    preferDirectAnswer: false,
    allowCourseworkSupport: true,
    allowProjectSupport: true,
    maxPrimarySources: 4
  },
  "technical-depth": {
    preferDirectAnswer: true,
    allowCourseworkSupport: false,
    allowProjectSupport: true,
    maxPrimarySources: 2
  },
  behavioral: {
    preferDirectAnswer: true,
    allowCourseworkSupport: false,
    allowProjectSupport: false,
    maxPrimarySources: 2
  },
  "follow-up": {
    preferDirectAnswer: false,
    allowCourseworkSupport: false,
    allowProjectSupport: true,
    maxPrimarySources: 2
  },
  inventory: {
    preferDirectAnswer: false,
    allowCourseworkSupport: false,
    allowProjectSupport: true,
    maxPrimarySources: 8
  },
  general: {
    preferDirectAnswer: false,
    allowCourseworkSupport: true,
    allowProjectSupport: true,
    maxPrimarySources: 3
  }
};

// ─── Main export ──────────────────────────────────────────────────────────────

/** Input to the planner. Mirrors the parameters available at request time. */
export interface PlannerInput {
  question: string;
  history?: InterviewTurn[];
  compactMemory?: string;
  roleId?: string;
}

/**
 * Produce a `PlannedInterviewTurn` from a single user question.
 *
 * @example
 * const plan = planInterviewTurn({ question: "what schools did you go to" });
 * plan.intent        // "education-schools"
 * plan.sourceTypes   // ["education"]
 * plan.entities      // []
 *
 * const plan2 = planInterviewTurn({ question: "when were you at CHANEL?" });
 * plan2.intent       // "experience-specific"
 * plan2.entities     // ["CHANEL"]
 * plan2.sourceTypes  // ["experience", "case-study"]
 */
export function planInterviewTurn(input: PlannerInput): PlannedInterviewTurn {
  const history = input.history ?? [];
  const compactMemory = input.compactMemory?.trim() ?? "";

  // Use question-only entities for intent routing.
  //
  // History entities can incorrectly override the current question's topic:
  // e.g., "CentraleSupelec" mentioned three turns ago should not force
  // "any other project you can talk to me about" into education-schools routing.
  // History entities are still used below for query hint augmentation.
  const routingEntities = extractEntities(input.question, []);
  const contextEntities = extractEntities(input.question, history);

  const intent = classifyIntent(input.question, routingEntities, history, compactMemory);

  const activeTopic = intent === "follow-up" ? parseActiveTopic(compactMemory) : INTENT_TO_TOPIC[intent];
  const topic = activeTopic;
  let sourceTypes = deriveSourceTypes(intent, activeTopic);

  // Healthcare questions have evidence split across experience, case-study, and
  // project source types. Restricting sourceTypes would silently drop valid
  // evidence (e.g., Nantes Hospital is "experience", CUIMC is "case-study").
  // When the question contains healthcare keywords, remove the sourceTypes
  // restriction so the healthcare domain boost in retrieval can do its job.
  if (isHealthcareQuestion(input.question) && sourceTypes.length > 0 && !sourceTypes.includes("experience")) {
    sourceTypes = [];
  }

  const excludeSources = deriveExcludeSources(intent, input.question, compactMemory);
  // Use context entities (with history) for query augmentation to improve recall
  const retrievalQuery = buildRetrievalQuery(input.question, intent, contextEntities, history, compactMemory);
  const answerPolicy = ANSWER_POLICIES[intent];

  // Expose routing entities (question-only) in plan.entities since these are
  // the entities that drove the intent decision.
  return { intent, sourceTypes, entities: routingEntities, topic, excludeSources, retrievalQuery, answerPolicy };
}

/**
 * Return the recommended topK for a retrieval call given a plan.
 *
 * List and inventory intents need more candidates to ensure diversity.
 * Specific-entity questions need fewer (focused retrieval).
 */
export function topKForPlan(plan: PlannedInterviewTurn, baseTopK: number): number {
  switch (plan.intent) {
    case "inventory":
      return Math.max(baseTopK, 14);
    case "role-fit":
      return Math.max(baseTopK, 16);
    case "project-list":
    case "experience-list":
    case "follow-up":
      return Math.max(baseTopK, 10);
    default:
      return baseTopK;
  }
}

/**
 * Return the recommended maxPerSource for a retrieval call given a plan.
 *
 * List and inventory intents should diversify across sources (1 chunk each).
 * Specific intents benefit from slightly deeper per-source evidence.
 */
export function maxPerSourceForPlan(plan: PlannedInterviewTurn): number | undefined {
  switch (plan.intent) {
    case "inventory":
    case "project-list":
    case "experience-list":
    case "role-fit":
    case "follow-up":
      return 1;
    default:
      return undefined;
  }
}
