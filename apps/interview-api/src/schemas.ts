import { z } from "zod";

export const InterviewTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000)
});

/**
 * Zod schema for the structured memory object introduced in Phase 3.
 *
 * Clients that support structured memory should send this instead of (or in
 * addition to) `conversationSummary`. When both are present, `memoryState`
 * takes priority in the planner.
 */
export const MemoryStateSchema = z.object({
  activeTopic: z.enum(["education", "experience", "projects", "fit", "technical", "general"]),
  recentSources: z
    .array(
      z.object({
        title: z.string().max(300),
        sourceType: z.string().max(50)
      })
    )
    .max(4),
  askedEntities: z.array(z.string().max(60)).max(12),
  lastIntent: z.enum([
    "education-schools", "education-coursework",
    "experience-list", "experience-specific",
    "project-list", "project-specific",
    "role-fit", "technical-depth",
    "behavioral", "follow-up", "inventory", "general"
  ])
});

export const InterviewRequestSchema = z.object({
  question: z.string().min(8).max(2000),
  roleId: z.string().min(2).optional(),
  history: z.array(InterviewTurnSchema).max(8).optional(),
  /** Legacy string memory. Still accepted for backward compat. */
  conversationSummary: z.string().max(1600).optional(),
  /** Structured memory (Phase 3). Takes priority over conversationSummary. */
  memoryState: MemoryStateSchema.optional(),
  topK: z.number().int().min(3).max(15).optional()
});

export const EvidenceSearchQuerySchema = z.object({
  q: z.string().min(3).max(500),
  roleId: z.string().optional(),
  topK: z.coerce.number().int().min(1).max(15).optional()
});

export type InterviewRequest = z.infer<typeof InterviewRequestSchema>;
