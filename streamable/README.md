# MCP Streamable HTTP demo

Two equivalent Model Context Protocol servers — one in **Python**, one in
**TypeScript** — both using **Streamable HTTP** as transport, plus their
matching clients, unit tests and documentation.

```
streamable/
├── README.md                        <- you are here
├── python-mcp-streamable-http/      <- FastMCP, transport = streamable-http
│   ├── pyproject.toml
│   ├── README.md
│   ├── .env.example
│   ├── src/
│   │   ├── server.py
│   │   ├── client.py
│   │   └── tools.py
│   └── tests/test_basic.py
├── typescript-mcp-streamable-http/  <- @modelcontextprotocol/sdk + Express
│   ├── package.json
│   ├── tsconfig.json
│   ├── README.md
│   ├── .env.example
│   ├── src/
│   │   ├── server.ts
│   │   ├── client.ts
│   │   └── tools.ts
│   └── tests/basic.test.ts
└── docs/
    ├── mcp-concepts.md         <- host, client, server, tools, resources, prompts, JSON-RPC flow
    ├── streamable-http.md      <- the transport itself: endpoints, sessions, headers, security
    ├── claude-desktop.md       <- three ways to plug these servers into Claude Desktop
    └── troubleshooting.md      <- the 15 most common failure modes
```

## 1. What is MCP?

**MCP (Model Context Protocol)** is an open standard that lets AI
applications connect to external **tools, data sources and prompt
templates** through a single, model-agnostic wire protocol. It plays
the same role for AI assistants that LSP plays for code editors:
hosts implement it once, servers expose capabilities, and every host
gets every server for free.

A few terms (full glossary in [`docs/mcp-concepts.md`](./docs/mcp-concepts.md)):

* **Host** — the app the user actually interacts with (Claude Desktop,
  Cursor, your custom agent).
* **MCP client** — a thin component embedded in the host, opens one
  connection per server, speaks the MCP wire format.
* **MCP server** — a standalone process that exposes capabilities to
  clients. The two demos in this repo are MCP servers.
* **Tool** — a callable function. The model decides when to invoke it.
  *Examples here:* `echo`, `add_numbers`, `get_server_time`,
  `generate_demo_log`, `get_system_status`.
* **Resource** — a read-only document addressed by URI. The host can
  pin them into the model's context. *Example here:* `app://info`.
* **Prompt** — a reusable parameterized prompt template. The host can
  offer them as slash-commands. *Examples here:* `summarize_text`,
  `explain_code`.

## 2. What is Streamable HTTP?

**Streamable HTTP** is MCP's recommended HTTP transport. It supersedes
the legacy `HTTP+SSE` transport (which used separate `/sse` and
`/messages` endpoints). Everything now flows through **one endpoint**:

* `POST /mcp` — every JSON-RPC request, response and notification
  from client to server. The response is either `application/json` or
  an `text/event-stream` (SSE) upgrade if the server wants to stream
  notifications related to that request.
* `GET /mcp` — long-lived SSE stream for server-initiated
  notifications.
* `DELETE /mcp` — terminate the MCP session.

```
                 Streamable HTTP                  HTTP+SSE (legacy)
                 ----------------                 -----------------
client -> server POST /mcp                        POST /messages
server -> client POST /mcp (text/event-stream)    GET /sse
                 or GET /mcp
session id       Mcp-Session-Id header            implicit per /sse socket
resumability     GET /mcp with Last-Event-ID      reconnect /sse
```

Why the replacement?

* Single endpoint = simpler routing, auth and deployment.
* Works on stateless / serverless infra (Cloudflare Workers, Lambda).
* Survives HTTP intermediaries (CDNs, proxies) that break long-lived SSE.
* Explicit `Mcp-Session-Id` makes reconnects and load balancing tractable.

Full details in [`docs/streamable-http.md`](./docs/streamable-http.md).

### Comparison of all three transports

| Transport       | When to use it                                              | This repo |
|-----------------|-------------------------------------------------------------|-----------|
| **stdio**       | Local server launched by the host (Claude Desktop's default for `command:` entries). | Not used. |
| **HTTP+SSE**    | Legacy. Two endpoints. Avoid for new code.                  | Not used. |
| **Streamable HTTP** | Current standard for HTTP transports. Single `/mcp` endpoint. | **Used.** |

## 3. The tools / resources / prompts exposed by the demos

| Kind     | Name                | What it does                                                                |
|----------|---------------------|-----------------------------------------------------------------------------|
| tool     | `echo`              | Returns the same text. Connectivity smoke-test.                             |
| tool     | `add_numbers`       | Sum two numbers (validates both are numeric).                               |
| tool     | `get_server_time`   | Current server time in ISO 8601 + UTC + local timezone.                     |
| tool     | `generate_demo_log` | Simulates a multi-step task, **streams** log notifications via SSE.         |
| tool     | `get_system_status` | Server name, version, transport, uptime, exposed capabilities.              |
| resource | `app://info`        | High-level metadata about the server.                                       |
| prompt   | `summarize_text`    | Reusable prompt asking the model to summarize a text faithfully.            |
| prompt   | `explain_code`      | Reusable prompt asking the model to explain a snippet of code.              |

The Python and TypeScript servers are **functionally equivalent**.

## 4. Running the Python demo

Prereqs: Python 3.10+, plus `uv` (recommended) or `pip`.

```bash
cd python-mcp-streamable-http

# Setup (choose one)
uv venv && uv pip install -e .[dev]                  # uv
python3 -m venv .venv && source .venv/bin/activate && pip install -e .[dev]  # pip

# Run the server (listens on http://127.0.0.1:8000/mcp)
python -m src.server

# In another terminal:
python -m src.client

# Tests
pytest -v
```

More details: [`python-mcp-streamable-http/README.md`](./python-mcp-streamable-http/README.md).

## 5. Running the TypeScript demo

Prereqs: Node.js 18.17+.

```bash
cd typescript-mcp-streamable-http

# Setup
npm install

# Run the server (listens on http://127.0.0.1:3000/mcp)
npm run server     # or `npm run dev` for watch mode

# In another terminal:
npm run client

# Tests
npm test
```

More details: [`typescript-mcp-streamable-http/README.md`](./typescript-mcp-streamable-http/README.md).

## 6. Testing with MCP Inspector

The official UI is the easiest sanity check:

```bash
npx @modelcontextprotocol/inspector
```

In the UI: set transport to **Streamable HTTP**, URL to
`http://127.0.0.1:8000/mcp` (Python) or `http://127.0.0.1:3000/mcp`
(TypeScript), click **Connect**, then explore the **Tools**,
**Resources** and **Prompts** tabs. The streamed log notifications
emitted by `generate_demo_log` will appear in the log pane in real
time.

## 7. Connecting to Claude Desktop

Three scenarios are documented in
[`docs/claude-desktop.md`](./docs/claude-desktop.md):

* **A — Remote public HTTPS server** via Claude Desktop's
  **Settings -> Connectors -> Add custom connector** UI.
* **B — Local Streamable HTTP server** bridged through `mcp-remote` in
  `claude_desktop_config.json`. The config snippets for the Python and
  TypeScript demos are reproduced there.
* **C — Production hardening checklist** (HTTPS, auth, rate limiting,
  audit logging, destructive-tool confirmation, etc.).

## 8. Common errors and fixes

See [`docs/troubleshooting.md`](./docs/troubleshooting.md). The
highlights:

* Port already in use? Override `MCP_PORT`.
* Claude Desktop doesn't show the server? Restart it after editing the
  config and check `~/Library/Logs/Claude/mcp*.log` on macOS or
  `%APPDATA%\Claude\logs\` on Windows.
* CORS / Origin errors? Add the origin to `MCP_ALLOWED_ORIGINS`.
* `mcp-remote` refuses an HTTP URL? Append `--allow-http`.

## 9. Security considerations (read this)

These demos are intentionally minimal. Before you put any MCP server
on the network:

1. **Bind to `127.0.0.1`** unless you have authentication. Both demos
   warn loudly if you set `MCP_HOST=0.0.0.0`.
2. **Validate `Origin` and `Host`** headers (both demos do, by
   default).
3. **Require HTTPS in production.** Plain HTTP is fine for loopback
   and `mcp-remote` with `--allow-http`; nothing else.
4. **Use OAuth** (or another auth mechanism) before exposing a server
   as a Claude Desktop custom connector.
5. **No secrets in the repo.** Use env vars and secret managers.
6. **No destructive tools without confirmation.** Tools that delete,
   send email, move money, etc. should be marked
   `annotations.destructiveHint = true` and require human approval in
   the host.
7. **Rate-limit** every endpoint at the reverse proxy.
8. **Audit-log** every `tools/call` with caller identity, name,
   arguments (redact secrets) and duration.

The full production checklist is the last section of
[`docs/claude-desktop.md`](./docs/claude-desktop.md).

## 10. SDK versions this demo was built against

| Component                       | Version  |
|---------------------------------|----------|
| `mcp` (Python SDK)              | 1.27.x   |
| `@modelcontextprotocol/sdk` (TypeScript SDK) | 1.29.x |
| `mcp-remote`                    | 0.1.38   |
| Recommended Node.js             | 20.x LTS |
| Recommended Python              | 3.11     |

If a newer SDK changes an import path or a parameter name, the
**Python imports** to check are
`mcp.server.fastmcp.FastMCP`,
`mcp.server.transport_security.TransportSecuritySettings` and
`mcp.client.streamable_http.streamable_http_client`. The **TypeScript
imports** are
`@modelcontextprotocol/sdk/server/mcp.js` (`McpServer`),
`@modelcontextprotocol/sdk/server/streamableHttp.js`
(`StreamableHTTPServerTransport`),
`@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js`
(`hostHeaderValidation`),
`@modelcontextprotocol/sdk/client/index.js` (`Client`) and
`@modelcontextprotocol/sdk/client/streamableHttp.js`
(`StreamableHTTPClientTransport`).
