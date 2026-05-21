/**
 * Demo MCP server using @modelcontextprotocol/sdk and the Streamable HTTP
 * transport (Express).
 *
 * Streamable HTTP is the transport that replaces the legacy HTTP+SSE pair
 * (`/sse` + `/messages`). It exposes a single endpoint (here `/mcp`) that
 * accepts:
 *
 *   - POST   /mcp -> client to server JSON-RPC; response is either JSON
 *                    or an SSE stream depending on content negotiation.
 *   - GET    /mcp -> long-lived SSE stream for server to client notifications.
 *   - DELETE /mcp -> terminate the MCP session.
 *
 * Each MCP session has its own `StreamableHTTPServerTransport` instance,
 * indexed by the `Mcp-Session-Id` header returned during initialization.
 */

import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { z } from "zod";

import {
  SERVER_NAME,
  SERVER_VERSION,
  addNumbers,
  appInfo,
  buildDemoLogSteps,
  echo,
  explainCodePrompt,
  getServerTime,
  getSystemStatus,
  summarizeTextPrompt,
} from "./tools.js";

// ---------------------------------------------------------------------------
// Configuration via environment variables.
// ---------------------------------------------------------------------------

const HOST = process.env.MCP_HOST ?? "127.0.0.1";
const PORT = Number.parseInt(process.env.MCP_PORT ?? "3000", 10);
const PATH = process.env.MCP_PATH ?? "/mcp";
const LOG_LEVEL = (process.env.MCP_LOG_LEVEL ?? "info").toLowerCase();

const DEFAULT_ORIGINS = `http://localhost:${PORT},http://127.0.0.1:${PORT}`;
const ALLOWED_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS ?? DEFAULT_ORIGINS)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Tiny logger so we have consistent, level-aware output.
// ---------------------------------------------------------------------------

const LEVELS: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const CURRENT_LEVEL = LEVELS[LOG_LEVEL] ?? LEVELS.info;

function log(level: "debug" | "info" | "warn" | "error", msg: string, extra?: unknown): void {
  if ((LEVELS[level] ?? 20) < CURRENT_LEVEL) return;
  const stamp = new Date().toISOString();
  const line = `${stamp} [${level.toUpperCase()}] ${SERVER_NAME}: ${msg}`;
  if (extra !== undefined) {
    // eslint-disable-next-line no-console
    console.log(line, extra);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

// ---------------------------------------------------------------------------
// Build the McpServer and register tools / resources / prompts.
//
// We use a single McpServer instance and reuse it across sessions. The SDK
// connects it to a *new* StreamableHTTPServerTransport per session so each
// client gets its own Mcp-Session-Id and its own SSE stream.
// ---------------------------------------------------------------------------

function buildMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      // Declare the capabilities we actually use. `logging` is needed so
      // `extra.sendNotification({ method: "notifications/message", ... })`
      // from inside `generate_demo_log` is accepted by the SDK's
      // outgoing-capability guard.
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        logging: {},
      },
      instructions:
        "Demo MCP server in TypeScript using Streamable HTTP. Provides toy tools " +
        "(echo, add_numbers, get_server_time, generate_demo_log, get_system_status), " +
        "an `app://info` resource and prompt templates.",
    },
  );

  // ---- Tools -------------------------------------------------------------

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Return the exact text you send. Useful to verify the MCP connection is alive.",
      inputSchema: { text: z.string() },
    },
    async ({ text }) => {
      log("info", `tool=echo text_len=${text.length}`);
      const result = echo(text);
      return { content: [{ type: "text", text: result }] };
    },
  );

  server.registerTool(
    "add_numbers",
    {
      title: "Add numbers",
      description: "Add two numbers and return the sum.",
      inputSchema: { a: z.number(), b: z.number() },
    },
    async ({ a, b }) => {
      log("info", `tool=add_numbers a=${a} b=${b}`);
      const sum = addNumbers(a, b);
      return { content: [{ type: "text", text: String(sum) }] };
    },
  );

  server.registerTool(
    "get_server_time",
    {
      title: "Get server time",
      description: "Return the current server time in ISO 8601, plus UTC and the server's timezone.",
    },
    async () => {
      log("info", "tool=get_server_time");
      const time = getServerTime();
      return { content: [{ type: "text", text: JSON.stringify(time) }] };
    },
  );

  server.registerTool(
    "generate_demo_log",
    {
      title: "Generate demo log",
      description:
        "Simulate a task that produces a progressive log. Emits one MCP log message per step over " +
        "the same Streamable HTTP session and returns the accumulated log.",
      inputSchema: { steps: z.number().int().min(1).max(50) },
    },
    async ({ steps }, extra) => {
      const entries = buildDemoLogSteps(steps);
      const lines: string[] = [];
      for (const e of entries) {
        const line = `[${e.timestamp}] step ${e.step}/${e.total}: ${e.message}`;
        lines.push(line);
        // Stream a log notification on the same SSE response. Clients see
        // it in real time before the final JSON-RPC response arrives.
        await extra.sendNotification({
          method: "notifications/message",
          params: { level: "info", logger: SERVER_NAME, data: line },
        });
        // And a progress notification.
        if (extra._meta?.progressToken !== undefined) {
          await extra.sendNotification({
            method: "notifications/progress",
            params: {
              progressToken: extra._meta.progressToken,
              progress: e.step,
              total: e.total,
            },
          });
        }
      }
      log("info", `tool=generate_demo_log emitted=${lines.length}`);
      return { content: [{ type: "text", text: JSON.stringify({ steps, log: lines }, null, 2) }] };
    },
  );

  server.registerTool(
    "get_system_status",
    {
      title: "Get system status",
      description:
        "Return basic information about this MCP server: language, name, version, transport, " +
        "uptime and exposed capabilities.",
    },
    async () => {
      log("info", "tool=get_system_status");
      const status = getSystemStatus();
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    },
  );

  // ---- Resources ---------------------------------------------------------

  server.registerResource(
    "app-info",
    "app://info",
    {
      title: "Application info",
      description: "High-level metadata about this MCP server.",
      mimeType: "application/json",
    },
    async (uri) => {
      log("info", "resource=app://info read");
      const info = appInfo(PATH);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    },
  );

  // ---- Prompts -----------------------------------------------------------

  server.registerPrompt(
    "summarize_text",
    {
      title: "Summarize text",
      description: "Return a reusable prompt that asks the model to summarize the provided text.",
      argsSchema: { text: z.string() },
    },
    ({ text }) => {
      log("info", `prompt=summarize_text text_len=${text.length}`);
      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text: summarizeTextPrompt(text) },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "explain_code",
    {
      title: "Explain code",
      description: "Return a reusable prompt that asks the model to explain the given code.",
      argsSchema: { code: z.string(), language: z.string().optional() },
    },
    ({ code, language }) => {
      const lang = typeof language === "string" && language ? language : "typescript";
      log("info", `prompt=explain_code lang=${lang} code_len=${code.length}`);
      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text: explainCodePrompt(code, lang) },
          },
        ],
      };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Express app: wires HTTP -> StreamableHTTPServerTransport.
// ---------------------------------------------------------------------------

/**
 * Map of active transports keyed by Mcp-Session-Id.
 *
 * On initialize the SDK assigns a session ID and stores the transport.
 * Every subsequent POST/GET/DELETE looks the transport up by its session
 * ID header and routes to it.
 */
const transports = new Map<string, StreamableHTTPServerTransport>();

const app = express();

// CORS: only allow our configured origins. Browsers send a preflight OPTIONS
// against /mcp; reflect the Mcp-Session-Id header on responses so JS clients
// can read it.
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        // Non-browser clients (curl, mcp-remote, our Python/TS clients).
        return callback(null, true);
      }
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin not allowed: ${origin}`));
    },
    exposedHeaders: ["Mcp-Session-Id"],
    allowedHeaders: ["Content-Type", "Mcp-Session-Id", "MCP-Protocol-Version", "Last-Event-ID"],
  }),
);

// DNS-rebinding protection: validate the Host header against an allow-list.
// Without this, a malicious page in the user's browser could trick the OS
// resolver into pointing a custom domain at 127.0.0.1 and hit this server.
app.use(hostHeaderValidation(["127.0.0.1", "localhost", "[::1]"]));

// Body parsing — the StreamableHTTPServerTransport can either parse the
// body itself or accept a pre-parsed JSON body. We hand it a pre-parsed
// body via `transport.handleRequest(req, res, req.body)`.
app.use(express.json({ limit: "4mb" }));

/**
 * Build a fresh transport+server pair for a brand-new MCP session.
 */
function createNewSession(): { sessionId: string; transport: StreamableHTTPServerTransport } {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      transports.set(sid, transport);
      log("info", `session initialized sid=${sid}`);
    },
    onsessionclosed: (sid) => {
      transports.delete(sid);
      log("info", `session closed sid=${sid}`);
    },
  });

  // Each session has its own McpServer instance. This keeps tool/resource
  // state isolated and means a crash inside one session does not poison
  // another. The McpServer ends up owning the transport via `connect()`.
  const server = buildMcpServer();
  void server.connect(transport).catch((err: unknown) => {
    log("error", `failed to connect server to transport: ${(err as Error).message}`);
  });

  return { sessionId: "", transport };
}

/**
 * Look up an existing transport by Mcp-Session-Id, or create a new one for
 * `initialize` requests that do not have a session yet.
 */
function getOrCreateTransport(req: Request): StreamableHTTPServerTransport | null {
  const sid = req.header("mcp-session-id");

  if (sid && transports.has(sid)) {
    return transports.get(sid)!;
  }

  // No session yet — must be an `initialize` request.
  if (req.method === "POST" && isInitializeRequest(req.body)) {
    log("info", "new session — POST initialize");
    return createNewSession().transport;
  }

  return null;
}

// All three HTTP methods share the same handler: defer to the SDK.
async function handleMcp(req: Request, res: Response): Promise<void> {
  try {
    const transport = getOrCreateTransport(req);
    if (!transport) {
      log("warn", `rejected ${req.method} ${PATH} — missing/invalid Mcp-Session-Id`);
      res.status(400).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message:
            "Bad Request: no valid Mcp-Session-Id and request is not an `initialize` call.",
        },
      });
      return;
    }
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    log("error", `${req.method} ${PATH} failed: ${(err as Error).message}`);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Internal server error" },
      });
    }
  }
}

app.post(PATH, handleMcp);
app.get(PATH, handleMcp);
app.delete(PATH, handleMcp);

// Friendly health check, not part of MCP but useful for monitoring.
app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, server: SERVER_NAME, version: SERVER_VERSION });
});

// ---------------------------------------------------------------------------
// Start.
// ---------------------------------------------------------------------------

function main(): void {
  if (HOST === "0.0.0.0") {
    log(
      "warn",
      "MCP_HOST=0.0.0.0 — the server is reachable from the network. Without authentication " +
        "every tool on this server becomes callable by anyone who can reach the port.",
    );
  }

  const httpServer = app.listen(PORT, HOST, () => {
    log(
      "info",
      `Starting ${SERVER_NAME} v${SERVER_VERSION} on http://${HOST}:${PORT}${PATH} (transport=streamable-http)`,
    );
    log("info", `Allowed origins: ${JSON.stringify(ALLOWED_ORIGINS)}`);
  });

  const shutdown = (signal: string) => {
    log("info", `Received ${signal}, shutting down…`);
    httpServer.close(() => process.exit(0));
    // Force-exit if close hangs.
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
