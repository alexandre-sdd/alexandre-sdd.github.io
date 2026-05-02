export { buildCorpusFromContent, loadGeneratedCorpus, loadPortfolioContent, writeGeneratedCorpus } from "./corpus.js";
export { ENTITY_ALIASES, EXPERIENCE_ENTITIES, SCHOOL_ENTITIES } from "./entity-aliases.js";
export { DEFAULT_ROLE_ID, ROLE_PRESETS, ROLE_PRESET_MAP, SEEDED_QUESTIONS } from "./presets.js";
export { retrieveEvidence } from "./retrieval.js";
export type { KnownEntity } from "./entity-aliases.js";
export type {
  CorpusChunk,
  EvidenceLevel,
  GeneratedCorpus,
  InterviewTurn,
  LearningProfile,
  PortfolioContent,
  RetrievalMatch,
  RetrievalOptions,
  RolePreset,
  SeededQuestion,
  SourceKnowledgeNote,
  SourceType
} from "./types.js";
