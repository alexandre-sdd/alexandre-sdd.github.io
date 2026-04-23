import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AppConfig {
  host: string;
  port: number;
  corsOrigin: string;
  openaiApiKey?: string;
  openaiModel: string;
  openaiBaseUrl?: string;
  useMockResponses: boolean;
  retrievalTopK: number;
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

export function loadConfig(): AppConfig {
  loadLocalEnvFiles();

  const openaiApiKey = process.env.OPENAI_API_KEY?.trim();

  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 8787),
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    openaiApiKey,
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
    openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || undefined,
    useMockResponses: readBoolean(process.env.MOCK_INTERVIEW_RESPONSES, !openaiApiKey),
    retrievalTopK: Number(process.env.RETRIEVAL_TOP_K ?? 6)
  };
}
