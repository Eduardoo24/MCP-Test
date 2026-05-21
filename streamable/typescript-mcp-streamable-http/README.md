# TypeScript MCP server + client — Streamable HTTP

Demo MCP server and client written in TypeScript on top of the official
[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).
The server uses **Streamable HTTP** (single `/mcp` endpoint), which is the
transport that replaced the legacy HTTP+SSE pair (`/sse` + `/messages`).

```
streamable/typescript-mcp-streamable-http
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── server.ts   # Express + StreamableHTTPServerTransport
│   ├── client.ts   # Client + StreamableHTTPClientTransport
│   └── tools.ts    # Pure tool logic (unit tested)
└── tests/
    └── basic.test.ts
```

Same set of capabilities as the Python sibling:

| Kind     | Name                | What it does                                                                        |
|----------|---------------------|-------------------------------------------------------------------------------------|
| tool     | `echo`              | Returns the same text. Connectivity smoke-test.                                     |
| tool     | `add_numbers`       | Sum two numbers (validates that both inputs are numeric).                           |
| tool     | `get_server_time`   | Current server time in ISO 8601 + UTC + local timezone.                             |
| tool     | `generate_demo_log` | Simulates a multi-step task, streaming log notifications.                           |
| tool     | `get_system_status` | Server name, version, transport, uptime, exposed capabilities.                      |
| resource | `app://info`        | High-level metadata about the server.                                               |
| prompt   | `summarize_text`    | Reusable prompt asking the model to summarize a text faithfully.                    |
| prompt   | `explain_code`      | Reusable prompt asking the model to explain a snippet of code.                      |

## Requirements

* Node.js 18.17+ (Node 20+ recommended). The SDK uses ESM and `node:crypto`.
* `npm` (or pnpm/yarn — scripts use npm syntax).

## Setup

```bash
# From this folder:
npm install
```

## Run the server

```bash
npm run dev       # tsx watch — auto-reload on file changes
# or
npm run server    # one-shot tsx run
# or, after `npm run build`:
npm start
```

The server listens on `http://127.0.0.1:3000/mcp` and prints log lines on
startup, on every new MCP session, on every tool call and on every error.

Override host/port/path through environment variables (see
`.env.example`)::

```bash
MCP_HOST=127.0.0.1 MCP_PORT=3000 MCP_PATH=/mcp npm run server
```

## Run the client

In a separate terminal, with the server already running:

```bash
npm run client
```

The client connects via Streamable HTTP, initializes the MCP session,
lists tools/resources/prompts, calls every tool (including the streamed
`generate_demo_log`) and reads `app://info`.

## Run the tests

```bash
npm test
```

The tests cover the pure tool logic (`src/tools.ts`). The Streamable HTTP
transport itself is exercised by running `npm run client` against
`npm run server` (or by pointing MCP Inspector at the same URL).

## Streamable HTTP — what the server does

* Single endpoint: `POST /mcp`, `GET /mcp`, `DELETE /mcp`.
* `POST /mcp` carries JSON-RPC messages. The server replies with either
  `application/json` or `text/event-stream` (SSE), depending on the
  `Accept` header and on whether the response needs streaming.
* `GET /mcp` opens a long-lived SSE stream for server-initiated
  notifications.
* `DELETE /mcp` terminates the MCP session.
* The first `POST /mcp` (with an `initialize` request body and no
  `Mcp-Session-Id` header) makes the server allocate a new session and
  return its UUID in the `Mcp-Session-Id` response header. The client
  echoes that header on every subsequent request.
* DNS-rebinding protection is enabled via
  `hostHeaderValidation(['127.0.0.1', 'localhost', '[::1]'])`, plus a
  configurable `MCP_ALLOWED_ORIGINS` CORS allow-list.

## Security notes

* The server binds to `127.0.0.1` by default. Setting `MCP_HOST=0.0.0.0`
  exposes every tool to your LAN — only do it behind an authenticated
  reverse proxy.
* This demo has **no authentication**. Do not run it on a public IP.
* For production, see `../docs/claude-desktop.md` (Scenario C).
