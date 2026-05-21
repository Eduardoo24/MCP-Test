# Troubleshooting

The most common failure modes when running the demos and how to fix
them.

## 1. The server does not start

**Symptoms:** the process exits immediately, no log line on
`http://127.0.0.1:<port>/mcp`.

**Checks:**

* Are you in the right directory? Both `pyproject.toml` and
  `package.json` are inside their respective sub-folders.
* For Python, did you install the project? `pip install -e .[dev]`
  (or `uv pip install -e .[dev]`).
* For Node.js, did you run `npm install`? Are you on Node 18.17+?
  (`node --version`).
* Read the full traceback. The most common Python error
  (`ImportError: cannot import name 'streamable_http_client'`) means
  your `mcp` package is older than 1.27 — upgrade it.

## 2. Port already in use

**Symptoms:** `EADDRINUSE` (TS) or `OSError: [Errno 98] Address
already in use` (Python).

**Fix:** another process owns the port. Either kill it or bind the
server to a different port::

```bash
# Python — set env var
MCP_PORT=8001 python -m src.server

# TS — same idea
MCP_PORT=3001 npm run server
```

Find the offender on POSIX:

```bash
lsof -iTCP:8000 -sTCP:LISTEN   # macOS / Linux
ss -ltnp | grep ':8000'         # Linux
```

## 3. The client cannot initialize the MCP session

**Symptoms:** `client failed: ...`, or the call hangs and times out.

**Checks:**

* Is the server actually listening? `curl http://127.0.0.1:<port>/healthz`
  (TS demo) or just `curl -i -X POST http://127.0.0.1:<port>/mcp` (any).
* Is the URL right? Default ports differ: Python = 8000, TS = 3000.
  Override with `MCP_SERVER_URL=http://127.0.0.1:8001/mcp`.
* Is the host firewalled? Local firewalls (UFW, pf, Windows Defender)
  occasionally block loopback.

## 4. Claude Desktop does not show the MCP server

**Checks (in order):**

1. Did you restart Claude Desktop after editing
   `claude_desktop_config.json`? Hot reload is not supported.
2. Validate the JSON. A trailing comma or missing brace will silently
   disable every entry. `jq . claude_desktop_config.json` is your
   friend.
3. Look at Claude Desktop's MCP logs:
   * macOS: `~/Library/Logs/Claude/mcp.log` and `mcp-server-*.log`
   * Windows: `%APPDATA%\Claude\logs\`
4. If you used `mcp-remote`, can you launch it manually with the same
   args and see a connection?

   ```bash
   npx -y mcp-remote http://127.0.0.1:8000/mcp \
       --transport http-only --allow-http
   ```

## 5. Claude Desktop cannot reach the local server

**Symptoms:** `mcp-server-<name>.log` shows `ECONNREFUSED` or
`fetch failed`.

**Checks:**

* The local server must be running **before** Claude Desktop spawns
  `mcp-remote`. Order matters.
* If you switched `MCP_HOST` to `0.0.0.0`, Claude Desktop still talks
  to `127.0.0.1`. Either keep the default or update the URL in
  `claude_desktop_config.json` accordingly.
* If you are on macOS and use `localhost`: macOS may resolve to IPv6
  first. Force IPv4 by using `127.0.0.1` everywhere.

## 6. Trouble with `mcp-remote`

* **`Non-HTTPS URLs are only allowed for localhost or when --allow-http
  flag is provided`** — you targeted a non-HTTPS URL that's not on
  loopback. Add `--allow-http` (only safe locally) or, better, deploy
  HTTPS.
* **Hangs at start-up** — the wrong transport was chosen. Add
  `--transport http-only` to force Streamable HTTP rather than the
  default which probes both transports.
* **`Cannot find module 'mcp-remote'`** — `npx` cache is corrupt. Run
  `npx clear-npx-cache` or delete `~/.npm/_npx`.

## 7. HTTP vs HTTPS confusion

* Custom connectors in Claude Desktop **require HTTPS** with a valid
  certificate.
* `mcp-remote` accepts HTTP only for `localhost`/`127.0.0.1` or with
  `--allow-http`.
* `curl` and our own demo clients are happy with plain HTTP because
  they're talking to loopback.

If you want to test HTTPS locally without a public domain, point a
reverse proxy like Caddy at the demo:

```caddy
mcp.local.test {
  reverse_proxy 127.0.0.1:3000
}
```

and add `mcp.local.test` to your hosts file.

## 8. CORS errors

**Symptom:** the browser console says
`Origin http://localhost:5173 has been blocked by CORS policy`.

This only matters if you are calling the MCP server **from a browser**.
Add the origin to `MCP_ALLOWED_ORIGINS`:

```bash
MCP_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173 \
    npm run server
```

Tooling like `mcp-remote`, MCP Inspector and our demo clients do not
hit CORS — they're not browsers.

## 9. Origin validation failed

**Symptom:** the server logs a warning and returns 403 with
`{ "error": "Origin not allowed" }`.

Add the offending origin to `MCP_ALLOWED_ORIGINS`. Do **not** disable
origin validation unless you know what you're doing — it's your only
defence against DNS-rebinding attacks for an unauthenticated server.

## 10. `localhost` vs `127.0.0.1`

These usually behave identically but on a few setups (corporate DNS
overrides, `hosts` file entries, dual-stack IPv4/IPv6) they don't.
Stick to `127.0.0.1` everywhere when in doubt — the demos default to
that.

## 11. Binding to `0.0.0.0`

The demos warn you when `MCP_HOST=0.0.0.0`. With no authentication,
that exposes every tool to every device on your LAN. Don't.

## 12. Server is on a private network Claude can't reach

Custom connectors reach your server **from Anthropic's
infrastructure**. If the server is on a VPN, a corporate network, or
behind a NAT with no port forwarding, the public custom-connector flow
will fail. Two viable workarounds:

* Use the `mcp-remote` bridge (Scenario B in
  [`claude-desktop.md`](./claude-desktop.md)) — that runs on the
  user's machine and only needs *local* network reachability.
* Expose the server through a tunnel (Cloudflare Tunnel, ngrok)
  pointing at a publicly resolvable hostname, then add auth before
  you do that.

## 13. Reading Claude Desktop logs

* **macOS:** `~/Library/Logs/Claude/`
  * `mcp.log` — dispatcher
  * `mcp-server-<name>.log` — stdout + stderr of each MCP server
    process (or of the `mcp-remote` bridge)
* **Windows:** `%APPDATA%\Claude\logs\`
* Tail them while reproducing the bug:

  ```bash
  tail -f ~/Library/Logs/Claude/mcp*.log
  ```

## 14. Testing manually with curl

```bash
# 1. initialize — note the Mcp-Session-Id in the response header
curl -i -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-06-18' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",
       "params":{"protocolVersion":"2025-06-18",
                 "capabilities":{},
                 "clientInfo":{"name":"curl","version":"1.0"}}}'

# 2. notifications/initialized — echo it back
SESSION=...  # paste the Mcp-Session-Id from step 1
curl -i -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# 3. tools/list
curl -i -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Mcp-Session-Id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 4. clean up
curl -i -X DELETE http://127.0.0.1:3000/mcp \
  -H "Mcp-Session-Id: $SESSION"
```

## 15. Testing with MCP Inspector

The official MCP Inspector is a tiny web UI for poking at any MCP
server. With the demo running:

```bash
# from anywhere
npx @modelcontextprotocol/inspector
```

In the UI:

* Transport: **Streamable HTTP**
* URL: `http://127.0.0.1:8000/mcp` (Python) or
  `http://127.0.0.1:3000/mcp` (TS)
* Click **Connect**. You should see tools, resources and prompts in
  the side panel. Use the "Tools" tab to invoke `echo`,
  `generate_demo_log` etc. and the streamed log notifications will
  appear in the bottom log pane.

Inspector is also the easiest way to validate the wire protocol against
the spec without writing custom code.
