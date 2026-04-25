import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AppConfig {
  host: string;
  port: number;
  corsOrigins: string[];
  openaiApiKey?: string;
  openaiModel: string;
  openaiBaseUrl?: string;
  useMockResponses: boolean;
  retrievalTopK: number;
  rateLimitMax: number;
  rateLimitTimeWindow: string;
  requestLogging: boolean;
  logLevel: string;
}

let envLoaded = false;

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) return;

    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function loadLocalEnvFiles(): void {
  if (envLoaded) return;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../../");

  loadEnvFile(path.join(repoRoot, ".env"));
  loadEnvFile(path.join(repoRoot, "apps/interview-api/.env"));

  envLoaded = true;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(): AppConfig {
  loadLocalEnvFiles();

  const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
  const allowWildcardCors = readBoolean(process.env.ALLOW_WILDCARD_CORS, false);
  const defaultCorsOrigins = [
    "https://alexandre-sdd.github.io",
    "http://localhost:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ];
  const configuredCorsOrigins = readCsv(process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN, defaultCorsOrigins);

  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 8787),
    corsOrigins: configuredCorsOrigins.includes("*") && !allowWildcardCors ? defaultCorsOrigins : configuredCorsOrigins,
    openaiApiKey,
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
    openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || undefined,
    useMockResponses: readBoolean(process.env.MOCK_INTERVIEW_RESPONSES, !openaiApiKey),
    retrievalTopK: readNumber(process.env.RETRIEVAL_TOP_K, 6),
    rateLimitMax: readNumber(process.env.RATE_LIMIT_MAX, 40),
    rateLimitTimeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
    requestLogging: readBoolean(process.env.REQUEST_LOGGING, process.env.NODE_ENV === "production"),
    logLevel: process.env.LOG_LEVEL ?? "info"
  };
}
