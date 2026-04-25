import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";

import { loadConfig, type AppConfig } from "./config.js";
import { EvidenceSearchQuerySchema, InterviewRequestSchema } from "./schemas.js";
import { createInterviewService, type LlmService } from "./services/interview-service.js";
import { createOpenAiInterviewService } from "./services/openai-service.js";

function parseRateLimitWindow(value: string): number {
  const trimmed = value.trim().toLowerCase();
  const match = /^(\d+)\s*(ms|millisecond|milliseconds|s|sec|second|seconds|m|min|minute|minutes)?$/.exec(trimmed);
  if (!match) return 60_000;

  const amount = Number(match[1]);
  const unit = match[2] ?? "ms";
  if (unit.startsWith("m") && unit !== "ms" && !unit.startsWith("milli")) return amount * 60_000;
  if (unit.startsWith("s")) return amount * 1000;
  return amount;
}

function clientKeyFromRequest(request: { ip: string; headers: Record<string, string | string[] | undefined> }): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return firstForwarded?.split(",")[0]?.trim() || request.ip;
}

export function buildApp(overrides?: Partial<AppConfig>, llmOverride?: LlmService) {
  const config = { ...loadConfig(), ...overrides };
  const rateLimitWindowMs = parseRateLimitWindow(config.rateLimitTimeWindow);
  const rateLimitHits = new Map<string, { count: number; resetAt: number }>();
  const app = Fastify({
    logger: config.requestLogging
      ? {
          level: config.logLevel,
          redact: ["req.headers.authorization", "req.headers.cookie"]
        }
      : false,
    trustProxy: true
  });
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
    origin: (origin, callback) => {
      if (!origin || config.corsOrigins.includes("*") || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    if (config.rateLimitMax <= 0) return;

    const now = Date.now();
    const key = clientKeyFromRequest(request);
    const current = rateLimitHits.get(key);
    const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + rateLimitWindowMs };
    bucket.count += 1;
    rateLimitHits.set(key, bucket);

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    reply.header("x-ratelimit-limit", String(config.rateLimitMax));
    reply.header("x-ratelimit-remaining", String(Math.max(0, config.rateLimitMax - bucket.count)));
    reply.header("x-ratelimit-reset", String(retryAfter));

    if (bucket.count > config.rateLimitMax) {
      reply.header("retry-after", String(retryAfter));
      await reply.status(429).send({
        error: "Rate limit exceeded",
        message: `Too many requests. Try again in ${retryAfter} seconds.`,
        retryAfter
      });
    }
  });

  app.get("/", async () => ({
    ok: true,
    service: "portfolio-interview-api",
    mode: config.useMockResponses ? "mock" : "openai",
    model: config.openaiModel,
    endpoints: {
      health: "/v1/health",
      config: "/v1/config",
      evidenceSearch: "/v1/evidence/search?q=ai%20project",
      respond: "/v1/interview/respond",
      stream: "/v1/interview/stream"
    }
  }));

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
        const maybeFlush = (reply.raw as unknown as { flush?: () => void }).flush;
        if (typeof maybeFlush === "function") {
          maybeFlush.call(reply.raw);
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
