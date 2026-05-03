/**
 * answer-policy.ts
 *
 * Translates a `PlannedInterviewTurn` into focused answer instructions for
 * the OpenAI generation step.
 *
 * ## Why this exists
 *
 * The system prompt in `openai-service.ts` carries many static rules that
 * cover all intents at once. For specific intents — especially education
 * routing, entity-specific experience, and role-fit ordering — those rules
 * can conflict or be over-ridden by the model's priors.
 *
 * `buildAnswerPolicyGuidance` produces a short, precise constraint block
 * injected into the user prompt for the current turn only. Because it is
 * derived from the planner output, it is always coherent with the source-type
 * filter and entity selection already applied upstream.
 *
 * ## Testing
 *
 * The function is a pure string transform on the plan. Integration-level
 * coverage comes from the existing `app.test.ts` OpenAI fallback tests.
 * Unit tests are in `answer-policy.test.ts`.
 */

import type { PlannedInterviewTurn } from "./intent-planner.js";

/**
 * Produce focused per-turn instructions for the answer generation step.
 *
 * Returns a non-empty string when the intent warrants explicit override of the
 * general system-prompt rules; returns an empty string for intents where the
 * system prompt is already sufficient (general, technical-depth, behavioral).
 *
 * @example
 * // education-schools intent
 * buildAnswerPolicyGuidance(plan)
 * // → "Answer with school names, degrees, and dates only. ..."
 *
 * // experience-specific + CHANEL entity
 * buildAnswerPolicyGuidance(plan)
 * // → "Lead with CHANEL evidence. Include the date range if present. ..."
 */
export function buildAnswerPolicyGuidance(plan: PlannedInterviewTurn): string {
  const lines: string[] = [];

  switch (plan.intent) {
    case "education-schools":
      lines.push("This question asks specifically which schools were attended.");
      lines.push("Answer with school names, degrees, locations, and dates only.");
      lines.push("Do not mention projects, internships, or coursework categories in this answer.");
      lines.push("Keep the answer to 2–3 sentences.");
      break;

    case "education-coursework":
      lines.push("This question asks about specific coursework or classes.");
      lines.push("Lead with course titles and what was covered.");
      lines.push("Do not pivot to project applications or work experience unless the interviewer asks.");
      if (plan.entities.includes("CentraleSupelec")) {
        lines.push("Prioritise CentraleSupélec coursework evidence over Columbia coursework in this answer.");
      }
      if (plan.entities.includes("Columbia")) {
        lines.push("Prioritise Columbia coursework evidence in this answer.");
      }
      break;

    case "experience-list":
      lines.push("This question asks for a list of work experiences.");
      lines.push("Name each experience with company name and role. Keep each to one sentence.");
      lines.push("Do not cite education as primary support for a work-experience question.");
      break;

    case "experience-specific": {
      const entityNames = plan.entities.join(", ");
      if (entityNames) {
        lines.push(`This question asks about ${entityNames} specifically.`);
        lines.push(`Lead with ${entityNames} evidence as the primary source.`);
      }
      lines.push("Include the date range if the evidence contains it.");
      lines.push("Do not use unrelated projects or education as the primary answer.");
      break;
    }

    case "project-list":
      lines.push("This question asks for an overview of projects.");
      lines.push("Group projects by theme (e.g. AI systems, analytics, optimization) rather than listing them one by one.");
      lines.push("Name each project and give one sentence on what it demonstrates.");
      break;

    case "role-fit":
      lines.push("This question asks about fit for a role or background breadth.");
      lines.push("Lead with work experience evidence, then project evidence, then coursework as foundation.");
      lines.push("Do not lead with education for a role-fit question.");
      break;

    case "follow-up":
      lines.push("This is a vague continuation ('what else', 'go on', 'anything else').");
      lines.push("Stay in the active topic. Do not restart with a project overview or general framing.");
      lines.push("Add the next piece of evidence rather than summarising what was already said.");
      break;

    case "inventory":
      lines.push("This question asks for a complete overview of all work.");
      lines.push("Group into clear categories (AI/product, analytics, optimization/research).");
      lines.push("Do not walk through projects one by one — group and label them.");
      break;

    default:
      // general, technical-depth, behavioral: system prompt rules are sufficient
      break;
  }

  return lines.join(" ");
}

/**
 * Return the source types that are allowed to appear as evidence chips for
 * the given answer policy.
 *
 * Used by `buildSourceDisplay` in Phase 5 to hard-gate which chips are shown.
 * Returns `null` when no filtering should be applied (all types allowed).
 */
export function chipSourceTypeFilter(plan: PlannedInterviewTurn): Set<string> | null {
  const { allowCourseworkSupport, allowProjectSupport } = plan.answerPolicy;

  // Only filter when the policy explicitly disallows a category.
  // If both are allowed, return null (no hard gate).
  if (allowCourseworkSupport && allowProjectSupport) return null;

  const allowed = new Set<string>(["experience", "overview", "skills"]);
  if (allowProjectSupport) {
    allowed.add("project");
    allowed.add("case-study");
  }
  if (allowCourseworkSupport) {
    allowed.add("education");
  }
  // Always allow the primary intent's own source types
  for (const st of plan.sourceTypes) {
    allowed.add(st);
  }

  return allowed;
}
