export { buildCorpusFromContent, loadGeneratedCorpus, loadPortfolioContent, writeGeneratedCorpus } from "./corpus.js";
export { DEFAULT_ROLE_ID, ROLE_PRESETS, ROLE_PRESET_MAP, SEEDED_QUESTIONS } from "./presets.js";
export { retrieveEvidence } from "./retrieval.js";
export type {
  CorpusChunk,
  GeneratedCorpus,
  InterviewTurn,
  PortfolioContent,
  RetrievalMatch,
  RetrievalOptions,
  RolePreset,
  SeededQuestion
} from "./types.js";
