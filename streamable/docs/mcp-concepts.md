# MCP concepts in 10 minutes

This is a hands-on intro that maps every MCP concept to a concrete file in
this repo. If you have already read the spec you can skip it.

## The three roles

```
+--------------+        +-----------+        +------------+
|   Host       |  uses  |   Client  | speaks |   Server   |
| (Claude      | -----> | (one per  | -----> | (this      |
|  Desktop,    |        |  server,  |        |  repo's    |
|  IDE, web    |        |  embedded |        |  Python /  |
|  app...)     |        |  in host) |        |  TS demos) |
+--------------+        +-----------+        +------------+
```

### Host (a.k.a. MCP host)

The application that wants to give an LLM extra context and tools. Claude
Desktop, the Claude web app, Cursor, your own LangGraph agent, etc. The
host decides when to surface a tool to the model and is the only piece
that talks to the LLM directly.

### Client (a.k.a. MCP client)

A small piece of code inside the host that opens one connection per MCP
server and speaks the MCP wire protocol on the host's behalf. In this
repo:

* `python-mcp-streamable-http/src/client.py` — standalone MCP client
  (handy for testing).
* `typescript-mcp-streamable-http/src/client.ts` — same idea, in
  TypeScript.

### Server (a.k.a. MCP server)

A standalone process that exposes a set of capabilities (tools,
resources, prompts) over an MCP transport. In this repo:

* `python-mcp-streamable-http/src/server.py`
* `typescript-mcp-streamable-http/src/server.ts`

The server doesn't know which LLM (if any) is using it.

## The three capability kinds

### Tools

Callable functions. The model can decide to invoke a tool and feed the
result back into its own context. Tools have a name, a JSON Schema for
arguments, an optional output schema and a callback that executes when
the client invokes them.

Examples in this repo: `echo`, `add_numbers`, `get_server_time`,
`generate_demo_log`, `get_system_status`.

### Resources

Read-only blobs addressed by URI (any scheme — `file://`, `http://`,
`app://`, your own). The host can pin them into the model's context as
attachments.

Example in this repo: `app://info` returns a JSON document describing
the server.

### Prompts

Reusable, parameterized prompt templates that the host can offer to the
user (e.g. as slash-commands or "Insert prompt" actions). They return
one or more conversation messages.

Examples in this repo: `summarize_text`, `explain_code`.

## Transport

The wire that connects client and server. MCP defines three:

| Transport       | Connection                  | Used for                                   |
|-----------------|-----------------------------|--------------------------------------------|
| stdio           | child process pipes         | local servers launched by the host         |
| HTTP+SSE        | two endpoints (`/sse` + `/messages`) | **legacy** remote/network servers |
| Streamable HTTP | one endpoint (`/mcp`)       | the current standard for HTTP transports   |

This repo uses **Streamable HTTP** exclusively. See
[`streamable-http.md`](./streamable-http.md) for details and migration
notes.

## JSON-RPC

Every MCP message is a JSON-RPC 2.0 request or notification. The
transport is just the envelope — the payload format is identical
regardless of whether you're on stdio or Streamable HTTP. A few methods
you'll see in practice:

* `initialize` — first thing a client sends. Negotiates protocol
  version and capabilities.
* `tools/list`, `tools/call`
* `resources/list`, `resources/read`
* `prompts/list`, `prompts/get`
* `notifications/message` — server-initiated log message
* `notifications/progress` — server-initiated progress update

## Full life of a tool call

This is what happens when you type *"can you add 7 and 5 for me?"* in
Claude Desktop after wiring up this Python server through `mcp-remote`:

1. Claude Desktop (host) starts. It reads `claude_desktop_config.json`,
   finds the `demo-python-streamable-http` entry, spawns `mcp-remote`,
   which in turn opens a Streamable HTTP connection to
   `http://127.0.0.1:8000/mcp` on the user's machine.

2. The MCP client (`mcp-remote`) issues `initialize`. The server
   responds with its protocol version, declared capabilities, name and
   version. The transport stores the returned `Mcp-Session-Id`.

3. The client lists tools (`tools/list`). It receives the schema of
   `add_numbers` (and the rest). Claude Desktop registers them so the
   model sees them as callable functions.

4. The user types *"add 7 and 5"* in the chat.

5. The LLM (Claude) decides it needs to call `add_numbers(a=7, b=5)`.
   It emits a tool-use block.

6. Claude Desktop forwards that as `tools/call { name: "add_numbers",
   arguments: { a: 7, b: 5 } }` over the same MCP session.

7. The server validates the input, runs `add_numbers`, returns
   `{ content: [{ type: "text", text: "12.0" }] }`.

8. Claude Desktop feeds the result back into the model's context. The
   model produces the natural-language reply *"7 + 5 is 12."* and shows
   it to the user.

The same flow applies to resources (`resources/read`) and prompts
(`prompts/get`).

## What this repo does NOT cover

* Sampling (server -> client request asking the host's LLM to generate
  text)
* Roots (file/dir scopes the host advertises to the server)
* OAuth + remote MCP servers — touched on briefly in
  [`claude-desktop.md`](./claude-desktop.md), but the demo servers are
  unauthenticated localhost servers.

The official spec is the source of truth:
<https://modelcontextprotocol.io/specification>.
