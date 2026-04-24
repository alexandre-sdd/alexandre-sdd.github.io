import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";

import { loadConfig, type AppConfig } from "./config.js";
import { EvidenceSearchQuerySchema, InterviewRequestSchema } from "./schemas.js";
import { createInterviewService, type LlmService } from "./services/interview-service.js";
import { createOpenAiInterviewService } from "./services/openai-service.js";

export function buildApp(overrides?: Partial<AppConfig>, llmOverride?: LlmService) {
  const config = { ...loadConfig(), ...overrides };
  const app = Fastify({ logger: false });
  const llm =
    llmOverride ??
    (config.useMockResponses
      ? {
          async generate() {
            return {
              answer: "",
              confidence: "low" as const
            };
          },
          async stream() {
            return {
              answer: "",
              confidence: "low" as const
            };
          }
        }
      : createOpenAiInterviewService(config));
  const interviewService = createInterviewService(config, llm);

  app.register(cors, {
    origin: config.corsOrigin === "*" ? true : config.corsOrigin
  });

  app.get("/v1/health", async () => ({
    ok: true,
    mode: config.useMockResponses ? "mock" : "openai",
    model: config.openaiModel
  }));

  app.get("/v1/config", async () => interviewService.getConfigPayload());

  app.get("/v1/evidence/search", async (request, reply) => {
    try {
      const query = EvidenceSearchQuerySchema.parse(request.query);
      return {
        results: interviewService.searchEvidence(query.q, query.roleId, query.topK)
      };
    } catch (error) {
      if (error instanceof ZodError) {
        reply.status(400);
        return {
          error: "Invalid search query",
          details: error.flatten()
        };
      }

      throw error;
    }
  });

  app.post("/v1/interview/respond", async (request, reply) => {
    try {
      const body = InterviewRequestSchema.parse(request.body);
      return await interviewService.answerQuestion(body);
    } catch (error) {
      if (error instanceof ZodError) {
        reply.status(400);
        return {
          error: "Invalid interview payload",
          details: error.flatten()
        };
      }

      request.log.error(error);
      reply.status(500);
      return {
        error: "Failed to generate interview answer"
      };
    }
  });

  app.post("/v1/interview/stream", async (request, reply) => {
    try {
      const body = InterviewRequestSchema.parse(request.body);

      reply.hijack();
      reply.raw.statusCode = 200;
      reply.raw.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      reply.raw.flushHeaders?.();

      const emit = async (event: unknown) => {
        reply.raw.write(`${JSON.stringify(event)}\n`);
        if (typeof (reply.raw as { flush?: () => void }).flush === "function") {
          (reply.raw as { flush: () => void }).flush();
        }
      };

      await interviewService.streamQuestion(body, emit);
      reply.raw.end();
    } catch (error) {
      if (error instanceof ZodError) {
        if (!reply.sent) {
          reply.status(400);
          return {
            error: "Invalid interview payload",
            details: error.flatten()
          };
        }

        reply.raw.write(
          `${JSON.stringify({
            type: "error",
            message: "Invalid interview payload"
          })}\n`
        );
        reply.raw.end();
        return;
      }

      request.log.error(error);

      if (!reply.sent) {
        reply.status(500);
        return {
          error: "Failed to stream interview answer"
        };
      }

      reply.raw.write(
        `${JSON.stringify({
          type: "error",
          message: "Failed to stream interview answer"
        })}\n`
      );
      reply.raw.end();
    }
  });

  return app;
}
