import OpenAI from "openai";
import type { RetrievalMatch, RolePreset, InterviewTurn } from "@portfolio/interview-core";

import type { AppConfig } from "../config.js";
import type { LlmGenerationInput, LlmService, LlmStructuredAnswer } from "./interview-service.js";

function buildEvidenceBlock(evidence: RetrievalMatch[]): string {
  return evidence
    .map(
      (match, index) =>
        `[E${index + 1}] id=${match.chunk.id}\n` +
        `title=${match.chunk.title}\n` +
        `section=${match.chunk.section}\n` +
        `projectId=${match.chunk.projectId ?? "n/a"}\n` +
        `citation=${match.chunk.citationLabel}\n` +
        `sourceType=${match.chunk.sourceType}\n` +
        `text=${match.chunk.text}`
    )
    .join("\n\n");
}

function buildHistoryBlock(history: InterviewTurn[]): string {
  if (history.length === 0) return "No prior turns.";
  return history.map((turn, index) => `${index + 1}. ${turn.role.toUpperCase()}: ${turn.content}`).join("\n");
}

function extractJsonObject(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1);
}

function safeParseResponse(text: string, fallbackEvidence: RetrievalMatch[]): LlmStructuredAnswer {
  const candidate = extractJsonObject(text);
  if (!candidate) {
    return {
      answer: text.trim(),
      citationIds: fallbackEvidence.slice(0, 3).map((match) => match.chunk.id),
      projectIds: fallbackEvidence
        .map((match) => match.chunk.projectId)
        .filter((projectId): projectId is string => Boolean(projectId))
        .slice(0, 3),
      followUps: [],
      confidence: "low"
    };
  }

  try {
    const parsed = JSON.parse(candidate) as {
      answer?: string;
      citation_ids?: string[];
      project_ids?: string[];
      follow_ups?: string[];
      confidence?: "high" | "medium" | "low";
    };

    return {
      answer: parsed.answer?.trim() || text.trim(),
      citationIds: Array.isArray(parsed.citation_ids) ? parsed.citation_ids : fallbackEvidence.slice(0, 3).map((match) => match.chunk.id),
      projectIds: Array.isArray(parsed.project_ids) ? parsed.project_ids : [],
      followUps: Array.isArray(parsed.follow_ups) ? parsed.follow_ups : [],
      confidence: parsed.confidence ?? "medium"
    };
  } catch {
    return {
      answer: text.trim(),
      citationIds: fallbackEvidence.slice(0, 3).map((match) => match.chunk.id),
      projectIds: [],
      followUps: [],
      confidence: "low"
    };
  }
}

function systemPrompt(role: RolePreset): string {
  return [
    "You are generating interview answers for Alexandre Sepulveda de Dietrich.",
    "Answer in first person as Alexandre.",
    "Use only the supplied evidence blocks. Do not invent metrics, dates, technologies, or outcomes.",
    "If evidence is incomplete, say so briefly instead of guessing.",
    `Recruiter lens: ${role.recruiterLens}`,
    `Preferred answer style: ${role.answerStyle}`,
    "Return valid JSON with this exact shape:",
    "{",
    '  "answer": "string",',
    '  "citation_ids": ["chunk-id"],',
    '  "project_ids": ["project-id"],',
    '  "follow_ups": ["string"],',
    '  "confidence": "high" | "medium" | "low"',
    "}",
    "The answer should be concise but specific and grounded in named projects."
  ].join("\n");
}

function userPrompt(input: LlmGenerationInput): string {
  return [
    `Question: ${input.question}`,
    `Role preset: ${input.role.label}`,
    `Role summary: ${input.role.summary}`,
    "Conversation history:",
    buildHistoryBlock(input.history),
    "Evidence:",
    buildEvidenceBlock(input.evidence)
  ].join("\n\n");
}

export function createOpenAiInterviewService(config: AppConfig): LlmService {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required when mock mode is disabled.");
  }

  const client = new OpenAI({
    apiKey: config.openaiApiKey,
    baseURL: config.openaiBaseUrl
  });

  return {
    async generate(input: LlmGenerationInput): Promise<LlmStructuredAnswer> {
      const response = await client.responses.create({
        model: config.openaiModel,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt(input.role) }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt(input) }]
          }
        ]
      });

      const text = response.output_text?.trim() || "";
      return safeParseResponse(text, input.evidence);
    }
  };
}
