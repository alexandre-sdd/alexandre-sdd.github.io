import { z } from "zod";

export const InterviewTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000)
});

export const InterviewRequestSchema = z.object({
  question: z.string().min(8).max(2000),
  roleId: z.string().min(2).optional(),
  history: z.array(InterviewTurnSchema).max(8).optional(),
  conversationSummary: z.string().max(1600).optional(),
  topK: z.number().int().min(3).max(15).optional()
});

export const EvidenceSearchQuerySchema = z.object({
  q: z.string().min(3).max(500),
  roleId: z.string().optional(),
  topK: z.coerce.number().int().min(1).max(15).optional()
});

export type InterviewRequest = z.infer<typeof InterviewRequestSchema>;
