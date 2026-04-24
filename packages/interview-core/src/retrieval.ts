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

function tokenize(value: string): string[] {
  return value
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
        /\b(internship|internships|intern|role|roles|job|jobs|work history|work experience|professional experience|stakeholder|stakeholders|ambiguous|ambiguity|requirements|client|consulting|consultant)\b/
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

  if (chunk.sourceType === "education" && queryHas(lowerQuery, /\b(education|school|degree|coursework|university|college|gpa)\b/)) {
    score += 8;
    reasons.push("education intent");
  }

  if (chunk.sourceType === "skills" && queryHas(lowerQuery, /\b(skill|skills|stack|tools|technologies|technology|languages)\b/)) {
    score += 8;
    reasons.push("skills intent");
  }

  if (rolePreset) {
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
  const scored = corpus.chunks
    .map((chunk) => scoreChunk(chunk, query, options.roleId))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  return diversify(scored, topK, options.maxPerSource);
}
