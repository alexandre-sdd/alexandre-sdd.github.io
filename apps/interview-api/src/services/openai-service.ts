import OpenAI from "openai";
import type { RetrievalMatch, RolePreset, InterviewTurn } from "@portfolio/interview-core";

import type { AppConfig } from "../config.js";
import type { LlmAnswer, LlmGenerationInput, LlmService } from "./interview-service.js";

function buildEvidenceBlock(evidence: RetrievalMatch[]): string {
  return evidence
    .map(
      (match, index) =>
        `[E${index + 1}] title=${match.chunk.title}\n` +
        `sourceType=${match.chunk.sourceType}\n` +
        `section=${match.chunk.section}\n` +
        `projectId=${match.chunk.projectId ?? "n/a"}\n` +
        `citation=${match.chunk.citationLabel}\n` +
        `text=${match.chunk.text}`
    )
    .join("\n\n");
}

function buildHistoryBlock(history: InterviewTurn[]): string {
  if (history.length === 0) return "No prior turns.";
  return history.map((turn, index) => `${index + 1}. ${turn.role.toUpperCase()}: ${turn.content}`).join("\n");
}

function systemPrompt(role: RolePreset): string {
  return [
    "You are generating interview answers for Alexandre Sepulveda de Dietrich.",
    "Answer in first person as Alexandre.",
    "Use only the supplied evidence blocks. Do not invent metrics, dates, technologies, outcomes, or confidential details.",
    "If the evidence is incomplete, say that briefly instead of guessing.",
    "Answer like a strong candidate in a live recruiter or technical screen.",
    "Start with the direct answer, then anchor it in one concrete example, then explain the decision, tradeoff, result, or learning an interviewer would care about.",
    "For behavioral questions, use a concise situation-action-result shape without labeling it.",
    "For technical questions, include the architecture, constraint, evaluation, or failure mode that shows judgment.",
    "For role-fit questions, connect the evidence directly to the target role.",
    "If asked for a range or all projects, group the work into clear categories instead of walking through cards one by one.",
    "Write natural interview-ready prose, not JSON.",
    "Do not use markdown, bullet points, or decorative formatting.",
    "Keep normal answers around 100 to 170 words. Broad overview answers may be slightly longer.",
    `Recruiter lens: ${role.recruiterLens}`,
    `Preferred answer style: ${role.answerStyle}`
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

function confidenceFromAnswer(answer: string): "high" | "medium" | "low" {
  if (answer.length >= 220) return "high";
  if (answer.length >= 120) return "medium";
  return "low";
}

export function createOpenAiInterviewService(config: AppConfig): LlmService {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required when mock mode is disabled.");
  }

  const client = new OpenAI({
    apiKey: config.openaiApiKey,
    baseURL: config.openaiBaseUrl
  });

  async function generate(input: LlmGenerationInput): Promise<LlmAnswer> {
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

    const answer = response.output_text?.trim() || "";
    return {
      answer,
      confidence: confidenceFromAnswer(answer)
    };
  }

  async function stream(
    input: LlmGenerationInput,
    onToken: (token: string) => Promise<void> | void
  ): Promise<LlmAnswer> {
    const stream = client.responses.stream({
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

    let answer = "";

    for await (const event of stream) {
      if (event.type === "response.output_text.delta" && event.delta) {
        answer += event.delta;
        await onToken(event.delta);
      }
    }

    const finalResponse = await stream.finalResponse();
    const finalAnswer = finalResponse.output_text?.trim() || answer.trim();

    return {
      answer: finalAnswer,
      confidence: confidenceFromAnswer(finalAnswer)
    };
  }

  return {
    generate,
    stream
  };
}
