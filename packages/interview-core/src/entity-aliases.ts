/**
 * entity-aliases.ts
 *
 * Single registry of known named entities in the portfolio.
 *
 * Motivation: entity names appear in user questions spelled many different ways
 * ("Centrale", "CentraleSupelec", "Supélec", "Columbia", "MSBA", "Chanel", etc.).
 * Centralising aliases here means the planner and retrieval policy always use the
 * same normalised list instead of scattering regex variants across service logic.
 *
 * Usage:
 *   import { ENTITY_ALIASES, SCHOOL_ENTITIES, EXPERIENCE_ENTITIES } from "@portfolio/interview-core";
 *   const entities = extractEntities(question); // → ["Columbia", "CentraleSupelec"]
 */

/** Canonical handle for each named entity in the portfolio. */
export type KnownEntity =
  | "Columbia"
  | "CentraleSupelec"
  | "CHANEL"
  | "SIGMA"
  | "CUIMC"
  | "Nantes";

/**
 * Alias lists for named entity recognition.
 *
 * Values are the original-case strings used in questions and content.
 * The extractor normalises both sides to lowercase at match time, so
 * capitalisation here is for readability and query-hint generation only.
 *
 * Design notes:
 * - "CS" is intentionally omitted from CentraleSupelec to avoid collisions
 *   with "CS degree" / "CS background" — the longer aliases suffice for routing.
 * - "Advanced Analytics" maps to CHANEL (name of their internal analytics team).
 * - "respiratory" maps to Nantes (the Nantes University Hospital project
 *   involved respiratory data; it is the most distinctive content keyword).
 */
export const ENTITY_ALIASES: Record<KnownEntity, string[]> = {
  Columbia: ["Columbia", "Columbia University", "MSBA", "Business Analytics"],
  CentraleSupelec: ["Centrale", "CentraleSupelec", "Centrale Supelec", "Supelec"],
  CHANEL: ["Chanel", "CHANEL", "CRAFT", "Advanced Analytics"],
  SIGMA: ["Sigma", "SIGMA", "SIGMA Group", "Commercial Excellence"],
  CUIMC: ["CUIMC", "Columbia Medical", "Columbia University Irving Medical Center"],
  Nantes: ["Nantes", "Nantes University Hospital", "hospital in Nantes", "respiratory"]
};

/**
 * Entities whose questions should route to the `education` source type.
 * "What about Columbia and CentraleSupelec?" → sourceTypes = ["education"]
 */
export const SCHOOL_ENTITIES: ReadonlySet<KnownEntity> = new Set(["Columbia", "CentraleSupelec"]);

/**
 * Entities whose questions should route to the `experience` source type.
 * "When were you at CHANEL?" → sourceTypes = ["experience", "case-study"]
 */
export const EXPERIENCE_ENTITIES: ReadonlySet<KnownEntity> = new Set(["CHANEL", "SIGMA", "CUIMC", "Nantes"]);
