"""
Demo MCP client that connects to the Python server via Streamable HTTP.

The client uses `streamablehttp_client(url)` which speaks the same wire
protocol the official MCP Inspector and Claude Desktop's `mcp-remote`
bridge use. The connection is fully driven over HTTP — no stdio.

Run it with the server already listening on http://127.0.0.1:8000/mcp::

    uv run python -m src.client
    # or
    python -m src.client
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.types import (
    LoggingMessageNotificationParams,
    TextContent,
)

DEFAULT_URL = "http://127.0.0.1:8000/mcp"
SERVER_URL: str = os.getenv("MCP_SERVER_URL", DEFAULT_URL)

logging.basicConfig(
    level=os.getenv("MCP_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] client: %(message)s",
)
logger = logging.getLogger("client")


def _content_to_text(content: list[Any]) -> str:
    """Best-effort join of MCP content blocks into a string."""
    parts: list[str] = []
    for block in content:
        if isinstance(block, TextContent):
            parts.append(block.text)
        else:
            parts.append(repr(block))
    return "\n".join(parts)


async def _log_handler(params: LoggingMessageNotificationParams) -> None:
    """Print MCP log notifications streamed by the server.

    `generate_demo_log` uses `ctx.info(...)` which lands here in real time.
    """
    data = params.data
    if isinstance(data, str):
        message = data
    else:
        message = json.dumps(data, default=str)
    logger.info("[server-log] %s: %s", params.level, message)


async def run() -> None:
    logger.info("Connecting to %s ...", SERVER_URL)

    async with streamable_http_client(SERVER_URL) as (read_stream, write_stream, get_session_id):
        async with ClientSession(read_stream, write_stream, logging_callback=_log_handler) as session:
            # 1. Initialize the MCP session. Streamable HTTP returns a
            #    Mcp-Session-Id that the transport stores transparently.
            init_result = await session.initialize()
            logger.info(
                "Connected to server %s v%s (protocol=%s)",
                init_result.serverInfo.name,
                init_result.serverInfo.version,
                init_result.protocolVersion,
            )
            session_id = get_session_id()
            if session_id:
                logger.info("Mcp-Session-Id: %s", session_id)

            # 2. Subscribe to debug-level log notifications. Some MCP
            #    servers don't implement `logging/setLevel`; that's fine,
            #    log notifications still arrive with their default level.
            try:
                await session.set_logging_level("debug")
            except Exception:  # noqa: BLE001
                pass  # server doesn't expose logging/setLevel — proceed silently.

            # 3. List capabilities.
            tools = (await session.list_tools()).tools
            resources = (await session.list_resources()).resources
            prompts = (await session.list_prompts()).prompts
            logger.info("Tools:     %s", [t.name for t in tools])
            logger.info("Resources: %s", [str(r.uri) for r in resources])
            logger.info("Prompts:   %s", [p.name for p in prompts])

            # 4. Call `echo`.
            echo_result = await session.call_tool("echo", {"text": "hola MCP"})
            logger.info("echo -> %s", _content_to_text(echo_result.content))

            # 5. Call `add_numbers`.
            add_result = await session.call_tool("add_numbers", {"a": 2, "b": 3.5})
            logger.info("add_numbers(2, 3.5) -> %s", _content_to_text(add_result.content))

            # 6. Call `get_server_time`.
            time_result = await session.call_tool("get_server_time", {})
            logger.info("get_server_time -> %s", _content_to_text(time_result.content))

            # 7. Call `get_system_status`.
            status_result = await session.call_tool("get_system_status", {})
            logger.info("get_system_status -> %s", _content_to_text(status_result.content))

            # 8. Call `generate_demo_log` (streamed).
            logger.info("generate_demo_log(steps=4) — streaming log lines:")
            demo_result = await session.call_tool("generate_demo_log", {"steps": 4})
            logger.info("generate_demo_log -> %s", _content_to_text(demo_result.content))

            # 9. Read `app://info` resource.
            info_result = await session.read_resource("app://info")
            for content in info_result.contents:
                text = getattr(content, "text", None)
                if text is not None:
                    logger.info("resource app://info -> %s", text)

            # 10. Get prompts.
            summarize = await session.get_prompt(
                "summarize_text",
                {"text": "MCP unifies how AI apps talk to external data and tools."},
            )
            logger.info(
                "prompt summarize_text -> %s",
                _content_to_text([m.content for m in summarize.messages]),
            )

            explain = await session.get_prompt(
                "explain_code",
                {
                    "code": "def add(a, b):\n    return a + b\n",
                    "language": "python",
                },
            )
            logger.info(
                "prompt explain_code -> %s",
                _content_to_text([m.content for m in explain.messages]),
            )

    logger.info("Done.")


def main() -> None:
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        logger.info("Interrupted")
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Client failed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
