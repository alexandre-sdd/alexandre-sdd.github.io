import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_ROLE_ID } from "./presets.js";
import type {
  CaseStudyRecord,
  CorpusChunk,
  EducationRecord,
  ExperienceRecord,
  GeneratedCorpus,
  PortfolioContent,
  ProjectRecord,
  SkillGroupRecord
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../");
const contentFilePath = path.join(repoRoot, "content.json");
const generatedCorpusPath = path.join(repoRoot, "packages/interview-core/generated/corpus.json");

const PROJECT_ROLE_TAGS: Record<string, string[]> = {
  "interview-through-my-work": ["ai-engineer", "ml-engineer", "product-data-scientist"],
  "tomorrow-you": ["ai-engineer", "ml-engineer", "product-data-scientist"],
  helpfullens: ["ml-engineer", "product-data-scientist"],
  "childcare-deserts-nyc": ["optimization-analytics", "research-engineer", "product-data-scientist"],
  "codebase-analyzer": ["ai-engineer", "ml-engineer", "research-engineer"],
  "appointment-scheduling-dynamics": ["optimization-analytics", "research-engineer"],
  "linkedin-note-copilot": ["ai-engineer", "product-data-scientist"],
  "zeit-project": ["optimization-analytics", "product-data-scientist", "ai-engineer"],
  "dna-plasmid-closure": ["research-engineer", "optimization-analytics"],
  "chanel-europe-analytics-pipeline": ["ml-engineer", "product-data-scientist"]
};

const TOPIC_KEYWORDS = [
  "agent",
  "ai",
  "analytics",
  "anomaly",
  "api",
  "automation",
  "clustering",
  "dashboard",
  "data quality",
  "decision support",
  "evaluation",
  "experiment",
  "fastapi",
  "feature engineering",
  "forecasting",
  "gurobi",
  "llm",
  "machine learning",
  "next.js",
  "openai",
  "optimization",
  "or-tools",
  "pipeline",
  "product",
  "python",
  "research",
  "retrieval",
  "scheduling",
  "simulation",
  "sql",
  "stakeholder",
  "typescript",
  "voice"
];

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "the",
  "this",
  "to",
  "with",
  "you",
  "your"
]);

function toInterviewRelativeUrl(url: string | undefined, fallback = "../index.html"): string {
  if (!url) return fallback;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("./")) return `../${url.slice(2)}`;
  if (url.startsWith("#")) return `../index.html${url}`;
  return `../${url}`;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9+.#/\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function inferKeywords(text: string, seeded: string[] = []): string[] {
  const lower = text.toLowerCase();
  const set = new Set<string>(seeded.map((keyword) => keyword.toLowerCase()));

  TOPIC_KEYWORDS.forEach((keyword) => {
    if (lower.includes(keyword)) {
      set.add(keyword);
    }
  });

  tokenize(text).forEach((token) => set.add(token));
  return Array.from(set).slice(0, 40);
}

function addChunk(
  chunks: CorpusChunk[],
  chunk: Omit<CorpusChunk, "keywords"> & { keywords?: string[] }
): void {
  chunks.push({
    ...chunk,
    text: normalizeText(chunk.text),
    keywords: inferKeywords(`${chunk.title} ${chunk.section} ${chunk.text}`, chunk.keywords)
  });
}

function addOverviewChunks(chunks: CorpusChunk[], content: PortfolioContent): void {
  addChunk(chunks, {
    id: "overview:profile",
    sourceType: "overview",
    sourceId: "profile",
    title: `${content.name} profile`,
    section: "Portfolio overview",
    text: `${content.headline}. ${content.targetRoleLine}. ${content.about}. Highlights: ${content.heroProofBullets.join(" ")} Impact: ${content.impactHighlights.join(" ")}`,
    citationLabel: "Portfolio overview",
    publicUrl: "../index.html#home",
    roleTags: [DEFAULT_ROLE_ID, "ml-engineer", "product-data-scientist"],
    evidenceStrength: "core",
    keywords: ["portfolio", "overview", "profile"]
  });
}

function projectEvidenceUrl(project: ProjectRecord): string {
  return toInterviewRelativeUrl(
    project.artifacts?.writeup || project.artifacts?.code || project.artifacts?.demo,
    "../index.html#projects"
  );
}

function addProjectChunks(chunks: CorpusChunk[], project: ProjectRecord): void {
  const roleTags = PROJECT_ROLE_TAGS[project.id] ?? [DEFAULT_ROLE_ID];
  const baseKeywords = [...(project.tags ?? []), project.id, project.title];

  addChunk(chunks, {
    id: `project:${project.id}:summary`,
    sourceType: "project",
    sourceId: project.id,
    projectId: project.id,
    title: project.title,
    section: "Project summary",
    text: `Summary: ${project.summary} Result: ${project.result ?? "No explicit result line was provided."} Tags: ${(project.tags ?? []).join(", ")}.`,
    citationLabel: `${project.title} - summary`,
    publicUrl: projectEvidenceUrl(project),
    roleTags,
    evidenceStrength: "core",
    keywords: baseKeywords
  });

  if (project.highlights && project.highlights.length > 0) {
    addChunk(chunks, {
      id: `project:${project.id}:highlights`,
      sourceType: "project",
      sourceId: project.id,
      projectId: project.id,
      title: project.title,
      section: "Project highlights",
      text: project.highlights.join(" "),
      citationLabel: `${project.title} - highlights`,
      publicUrl: projectEvidenceUrl(project),
      roleTags,
      evidenceStrength: "supporting",
      keywords: baseKeywords
    });
  }
}

function addCaseStudyChunks(chunks: CorpusChunk[], caseStudy: CaseStudyRecord): void {
  const roleTags = PROJECT_ROLE_TAGS[caseStudy.id] ?? [DEFAULT_ROLE_ID];
  const publicUrl = toInterviewRelativeUrl(caseStudy.page, "../index.html#case-studies");
  const baseKeywords = [caseStudy.id, caseStudy.title, ...(caseStudy.techStack ?? [])];

  addChunk(chunks, {
    id: `case-study:${caseStudy.id}:summary`,
    sourceType: "case-study",
    sourceId: caseStudy.id,
    projectId: caseStudy.id,
    title: caseStudy.title,
    section: "Case study summary",
    text: `${caseStudy.summary} Context: ${(caseStudy.context ?? []).join(" ")}`,
    citationLabel: `${caseStudy.title} - summary`,
    publicUrl,
    roleTags,
    evidenceStrength: "core",
    keywords: baseKeywords
  });

  addChunk(chunks, {
    id: `case-study:${caseStudy.id}:problem`,
    sourceType: "case-study",
    sourceId: caseStudy.id,
    projectId: caseStudy.id,
    title: caseStudy.title,
    section: "Problem and constraints",
    text: `Problem: ${(caseStudy.problem ?? []).join(" ")} Constraints: ${(caseStudy.constraints ?? []).join(" ")}`,
    citationLabel: `${caseStudy.title} - problem and constraints`,
    publicUrl,
    roleTags,
    evidenceStrength: "core",
    keywords: [...baseKeywords, "constraints", "problem"]
  });

  addChunk(chunks, {
    id: `case-study:${caseStudy.id}:approach`,
    sourceType: "case-study",
    sourceId: caseStudy.id,
    projectId: caseStudy.id,
    title: caseStudy.title,
    section: "Approach and results",
    text: `Approach: ${(caseStudy.approach ?? []).join(" ")} Results: ${(caseStudy.results ?? []).join(" ")} Next improvements: ${(caseStudy.nextImprovements ?? []).join(" ")}`,
    citationLabel: `${caseStudy.title} - approach and results`,
    publicUrl,
    roleTags,
    evidenceStrength: "core",
    keywords: [...baseKeywords, "approach", "results"]
  });
}

function addExperienceChunks(chunks: CorpusChunk[], experience: ExperienceRecord, index: number): void {
  addChunk(chunks, {
    id: `experience:${index}`,
    sourceType: "experience",
    sourceId: `${experience.company}:${experience.role}`,
    title: `${experience.role} at ${experience.company}`,
    section: "Experience highlights",
    text: `${experience.dates} in ${experience.location}. ${experience.highlights.join(" ")}`,
    citationLabel: `${experience.role} - ${experience.company}`,
    publicUrl: "../index.html#experience",
    roleTags: inferExperienceRoleTags(experience),
    evidenceStrength: "supporting",
    keywords: [experience.company, experience.role]
  });
}

function inferExperienceRoleTags(experience: ExperienceRecord): string[] {
  const text = `${experience.role} ${experience.company} ${experience.highlights.join(" ")}`.toLowerCase();
  const tags = new Set<string>(["product-data-scientist"]);

  if (/(ai|machine learning|anomaly|forecasting|model|pipeline)/.test(text)) tags.add("ml-engineer");
  if (/(fastapi|next\.js|api|agent|voice|openai)/.test(text)) tags.add("ai-engineer");
  if (/(optimization|scheduling|simulation|forecasting)/.test(text)) tags.add("optimization-analytics");
  if (/(research|simulation|policy)/.test(text)) tags.add("research-engineer");

  return Array.from(tags);
}

function addEducationChunks(chunks: CorpusChunk[], education: EducationRecord, index: number): void {
  addChunk(chunks, {
    id: `education:${index}`,
    sourceType: "education",
    sourceId: education.school,
    title: `${education.degree} at ${education.school}`,
    section: "Education",
    text: `${education.dates} in ${education.location}. ${education.details.join(" ")}`,
    citationLabel: `${education.degree} - ${education.school}`,
    publicUrl: "../index.html#education",
    roleTags: ["ai-engineer", "ml-engineer", "research-engineer", "optimization-analytics"],
    evidenceStrength: "supporting",
    keywords: [education.school, education.degree]
  });
}

function addSkillChunks(chunks: CorpusChunk[], skillGroup: SkillGroupRecord, index: number): void {
  addChunk(chunks, {
    id: `skills:${index}`,
    sourceType: "skills",
    sourceId: skillGroup.group,
    title: skillGroup.group,
    section: "Skills",
    text: skillGroup.items.join(", "),
    citationLabel: `${skillGroup.group} skills`,
    publicUrl: "../index.html#skills",
    roleTags: ["ai-engineer", "ml-engineer", "research-engineer", "optimization-analytics", "product-data-scientist"],
    evidenceStrength: "supporting",
    keywords: [skillGroup.group, ...skillGroup.items]
  });
}

export function buildCorpusFromContent(content: PortfolioContent): GeneratedCorpus {
  const chunks: CorpusChunk[] = [];

  addOverviewChunks(chunks, content);
  content.projects.forEach((project) => addProjectChunks(chunks, project));
  content.caseStudies.forEach((caseStudy) => addCaseStudyChunks(chunks, caseStudy));
  content.experience.forEach((experience, index) => addExperienceChunks(chunks, experience, index));
  content.education.forEach((education, index) => addEducationChunks(chunks, education, index));
  content.skills.forEach((group, index) => addSkillChunks(chunks, group, index));

  return {
    generatedAt: new Date().toISOString(),
    chunkCount: chunks.length,
    chunks
  };
}

export function loadPortfolioContent(contentPath = contentFilePath): PortfolioContent {
  return JSON.parse(fs.readFileSync(contentPath, "utf8")) as PortfolioContent;
}

export function writeGeneratedCorpus(outputPath = generatedCorpusPath, contentPath = contentFilePath): GeneratedCorpus {
  const content = loadPortfolioContent(contentPath);
  const corpus = buildCorpusFromContent(content);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");
  return corpus;
}

let cachedCorpus: GeneratedCorpus | null = null;

export function loadGeneratedCorpus(corpusPath = generatedCorpusPath): GeneratedCorpus {
  if (cachedCorpus) return cachedCorpus;

  if (!fs.existsSync(corpusPath)) {
    cachedCorpus = writeGeneratedCorpus(corpusPath);
    return cachedCorpus;
  }

  cachedCorpus = JSON.parse(fs.readFileSync(corpusPath, "utf8")) as GeneratedCorpus;
  return cachedCorpus;
}
