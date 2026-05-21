/**
 * Demo MCP client connecting to the TypeScript server via Streamable HTTP.
 *
 * The client uses the same wire protocol as MCP Inspector and Claude
 * Desktop's `mcp-remote` bridge: HTTP POST + GET against a single `/mcp`
 * endpoint, optionally upgrading the response to a `text/event-stream` for
 * streaming notifications.
 *
 * Run it with the server already listening on
 * http://127.0.0.1:3000/mcp:
 *
 *   npm run client
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_URL = process.env.MCP_SERVER_URL ?? "http://127.0.0.1:3000/mcp";

function log(msg: string, extra?: unknown): void {
  const stamp = new Date().toISOString();
  if (extra !== undefined) {
    // eslint-disable-next-line no-console
    console.log(`${stamp} [INFO] client: ${msg}`, extra);
  } else {
    // eslint-disable-next-line no-console
    console.log(`${stamp} [INFO] client: ${msg}`);
  }
}

async function main(): Promise<void> {
  log(`Connecting to ${SERVER_URL} ...`);

  const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL));
  const client = new Client({ name: "demo-typescript-client", version: "0.1.0" });

  // Install a handler for streamed log notifications before connecting.
  // The server's `generate_demo_log` tool emits one of these per step.
  client.setNotificationHandler(LoggingMessageNotificationSchema, async (notif) => {
    const data = notif.params.data;
    const message = typeof data === "string" ? data : JSON.stringify(data);
    log(`[server-log] ${notif.params.level}: ${message}`);
  });

  await client.connect(transport);

  const sessionId = transport.sessionId;
  log(`Connected. Mcp-Session-Id: ${sessionId ?? "<stateless>"}`);

  // Ask the server to forward debug-level logs. Some MCP servers don't
  // implement `logging/setLevel`; that's fine, log notifications will
  // still be delivered with their default level.
  try {
    await client.setLoggingLevel("debug");
  } catch {
    // server doesn't expose logging/setLevel — proceed silently.
  }

  const tools = (await client.listTools()).tools;
  const resources = (await client.listResources()).resources;
  const prompts = (await client.listPrompts()).prompts;
  log(`Tools:     ${JSON.stringify(tools.map((t) => t.name))}`);
  log(`Resources: ${JSON.stringify(resources.map((r) => r.uri))}`);
  log(`Prompts:   ${JSON.stringify(prompts.map((p) => p.name))}`);

  // echo
  const echoResult = await client.callTool({ name: "echo", arguments: { text: "hola MCP" } });
  log(`echo -> ${JSON.stringify(echoResult.content)}`);

  // add_numbers
  const addResult = await client.callTool({
    name: "add_numbers",
    arguments: { a: 2, b: 3.5 },
  });
  log(`add_numbers(2, 3.5) -> ${JSON.stringify(addResult.content)}`);

  // get_server_time
  const timeResult = await client.callTool({ name: "get_server_time", arguments: {} });
  log(`get_server_time -> ${JSON.stringify(timeResult.content)}`);

  // get_system_status
  const statusResult = await client.callTool({ name: "get_system_status", arguments: {} });
  log(`get_system_status -> ${JSON.stringify(statusResult.content)}`);

  // generate_demo_log (streamed log lines arrive via the notification handler).
  log("generate_demo_log(steps=4) — streaming log lines:");
  const demoResult = await client.callTool({
    name: "generate_demo_log",
    arguments: { steps: 4 },
  });
  log(`generate_demo_log -> ${JSON.stringify(demoResult.content)}`);

  // Read app://info
  const info = await client.readResource({ uri: "app://info" });
  for (const item of info.contents) {
    if ("text" in item && typeof item.text === "string") {
      log(`resource app://info -> ${item.text}`);
    }
  }

  // Prompts
  const summarize = await client.getPrompt({
    name: "summarize_text",
    arguments: { text: "MCP unifies how AI apps talk to external data and tools." },
  });
  log(`prompt summarize_text -> ${JSON.stringify(summarize.messages)}`);

  const explain = await client.getPrompt({
    name: "explain_code",
    arguments: {
      code: 'function add(a: number, b: number) {\n  return a + b;\n}\n',
      language: "typescript",
    },
  });
  log(`prompt explain_code -> ${JSON.stringify(explain.messages)}`);

  // Clean shutdown — DELETE /mcp.
  await transport.terminateSession();
  await client.close();
  log("Done.");
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Client failed:", err);
  process.exitCode = 1;
});
