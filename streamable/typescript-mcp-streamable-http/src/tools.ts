/**
 * Pure tool logic for the demo MCP server.
 *
 * These functions hold the actual business logic of each tool, kept
 * transport-agnostic so they can be unit-tested without spinning up the
 * HTTP server. `server.ts` only wires them into MCP.
 */

export const SERVER_NAME = "demo-typescript-streamable-http";
export const SERVER_VERSION = "0.1.0";
export const SERVER_LANGUAGE = "typescript";
export const SERVER_TRANSPORT = "streamable-http";

export const TOOL_NAMES = [
  "echo",
  "add_numbers",
  "get_server_time",
  "generate_demo_log",
  "get_system_status",
] as const;

export const RESOURCE_URIS = ["app://info"] as const;

export const PROMPT_NAMES = ["summarize_text", "explain_code"] as const;

// Captured at module-load time so `get_system_status` can compute uptime.
const SERVER_START_MS = Date.now();

export function echo(text: string): string {
  if (typeof text !== "string") {
    throw new Error("`text` must be a string");
  }
  return text;
}

export function addNumbers(a: number, b: number): number {
  for (const [name, value] of [
    ["a", a],
    ["b", b],
  ] as const) {
    if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
      throw new Error(`\`${name}\` must be a finite number`);
    }
  }
  return a + b;
}

export interface ServerTime {
  iso: string;
  utc: string;
  timezone: string;
}

export function getServerTime(): ServerTime {
  const now = new Date();
  // Best-effort detection of the host's IANA timezone (e.g. "Europe/Madrid").
  let timezone = "UTC";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    timezone = "UTC";
  }
  return {
    iso: now.toISOString(),
    utc: now.toISOString(),
    timezone,
  };
}

export interface DemoLogStep {
  step: number;
  total: number;
  message: string;
  timestamp: string;
}

export function buildDemoLogSteps(steps: number): DemoLogStep[] {
  if (!Number.isInteger(steps)) {
    throw new Error("`steps` must be an integer");
  }
  if (steps < 1 || steps > 50) {
    throw new Error("`steps` must be between 1 and 50");
  }
  const out: DemoLogStep[] = [];
  for (let i = 1; i <= steps; i++) {
    out.push({
      step: i,
      total: steps,
      message: `Processing step ${i}/${steps}`,
      timestamp: new Date().toISOString(),
    });
  }
  return out;
}

export interface SystemStatus {
  language: string;
  name: string;
  version: string;
  transport: string;
  uptime_seconds: number;
  tools: string[];
  resources: string[];
  prompts: string[];
}

export function getSystemStatus(): SystemStatus {
  const uptimeSeconds = Math.round(((Date.now() - SERVER_START_MS) / 1000) * 1000) / 1000;
  return {
    language: SERVER_LANGUAGE,
    name: SERVER_NAME,
    version: SERVER_VERSION,
    transport: SERVER_TRANSPORT,
    uptime_seconds: uptimeSeconds,
    tools: [...TOOL_NAMES],
    resources: [...RESOURCE_URIS],
    prompts: [...PROMPT_NAMES],
  };
}

export interface AppInfo {
  name: string;
  language: string;
  version: string;
  transport: string;
  endpoint: string;
  tools: string[];
  resources: string[];
  prompts: string[];
}

export function appInfo(endpointPath: string = "/mcp"): AppInfo {
  return {
    name: SERVER_NAME,
    language: SERVER_LANGUAGE,
    version: SERVER_VERSION,
    transport: SERVER_TRANSPORT,
    endpoint: endpointPath,
    tools: [...TOOL_NAMES],
    resources: [...RESOURCE_URIS],
    prompts: [...PROMPT_NAMES],
  };
}

export function summarizeTextPrompt(text: string): string {
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("`text` must be a non-empty string");
  }
  return (
    "Please produce a concise, faithful summary of the text below.\n" +
    "Keep it under 5 sentences, preserve the original meaning, and do not " +
    "invent facts that are not present in the text.\n\n" +
    "---BEGIN TEXT---\n" +
    `${text}\n` +
    "---END TEXT---"
  );
}

export function explainCodePrompt(code: string, language: string = "typescript"): string {
  if (typeof code !== "string" || code.trim() === "") {
    throw new Error("`code` must be a non-empty string");
  }
  const lang = typeof language === "string" && language.trim() !== "" ? language : "unknown";
  return (
    `Explain the following ${lang} code as if you were teaching a ` +
    "junior engineer. Cover:\n" +
    "1. What the code does at a high level.\n" +
    "2. The role of each major construct or function.\n" +
    "3. Any non-obvious behavior, edge cases or potential bugs.\n\n" +
    `\`\`\`${lang}\n${code}\n\`\`\``
  );
}
