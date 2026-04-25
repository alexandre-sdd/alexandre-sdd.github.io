export type SourceType =
  | "overview"
  | "project"
  | "case-study"
  | "experience"
  | "education"
  | "skills";

export type EvidenceStrength = "core" | "supporting";
export type EvidenceLevel = "public" | "sanitized" | "limited";

export interface LinkMap {
  email: string;
  github: string;
  linkedin: string;
  resume: string;
}

export interface LearningProfile {
  role: string;
  decisions: string[];
  tradeoffs: string[];
  failures: string[];
  lessons: string[];
  skills: string[];
  evidenceLevel: EvidenceLevel;
  evidenceNotes: string;
  nextImprovements: string[];
}

export interface SourceKnowledgeNote {
  source: string;
  url: string;
  facts: string[];
}

export interface ProjectRecord {
  id: string;
  title: string;
  summary: string;
  result?: string;
  highlights?: string[];
  tags?: string[];
  featured?: boolean;
  thumbnail?: string;
  artifacts?: Record<string, string>;
  learning?: LearningProfile;
  sourceKnowledge?: SourceKnowledgeNote[];
}

export interface CaseStudyRecord {
  id: string;
  page: string;
  title: string;
  subtitle?: string;
  dates?: string;
  location?: string;
  summary: string;
  context?: string[];
  problem?: string[];
  constraints?: string[];
  approach?: string[];
  results?: string[];
  techStack?: string[];
  artifacts?: Record<string, string>;
  nextImprovements?: string[];
  learning?: LearningProfile;
}

export interface ExperienceRecord {
  company: string;
  role: string;
  location: string;
  dates: string;
  highlights: string[];
  learning?: LearningProfile;
}

export interface EducationRecord {
  school: string;
  degree: string;
  location: string;
  dates: string;
  details: string[];
}

export interface SkillGroupRecord {
  group: string;
  items: string[];
}

export interface PortfolioContent {
  name: string;
  headline: string;
  location: string;
  availability: string;
  targetRoleLine: string;
  about: string;
  heroProofBullets: string[];
  impactHighlights: string[];
  links: LinkMap;
  projects: ProjectRecord[];
  caseStudies: CaseStudyRecord[];
  experience: ExperienceRecord[];
  education: EducationRecord[];
  skills: SkillGroupRecord[];
}

export interface CorpusChunk {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  projectId?: string;
  title: string;
  section: string;
  text: string;
  citationLabel: string;
  publicUrl: string;
  keywords: string[];
  roleTags: string[];
  evidenceStrength: EvidenceStrength;
}

export interface GeneratedCorpus {
  generatedAt: string;
  chunkCount: number;
  chunks: CorpusChunk[];
}

export interface RolePreset {
  id: string;
  label: string;
  summary: string;
  recruiterLens: string;
  answerStyle: string;
  priorityProjectIds: string[];
  keywords: string[];
}

export interface SeededQuestion {
  id: string;
  label: string;
  question: string;
  roleIds: string[];
  expectedProjectIds: string[];
  intent: "technical" | "behavioral" | "role-fit" | "comparison";
}

export interface RetrievalMatch {
  chunk: CorpusChunk;
  score: number;
  reasons: string[];
}

export interface RetrievalOptions {
  roleId?: string;
  topK?: number;
  maxPerSource?: number;
}

export interface InterviewTurn {
  role: "user" | "assistant";
  content: string;
}
