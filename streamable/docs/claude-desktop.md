# Connecting these MCP servers to Claude Desktop

There are three realistic scenarios for hooking a Streamable HTTP MCP
server into Claude Desktop. This document walks through all of them,
ending with a production checklist.

> Quick note on terminology — Claude Desktop is the host that calls
> MCP servers on your behalf. The way it reaches a server depends on
> whether the server is a *local* process or a *remote* HTTP endpoint,
> and on whether you go through Claude's first-class **Custom
> connectors** UI or through the JSON config file.

---

## Scenario A — Remote MCP server over public HTTPS

This is how production-grade integrations work: the MCP server is
deployed at a stable, public HTTPS URL and Claude Desktop talks to it
directly via the **Custom connectors** UI.

### How to add it

1. Open **Claude Desktop -> Settings -> Connectors**.
2. Click **Add custom connector**.
3. Enter the public HTTPS URL of your `/mcp` endpoint, e.g.
   `https://mcp.example.com/mcp`.
4. Walk through any authentication step (typically OAuth).
5. Save. The connector should now show up in the side bar; Claude will
   list its tools, resources and prompts automatically.

### What this means in practice

* The URL must be reachable **from Anthropic's infrastructure**, not
  just from your laptop. If your MCP server is behind a corporate VPN,
  on a private network, or on a residential router with no port
  forwarding, Claude Desktop will not be able to reach it as a custom
  connector.
* The URL must be `https://`. Custom connectors do not accept plain
  HTTP.
* The server must implement enough of the MCP HTTP spec — in
  particular, it must support OAuth (or another auth flow Anthropic
  whitelists) unless explicitly configured for anonymous access.
* This scenario is **not** suitable for the unauthenticated localhost
  demo in this repo; it's the target state once you harden the server
  (see Scenario C).

---

## Scenario B — Local Streamable HTTP server via `mcp-remote`

Claude Desktop's `claude_desktop_config.json` historically only knew
how to launch local stdio servers. The community-maintained
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) shim bridges
stdio to remote HTTP, which means we can point Claude Desktop at our
local Streamable HTTP servers without touching the desktop binary.

### Where the config lives

| OS       | Path                                                                |
|----------|---------------------------------------------------------------------|
| macOS    | `~/Library/Application Support/Claude/claude_desktop_config.json`   |
| Windows  | `%APPDATA%\Claude\claude_desktop_config.json`                       |
| Linux    | `~/.config/Claude/claude_desktop_config.json` (unofficial builds)   |

You can also use **Settings -> Developer -> Edit Config** in Claude
Desktop to open this file.

### Configuration — Python demo

Make sure the Python server is running (`python -m src.server`), then
add the following to `claude_desktop_config.json` and restart Claude
Desktop:

```json
{
  "mcpServers": {
    "demo-python-streamable-http": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://127.0.0.1:8000/mcp",
        "--transport",
        "http-only",
        "--allow-http"
      ]
    }
  }
}
```

Argument meaning (verified against `mcp-remote@0.1.38`):

* `-y` — tell `npx` to install `mcp-remote` non-interactively if it
  isn't cached yet.
* `http://127.0.0.1:8000/mcp` — the Streamable HTTP endpoint of the
  local Python server.
* `--transport http-only` — force `mcp-remote` to use the Streamable
  HTTP transport. Valid values are `http-only`, `sse-only`,
  `http-first` (default) and `sse-first`.
* `--allow-http` — required because the URL is `http://`, not
  `https://`. `mcp-remote` refuses non-HTTPS endpoints by default for
  anything except `localhost` / `127.0.0.1`; the flag makes the
  intent explicit.

### Configuration — TypeScript demo

Make sure the TS server is running (`npm run server`), then:

```json
{
  "mcpServers": {
    "demo-typescript-streamable-http": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://127.0.0.1:3000/mcp",
        "--transport",
        "http-only",
        "--allow-http"
      ]
    }
  }
}
```

### Combining both

You can have several MCP servers wired into Claude Desktop at once:

```json
{
  "mcpServers": {
    "demo-python-streamable-http": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:8000/mcp",
               "--transport", "http-only", "--allow-http"]
    },
    "demo-typescript-streamable-http": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:3000/mcp",
               "--transport", "http-only", "--allow-http"]
    }
  }
}
```

### Verifying it worked

* Restart Claude Desktop *after* every change to
  `claude_desktop_config.json`. Hot reload is not supported.
* In a chat, click the 🔌 / connectors icon. You should see both
  servers listed with their tools.
* The tools should auto-complete in the chat input (e.g. type
  `/echo`).
* Run a test prompt: *"call echo with the text hello"* — you should
  see the server log line on your terminal.

### Where Claude Desktop logs go

* macOS: `~/Library/Logs/Claude/`
  Inspect `mcp.log` (Claude's MCP dispatcher) and
  `mcp-server-<name>.log` (per-server stderr).
* Windows: `%APPDATA%\Claude\logs\`
* Useful one-liner on macOS:
  `tail -f ~/Library/Logs/Claude/mcp*.log`

---

## Scenario C — Production deployment

The unauthenticated `127.0.0.1` server in this repo is a **demo**.
Promoting it to a real-world deployment needs a hard checklist:

1. **HTTPS only.** Terminate TLS at a reverse proxy (nginx, Caddy,
   ALB, Cloud Run) and forward only HTTPS to clients. Custom
   connectors reject plain HTTP.
2. **Authentication.** For remote MCP servers reachable by Claude
   Desktop's custom connectors, OAuth is the standard. The TypeScript
   SDK ships `StreamableHTTPServerTransport` with `authProvider`
   hooks, and the Python SDK exposes `FastMCP(auth=AuthSettings(...))`
   and `token_verifier`. For internal deployments behind a VPN, mTLS
   or an SSO-aware reverse proxy are also fine.
3. **Origin validation.** Even with auth, keep
   `MCP_ALLOWED_ORIGINS` (or the SDK's host-header middleware)
   tight to block DNS-rebinding attacks.
4. **Rate limiting.** Apply per-IP and per-token quotas at the reverse
   proxy. A model that gets a tool wrong can hammer a server in a
   loop.
5. **Audit logging.** Log every `tools/call` with caller identity,
   tool name, arguments (redact secrets) and elapsed time. Ship them
   to a SIEM or at least a long-retention sink.
6. **Confirmation for destructive tools.** Mark side-effecting tools
   with `annotations.destructiveHint = true` and require human
   confirmation in your host. Better yet, expose only idempotent
   read-only operations through Claude.
7. **No secrets in code.** Use environment variables, secret managers
   or workload identity. The demo's `.env.example` deliberately holds
   only non-secret defaults.
8. **Resource limits.** Cap concurrency, request body size, log size
   and CPU/memory per session.
9. **Observability.** Expose `/healthz` (this repo's TS server already
   does), `/metrics`, and structured logs.
10. **Patch hygiene.** Pin SDK versions and subscribe to the MCP spec
    and SDK release feeds — both transports and security
    recommendations have shifted within the last few months.
