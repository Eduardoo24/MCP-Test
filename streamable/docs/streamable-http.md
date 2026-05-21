# Streamable HTTP

## What problem does it solve?

The original HTTP transport for MCP used **two** endpoints:

* `GET /sse` — long-lived Server-Sent Events stream the server pushed to
  for every notification *and* every response.
* `POST /messages` — the client sent JSON-RPC requests here.

That worked but had real-world issues:

* Two endpoints meant two URLs to deploy, route and authenticate.
* Many HTTP intermediaries (corporate proxies, CDNs, serverless
  platforms) buffer or kill long-lived SSE connections, so the channel
  was unreliable.
* It was hard to deploy on stateless / serverless infrastructure that
  expects every request to be independent.
* The session model was implicit (tied to the SSE socket), so reconnects
  lost in-flight state.

**Streamable HTTP** consolidates both flows into a single endpoint and
delegates the streaming decision to standard HTTP content negotiation.

## How it replaces HTTP+SSE

| Operation                | Legacy HTTP+SSE         | Streamable HTTP                              |
|--------------------------|-------------------------|----------------------------------------------|
| Client -> server JSON-RPC| `POST /messages`        | `POST /mcp`                                  |
| Server -> client stream  | `GET /sse`              | `POST /mcp` returns `text/event-stream`, **or** an explicit `GET /mcp` |
| Session identification   | implicit (one SSE socket) | explicit `Mcp-Session-Id` HTTP header     |
| Reconnect / resume       | reopen `GET /sse`       | `GET /mcp` with `Last-Event-ID` header       |
| Close session            | drop the SSE socket     | `DELETE /mcp`                                |

The wire protocol (JSON-RPC envelopes, method names, schemas) is
identical. Only the framing changed.

## Single endpoint

All Streamable HTTP traffic targets one URL. In this repo:

* Python: `http://127.0.0.1:8000/mcp`
* TypeScript: `http://127.0.0.1:3000/mcp`

## When is each HTTP method used?

### POST `/mcp`

Used for every JSON-RPC **request** or **notification** from client to
server. The body is a JSON-RPC envelope.

The response depends on content negotiation:

* If the client sent `Accept: application/json` only, the server
  replies with a single `application/json` body containing the JSON-RPC
  response.
* If the client sent `Accept: application/json, text/event-stream`
  (the default) **and** the server wants to stream notifications
  related to that request (progress updates, log messages), the server
  upgrades the response to `Content-Type: text/event-stream` and emits
  any number of SSE events followed by the final JSON-RPC response.

Both demos use the streamed variant. You can see it in `curl`:

```
$ curl -s -i -X POST http://127.0.0.1:3000/mcp \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H 'MCP-Protocol-Version: 2025-06-18' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'

HTTP/1.1 200 OK
content-type: text/event-stream
mcp-session-id: ea899448-af30-432a-ba44-37e63fa5a97c
...

event: message
data: {"result":{...},"jsonrpc":"2.0","id":1}
```

### GET `/mcp`

Used by the client to open a long-lived SSE stream where the server can
push notifications that are **not** in response to any particular
request (e.g. `notifications/resources/list_changed`). Clients
optionally include a `Last-Event-ID` header to resume from a known point.

### DELETE `/mcp`

Used by the client to terminate the MCP session cleanly. The server
discards the in-memory state associated with `Mcp-Session-Id`. Both
demo clients call this on shutdown.

## Sessions and `Mcp-Session-Id`

Streamable HTTP supports two modes:

### Stateful (the default in this repo)

* The client sends its first POST without `Mcp-Session-Id`. The body
  must contain an `initialize` request.
* The server generates a UUID, stores its in-memory transport state and
  returns the UUID in the `Mcp-Session-Id` response header.
* Every subsequent POST/GET/DELETE from this client includes
  `Mcp-Session-Id: <uuid>`. The server uses the header to route to the
  correct in-memory transport instance.
* Lifetime ends on `DELETE /mcp`, on transport error, or when the
  server forgets it (e.g. process restart). The server then replies
  with `404 Not Found` to any request carrying that stale ID, prompting
  the client to re-`initialize`.

### Stateless

* The server's `sessionIdGenerator` is left `undefined` (TS) or
  `stateless_http=True` is set on `FastMCP` (Python).
* No `Mcp-Session-Id` is ever issued. Each request must be
  self-contained (no per-session state, no in-flight subscriptions).
* Useful for serverless deployments (Cloudflare Workers, Lambda) where
  you can't trust local memory.

## `Last-Event-ID` (resumability)

Optional. When the server is configured with an event store (the SDKs
expose an `EventStore` interface), every server -> client message gets a
monotonically increasing event ID and is also persisted. If the client
loses its connection, it can reconnect via `GET /mcp` with
`Last-Event-ID: <id>` and the server replays everything emitted after
that point.

This repo's demos do **not** enable an event store — they print a note
in the README that resumability is opt-in. To turn it on, supply an
`EventStore` implementation to the constructor of
`StreamableHTTPServerTransport` (TS) or `FastMCP(event_store=...)`
(Python).

## Headers that matter

| Header                  | Direction        | Purpose                                                 |
|-------------------------|------------------|---------------------------------------------------------|
| `Accept`                | client -> server | `application/json, text/event-stream` enables streaming |
| `Content-Type`          | both             | `application/json` on POST, `text/event-stream` on streamed responses |
| `Mcp-Session-Id`        | both             | session identifier (stateful mode)                       |
| `MCP-Protocol-Version`  | both             | negotiated protocol version (e.g. `2025-06-18`)         |
| `Last-Event-ID`         | client -> server | resume an interrupted server -> client stream           |
| `Origin`                | client -> server | validated by the server for DNS-rebinding protection    |
| `Host`                  | client -> server | validated by the server for DNS-rebinding protection    |

## Security

Streamable HTTP runs over plain HTTP, so the standard web threats apply.
This repo's defaults are deliberately conservative:

* **Bind to 127.0.0.1** by default. Without authentication, binding to
  `0.0.0.0` means anyone on your LAN can call every tool. Treat that as
  a deliberate exposure decision (set it only behind an authenticated
  reverse proxy or VPN).
* **Validate `Origin`** so a malicious page in the user's browser
  cannot POST to your local MCP server via `fetch()`. Both demos
  enforce an allow-list (`MCP_ALLOWED_ORIGINS`) and the TS server also
  uses the SDK's `hostHeaderValidation` middleware against
  `Host: 127.0.0.1 | localhost | [::1]`.
* **No authentication** is enabled. For production, run the server
  behind HTTPS and either:
  * an authenticated reverse proxy (mTLS, OIDC, etc.), or
  * the SDK's OAuth flow (Python: `auth=AuthSettings(...)`, TS:
    `authProvider` on the transport).

## Why bind to 127.0.0.1 in local dev?

`127.0.0.1` (and `localhost`) are loopback addresses — kernel-routed,
never sent on a network. With:

* DNS-rebinding protection on (this repo's default)
* No authentication

a server bound to `127.0.0.1` is reachable only by processes on your
machine. Switching to `0.0.0.0` makes the same unauthenticated server
reachable by every device on your network, including phones, IoT
devices and (if you happen to be on hotel Wi-Fi) strangers. That's why
both demos warn you on startup if you set `MCP_HOST=0.0.0.0`.
