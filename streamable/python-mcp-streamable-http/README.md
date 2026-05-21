# Python MCP server + client — Streamable HTTP

Demo MCP server and client written in Python on top of the official
[`mcp`](https://pypi.org/project/mcp/) SDK. The server uses **Streamable
HTTP** (single `/mcp` endpoint), which is the transport that replaced the
legacy HTTP+SSE pair (`/sse` + `/messages`).

```
streamable/python-mcp-streamable-http
├── pyproject.toml
├── .env.example
├── src/
│   ├── server.py   # FastMCP server, transport = streamable-http
│   ├── client.py   # ClientSession over streamable_http_client(...)
│   └── tools.py    # Pure tool logic (unit tested)
└── tests/
    └── test_basic.py
```

The server exposes:

| Kind     | Name                | What it does                                                                        |
|----------|---------------------|-------------------------------------------------------------------------------------|
| tool     | `echo`              | Returns the same text. Connectivity smoke-test.                                     |
| tool     | `add_numbers`       | Sum two numbers (validates that both inputs are numeric).                           |
| tool     | `get_server_time`   | Current server time in ISO 8601 + UTC + local timezone.                             |
| tool     | `generate_demo_log` | Simulates a multi-step task, streaming log messages via `ctx.info()`.               |
| tool     | `get_system_status` | Server name, version, transport, uptime, exposed tools/resources/prompts.           |
| resource | `app://info`        | High-level metadata about the server.                                               |
| prompt   | `summarize_text`    | Reusable prompt asking the model to summarize a text faithfully.                    |
| prompt   | `explain_code`      | Reusable prompt asking the model to explain a snippet of code.                      |

## Requirements

* Python 3.10+
* Either [`uv`](https://github.com/astral-sh/uv) (recommended) or `pip` /
  `venv`.

## Setup

### Option A — `uv` (recommended)

```bash
# From this folder:
uv venv
uv pip install -e .[dev]
```

### Option B — `pip` + `venv`

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e .[dev]
```

## Run the server

```bash
# uv
uv run python -m src.server

# pip / venv
python -m src.server
```

The server listens on `http://127.0.0.1:8000/mcp` and prints log lines on
startup, on every incoming session, on every tool call and on every error.

Override host/port/path through environment variables (see
`.env.example`)::

```bash
MCP_HOST=127.0.0.1 MCP_PORT=8000 MCP_PATH=/mcp python -m src.server
```

## Run the client

In a separate terminal, with the server already running:

```bash
# uv
uv run python -m src.client

# pip / venv
python -m src.client
```

The client connects via Streamable HTTP, initializes the MCP session,
lists tools/resources/prompts, calls every tool (including the streamed
`generate_demo_log`) and reads `app://info`.

## Run the tests

```bash
# uv
uv run pytest -v

# pip / venv
pytest -v
```

The tests cover the pure tool logic (`src/tools.py`). The Streamable HTTP
transport itself is exercised by running `src/client.py` against
`src/server.py` (or by pointing MCP Inspector at the same URL).

## Streamable HTTP — what the server does

* Single endpoint: `POST /mcp`, `GET /mcp`, `DELETE /mcp`.
* `POST` carries JSON-RPC messages from client to server. The server can
  reply with either `application/json` or an SSE stream
  (`text/event-stream`). Streaming is used for long-running tools and
  notifications.
* `GET` opens a long-lived SSE stream for server -> client notifications.
* `DELETE` terminates the session.
* Headers honored: `Accept`, `Content-Type`, `Mcp-Session-Id`,
  `MCP-Protocol-Version`, `Last-Event-ID` (for resumability if you wire
  up an `EventStore`).
* DNS-rebinding protection is enabled by default — the server only
  accepts requests whose `Host`/`Origin` match `MCP_ALLOWED_ORIGINS` and
  `127.0.0.1:PORT`/`localhost:PORT`.

## Security notes

* The server binds to `127.0.0.1` by default. Setting `MCP_HOST=0.0.0.0`
  exposes every tool to your LAN — only do it behind an authenticated
  reverse proxy.
* This demo has **no authentication**. Do not run it on a public IP.
* For production, see `../docs/claude-desktop.md` (Scenario C).
