import { ROLE_PRESET_MAP } from "./presets.js";
import type { CorpusChunk, GeneratedCorpus, RetrievalMatch, RetrievalOptions } from "./types.js";

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "about",
  "best",
  "did",
  "for",
  "from",
  "how",
  "i",
  "is",
  "me",
  "my",
  "of",
  "on",
  "project",
  "show",
  "shows",
  "tell",
  "that",
  "the",
  "to",
  "what",
  "which",
  "with",
  "you",
  "your"
]);

const HEALTHCARE_QUERY_PATTERN =
  /\b(care|clinical|clinic|cuimc|doctor|doctors|healthcare|health care|hospital|medical|medicine|nantes|patient|patients|physician|physicians|respiratory)\b/;

const HEALTHCARE_SOURCE_PATTERN =
  /\b(cuimc|clinical|columbia doctors|doctor|doctors|emergency|healthcare|health care|hospital|medical|medicine|nantes|outpatient|patient|patients|physician|physicians|respiratory)\b/;

const LEARNING_QUERY_PATTERN =
  /\b(decision|decisions|decide|failure|fail|failed|fails|grounded|grounding|harden|improve|improved|improvement|learn|learned|lesson|lessons|role|scope|tradeoff|tradeoffs|trade-off|trade-offs|what did you change|what would you change)\b/;

const SOURCE_KNOWLEDGE_QUERY_PATTERN =
  /\b(api|architecture|audit|backend|component|components|data model|demo flow|diagnostic|diagnostics|endpoint|endpoints|frontend|implementation|layout|route|routes|runtime|schema|source|storage|technical trace)\b/;

const QUANTITATIVE_ROLE_QUERY_PATTERN =
  /\b(classical quant|financial engineering|market|markets|pricing|quant|quants|quantitative|risk|trading)\b/;

const ROLE_BREADTH_QUERY_PATTERN =
  /\b(ai engineer|ai engineering|background|beyond|broader|career|fit|not just|outside|position|role|roles|suited|suitable|what else)\b/;

function tokenize(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+.#/\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function matchCount(haystack: string[], needles: string[]): number {
  if (needles.length === 0) return 0;
  const set = new Set(haystack);
  return needles.reduce((count, needle) => count + (set.has(needle) ? 1 : 0), 0);
}

function queryHas(query: string, pattern: RegExp): boolean {
  return pattern.test(query.toLowerCase());
}

function isBackgroundFitQuery(lowerQuery: string): boolean {
  if (QUANTITATIVE_ROLE_QUERY_PATTERN.test(lowerQuery)) return true;
  const asksForBreadth = /\b(beyond|broader|not just|outside|what else)\b/.test(lowerQuery);
  const asksForRoleFit = /\b(ai engineer|ai engineering|background|career|fit|position|role|roles|suited|suitable)\b/.test(lowerQuery);

  return ROLE_BREADTH_QUERY_PATTERN.test(lowerQuery) && asksForRoleFit && (asksForBreadth || /\b(fit|position|role|roles|suited|suitable)\b/.test(lowerQuery));
}

function isDirectEducationQuery(lowerQuery: string): boolean {
  return /\b(class|classes|course|courses|coursework|course work|degree|education|gpa|learned in class|school|university|college)\b/.test(
    lowerQuery
  );
}

function baseSourceWeight(chunk: CorpusChunk): number {
  switch (chunk.sourceType) {
    case "project":
    case "case-study":
      return 6;
    case "experience":
      return 4;
    case "overview":
      return 3;
    case "education":
    case "skills":
      return 2;
    default:
      return 1;
  }
}

function chunkSearchText(chunk: CorpusChunk): string {
  return `${chunk.title} ${chunk.section} ${chunk.text} ${chunk.sourceId} ${chunk.keywords.join(" ")}`.toLowerCase();
}

function scoreChunk(chunk: CorpusChunk, query: string, roleId?: string): RetrievalMatch {
  const lowerQuery = query.toLowerCase();
  const lowerSection = chunk.section.toLowerCase();
  const queryTokens = tokenize(query);
  const titleTokens = tokenize(chunk.title);
  const sectionTokens = tokenize(chunk.section);
  const textTokens = tokenize(chunk.text);
  const keywordTokens = chunk.keywords.map((keyword) => keyword.toLowerCase());
  const rolePreset = roleId ? ROLE_PRESET_MAP.get(roleId) : undefined;

  let score = baseSourceWeight(chunk);
  const reasons: string[] = [];

  const titleHits = matchCount(titleTokens, queryTokens);
  const sectionHits = matchCount(sectionTokens, queryTokens);
  const textHits = matchCount(textTokens, queryTokens);
  const keywordHits = matchCount(keywordTokens, queryTokens);

  if (titleHits > 0) {
    score += titleHits * 6;
    reasons.push(`title hit x${titleHits}`);
  }

  if (sectionHits > 0) {
    score += sectionHits * 4;
    reasons.push(`section hit x${sectionHits}`);
  }

  if (textHits > 0) {
    score += textHits * 2;
    reasons.push(`content hit x${textHits}`);
  }

  if (keywordHits > 0) {
    score += keywordHits * 3;
    reasons.push(`keyword hit x${keywordHits}`);
  }

  if (chunk.evidenceStrength === "core") {
    score += 3;
    reasons.push("core evidence");
  }

  if (LEARNING_QUERY_PATTERN.test(lowerQuery) && /role and scope|decisions and tradeoffs|failures and lessons|evidence and next improvements/.test(lowerSection)) {
    score += 24;
    reasons.push("learning evidence match");
  }

  if (SOURCE_KNOWLEDGE_QUERY_PATTERN.test(lowerQuery) && lowerSection === "repository knowledge") {
    score += 45;
    reasons.push("repository knowledge match");
  }

  if (chunk.sourceType === "education" && isDirectEducationQuery(lowerQuery)) {
    score += lowerSection.startsWith("coursework -") ? 44 : 20;
    reasons.push("direct education match");
  } else if (chunk.sourceType === "education" && isBackgroundFitQuery(lowerQuery)) {
    score += lowerSection.startsWith("coursework -") ? 24 : 12;
    reasons.push("background education support");

    if (
      QUANTITATIVE_ROLE_QUERY_PATTERN.test(lowerQuery) &&
      /\b(calculus|linear algebra|optimization|probability|statistics|stochastic|simulation)\b/.test(chunkSearchText(chunk))
    ) {
      score += 10;
      reasons.push("quantitative coursework support");
    }
  }

  if (chunk.sourceType === "skills" && isBackgroundFitQuery(lowerQuery)) {
    score += 8;
    reasons.push("background skills support");
  }

  if (chunk.sourceType === "experience" && isBackgroundFitQuery(lowerQuery)) {
    score += 34;
    reasons.push("background experience match");
  }

  if (
    (chunk.sourceType === "project" || chunk.sourceType === "case-study") &&
    isBackgroundFitQuery(lowerQuery)
  ) {
    score += 30;
    reasons.push("background project match");
  }

  if (/\b(learn|learned|lesson|lessons)\b/.test(lowerQuery) && lowerSection === "failures and lessons") {
    score += 18;
    reasons.push("lessons section match");
  }

  if (/\b(decision|decisions|decide|tradeoff|tradeoffs|trade-off|trade-offs)\b/.test(lowerQuery) && lowerSection === "decisions and tradeoffs") {
    score += 18;
    reasons.push("decision section match");
  }

  if (/\b(failure|fail|failed|fails|grounded|grounding|what did you change)\b/.test(lowerQuery) && lowerSection === "failures and lessons") {
    score += 20;
    reasons.push("failure section match");
  }

  if (/\b(exact role|your role|my role|scope)\b/.test(lowerQuery) && lowerSection === "role and scope") {
    score += 18;
    reasons.push("role scope section match");
  }

  if (
    ["project", "case-study", "experience"].includes(chunk.sourceType) &&
    HEALTHCARE_QUERY_PATTERN.test(lowerQuery) &&
    HEALTHCARE_SOURCE_PATTERN.test(chunkSearchText(chunk))
  ) {
    score += 42;
    reasons.push("healthcare domain match");
  }

  if (chunk.sourceType === "experience") {
    if (
      queryHas(
        lowerQuery,
        /\b(internship|internships|intern|job|jobs|work history|work experience|professional experience|stakeholder|stakeholders|ambiguous|ambiguity|requirements|client|consulting|consultant)\b/
      )
    ) {
      score += 24;
      reasons.push("strong experience intent");
    } else if (queryHas(lowerQuery, /\b(experience|experiences)\b/)) {
      score += 10;
      reasons.push("experience intent");
    }
  }

  if (
    (chunk.sourceType === "project" || chunk.sourceType === "case-study") &&
    queryHas(lowerQuery, /\b(project|projects|built|build|portfolio|case study|case studies|work sample|work samples)\b/)
  ) {
    score += 4;
    reasons.push("project intent");
  }

  if (chunk.sourceType === "education" && queryHas(lowerQuery, /\b(education|school|degree|coursework|course work|university|college|gpa)\b/)) {
    score += 8;
    reasons.push("education intent");
  }

  if (chunk.sourceType === "skills" && queryHas(lowerQuery, /\b(skill|skills|stack|tools|technologies|technology|languages)\b/)) {
    score += 8;
    reasons.push("skills intent");
  }

  if (rolePreset && !isBackgroundFitQuery(lowerQuery)) {
    const roleKeywordHits = matchCount(keywordTokens, rolePreset.keywords.map((keyword) => keyword.toLowerCase()));
    if (chunk.roleTags.includes(rolePreset.id)) {
      score += 8;
      reasons.push("role tag match");
    }

    if (chunk.projectId && rolePreset.priorityProjectIds.includes(chunk.projectId)) {
      score += 6;
      reasons.push("priority project");
    }

    if (roleKeywordHits > 0) {
      score += Math.min(roleKeywordHits, 3) * 2;
      reasons.push(`role keyword overlap x${roleKeywordHits}`);
    }
  }

  return { chunk, score, reasons };
}

function diversify(matches: RetrievalMatch[], topK: number, maxPerSource = 2): RetrievalMatch[] {
  const selected: RetrievalMatch[] = [];
  const perSource = new Map<string, number>();

  for (const match of matches) {
    const sourceCount = perSource.get(match.chunk.sourceId) ?? 0;
    if (sourceCount >= maxPerSource) continue;
    selected.push(match);
    perSource.set(match.chunk.sourceId, sourceCount + 1);
    if (selected.length >= topK) break;
  }

  return selected;
}

export function retrieveEvidence(
  corpus: GeneratedCorpus,
  query: string,
  options: RetrievalOptions = {}
): RetrievalMatch[] {
  const topK = options.topK ?? 6;

  // Apply pre-scoring filters: source-type restriction and source-id exclusion.
  // These run before any scoring so that restricted sources don't compete for
  // topK slots even with low scores.
  const candidates = corpus.chunks.filter((chunk) => {
    if (options.sourceTypes && options.sourceTypes.length > 0 && !options.sourceTypes.includes(chunk.sourceType)) {
      return false;
    }
    if (options.excludeSourceIds && options.excludeSourceIds.length > 0 && options.excludeSourceIds.includes(chunk.sourceId)) {
      return false;
    }
    return true;
  });

  const scored = candidates
    .map((chunk) => scoreChunk(chunk, query, options.roleId))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  return diversify(scored, topK, options.maxPerSource);
}
