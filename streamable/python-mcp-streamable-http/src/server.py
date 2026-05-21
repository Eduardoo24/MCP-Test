"""
Demo MCP server using FastMCP and the Streamable HTTP transport.

Streamable HTTP is the transport that replaces the legacy HTTP+SSE pair
(`/sse` + `/messages`). It exposes a single endpoint (here `/mcp`) that
accepts:

  * HTTP POST  — client -> server JSON-RPC messages, with the response
    delivered either as plain JSON or as an SSE stream depending on
    content negotiation.
  * HTTP GET   — opens a server -> client SSE stream for notifications and
    streaming responses.
  * HTTP DELETE — terminates the MCP session.

Run it with::

    uv run python -m src.server
    # or
    python -m src.server

It binds to 127.0.0.1:8000 by default. Override via env vars MCP_HOST,
MCP_PORT, MCP_PATH and MCP_ALLOWED_ORIGINS. See `.env.example`.
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any

from mcp.server.fastmcp import Context, FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from .tools import (
    SERVER_NAME,
    SERVER_VERSION,
    add_numbers as _add_numbers,
    app_info as _app_info,
    build_demo_log_steps,
    echo as _echo,
    explain_code_prompt,
    get_server_time as _get_server_time,
    get_system_status as _get_system_status,
    summarize_text_prompt,
)


# ----------------------------------------------------------------------------
# Configuration via environment variables.
# ----------------------------------------------------------------------------

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000
DEFAULT_PATH = "/mcp"

HOST: str = os.getenv("MCP_HOST", DEFAULT_HOST)
PORT: int = int(os.getenv("MCP_PORT", str(DEFAULT_PORT)))
PATH: str = os.getenv("MCP_PATH", DEFAULT_PATH)
LOG_LEVEL: str = os.getenv("MCP_LOG_LEVEL", "INFO").upper()

# Comma-separated list of Origin header values that are accepted.
# DNS rebinding protection is enabled when running on localhost.
_default_origins = f"http://localhost:{PORT},http://127.0.0.1:{PORT}"
ALLOWED_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("MCP_ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()
]
ALLOWED_HOSTS: list[str] = [f"127.0.0.1:{PORT}", f"localhost:{PORT}"]


# ----------------------------------------------------------------------------
# Logging.
# ----------------------------------------------------------------------------

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(SERVER_NAME)


# ----------------------------------------------------------------------------
# Build the FastMCP server.
#
# `transport_security` enables DNS-rebinding protection by validating the
# Host and Origin headers when running over Streamable HTTP. Without this,
# a malicious page in the browser could trick the user's machine into
# talking to a local MCP server.
# ----------------------------------------------------------------------------

mcp = FastMCP(
    name=SERVER_NAME,
    instructions=(
        "Demo MCP server in Python using Streamable HTTP. Provides toy tools "
        "(echo, add_numbers, get_server_time, generate_demo_log, "
        "get_system_status), a `app://info` resource and prompt templates."
    ),
    host=HOST,
    port=PORT,
    streamable_http_path=PATH,
    # Stateful sessions: each client gets a Mcp-Session-Id returned in the
    # response headers of `initialize` and must echo it on every subsequent
    # request. Set `stateless_http=True` if you prefer no session affinity.
    stateless_http=False,
    # When True, simple request/response calls return application/json
    # instead of an SSE stream. We keep it False so streaming (e.g.
    # progress notifications from `generate_demo_log`) works out of the box.
    json_response=False,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=ALLOWED_HOSTS,
        allowed_origins=ALLOWED_ORIGINS,
    ),
    log_level=LOG_LEVEL if LOG_LEVEL in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"} else "INFO",
)


# ----------------------------------------------------------------------------
# Tools.
# ----------------------------------------------------------------------------

@mcp.tool(
    title="Echo",
    description="Return the exact text you send. Useful to verify the MCP "
    "connection is alive.",
)
def echo(text: str) -> str:
    logger.info("tool=echo called text_len=%d", len(text) if isinstance(text, str) else -1)
    return _echo(text)


@mcp.tool(
    title="Add numbers",
    description="Add two numbers and return the sum.",
)
def add_numbers(a: float, b: float) -> float:
    logger.info("tool=add_numbers a=%r b=%r", a, b)
    return _add_numbers(a, b)


@mcp.tool(
    title="Get server time",
    description="Return the current server time in ISO 8601, plus UTC and "
    "the server's local timezone.",
)
def get_server_time() -> dict[str, str]:
    logger.info("tool=get_server_time called")
    return _get_server_time()


@mcp.tool(
    title="Generate demo log",
    description="Simulate a task that produces a progressive log. Emits one "
    "MCP log message per step over the same Streamable HTTP session and "
    "returns the accumulated log.",
)
async def generate_demo_log(steps: int, ctx: Context) -> dict[str, Any]:
    """Stream log messages via the Streamable HTTP session.

    `Context.info()` sends an MCP `notifications/message` event back over the
    same session that issued the request. With Streamable HTTP this is
    delivered as part of the SSE response stream opened for the original
    POST, so a compliant client (including MCP Inspector and our own
    `client.py`) will see them in real time.
    """
    entries = build_demo_log_steps(steps)
    log_lines: list[str] = []
    for entry in entries:
        line = f"[{entry.timestamp}] step {entry.step}/{entry.total}: {entry.message}"
        log_lines.append(line)
        # Streamed log message — visible to the client immediately.
        await ctx.info(line)
        # Progress notification (also streamed).
        await ctx.report_progress(progress=entry.step, total=entry.total)
    logger.info("tool=generate_demo_log emitted=%d", len(log_lines))
    return {"steps": steps, "log": log_lines}


@mcp.tool(
    title="Get system status",
    description="Return basic information about this MCP server: language, "
    "name, version, transport, uptime and exposed capabilities.",
)
def get_system_status() -> dict[str, Any]:
    logger.info("tool=get_system_status called")
    return _get_system_status()


# ----------------------------------------------------------------------------
# Resources.
# ----------------------------------------------------------------------------

@mcp.resource(
    "app://info",
    name="app-info",
    title="Application info",
    description="High-level metadata about this MCP server.",
    mime_type="application/json",
)
def app_info_resource() -> dict[str, Any]:
    logger.info("resource=app://info read")
    return _app_info(endpoint_path=PATH)


# ----------------------------------------------------------------------------
# Prompts.
# ----------------------------------------------------------------------------

@mcp.prompt(
    title="Summarize text",
    description="Return a reusable prompt that asks the model to summarize "
    "the provided text faithfully.",
)
def summarize_text(text: str) -> str:
    logger.info("prompt=summarize_text text_len=%d", len(text) if isinstance(text, str) else -1)
    return summarize_text_prompt(text)


@mcp.prompt(
    title="Explain code",
    description="Return a reusable prompt that asks the model to explain the "
    "given code in the given language.",
)
def explain_code(code: str, language: str = "python") -> str:
    logger.info("prompt=explain_code lang=%s code_len=%d", language, len(code) if isinstance(code, str) else -1)
    return explain_code_prompt(code, language)


# ----------------------------------------------------------------------------
# Entrypoint.
# ----------------------------------------------------------------------------

def main() -> None:
    """Start the Streamable HTTP server."""
    # Friendly warning: binding to 0.0.0.0 without authentication exposes
    # every tool on this server to your LAN.
    if HOST == "0.0.0.0":  # noqa: S104
        logger.warning(
            "MCP_HOST=0.0.0.0 — the server is reachable from the network. "
            "Do NOT do this in development without authentication: every tool "
            "on this server becomes callable by anyone who can reach the port."
        )

    logger.info(
        "Starting %s v%s on http://%s:%d%s (transport=streamable-http)",
        SERVER_NAME, SERVER_VERSION, HOST, PORT, PATH,
    )
    logger.info("Allowed origins: %s", ALLOWED_ORIGINS)
    logger.info("Allowed hosts: %s", ALLOWED_HOSTS)

    try:
        mcp.run(transport="streamable-http")
    except KeyboardInterrupt:
        logger.info("Shutting down (Ctrl+C)")
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Server crashed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
