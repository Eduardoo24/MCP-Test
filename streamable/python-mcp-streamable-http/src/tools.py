"""
Pure tool logic for the demo MCP server.

These functions hold the actual business logic of each MCP tool and are
intentionally kept transport-agnostic. This makes them trivial to unit-test
without spinning up the HTTP server.

Server name, version and supported tools are exposed as constants so that
`server.py`, `client.py`, tests and the `app://info` resource can all share a
single source of truth.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

SERVER_NAME = "demo-python-streamable-http"
SERVER_VERSION = "0.1.0"
SERVER_LANGUAGE = "python"
SERVER_TRANSPORT = "streamable-http"

TOOL_NAMES: list[str] = [
    "echo",
    "add_numbers",
    "get_server_time",
    "generate_demo_log",
    "get_system_status",
]

RESOURCE_URIS: list[str] = ["app://info"]

PROMPT_NAMES: list[str] = ["summarize_text", "explain_code"]


# Server start time, used by `get_system_status` to compute uptime.
_SERVER_START_MONOTONIC = time.monotonic()


def echo(text: str) -> str:
    """Return the exact same text. Useful for verifying connectivity."""
    if not isinstance(text, str):
        raise ValueError("`text` must be a string")
    return text


def add_numbers(a: float, b: float) -> float:
    """Add two numbers and return the result.

    Both arguments must be numeric (int or float). Booleans are rejected
    because in Python `bool` is a subclass of `int` but allowing it would be
    surprising to MCP callers.
    """
    for name, value in (("a", a), ("b", b)):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"`{name}` must be a number, got {type(value).__name__}")
    return float(a) + float(b)


def get_server_time() -> dict[str, str]:
    """Return the current server time in ISO 8601 format, with timezone info."""
    # `astimezone()` without args uses the system local timezone.
    now_local = datetime.now().astimezone()
    return {
        "iso": now_local.isoformat(),
        "utc": datetime.now(timezone.utc).isoformat(),
        "timezone": str(now_local.tzinfo),
    }


@dataclass
class DemoLogStep:
    step: int
    total: int
    message: str
    timestamp: str


def build_demo_log_steps(steps: int) -> list[DemoLogStep]:
    """Build the list of log entries that `generate_demo_log` would emit.

    Pure function so it can be unit-tested without involving the server.
    """
    if not isinstance(steps, int) or isinstance(steps, bool):
        raise ValueError("`steps` must be an integer")
    if steps < 1 or steps > 50:
        raise ValueError("`steps` must be between 1 and 50")

    entries: list[DemoLogStep] = []
    for i in range(1, steps + 1):
        entries.append(
            DemoLogStep(
                step=i,
                total=steps,
                message=f"Processing step {i}/{steps}",
                timestamp=datetime.now(timezone.utc).isoformat(),
            )
        )
    return entries


def get_system_status() -> dict[str, Any]:
    """Return a small dictionary describing the server's current state."""
    uptime_seconds = round(time.monotonic() - _SERVER_START_MONOTONIC, 3)
    return {
        "language": SERVER_LANGUAGE,
        "name": SERVER_NAME,
        "version": SERVER_VERSION,
        "transport": SERVER_TRANSPORT,
        "uptime_seconds": uptime_seconds,
        "tools": list(TOOL_NAMES),
        "resources": list(RESOURCE_URIS),
        "prompts": list(PROMPT_NAMES),
    }


def app_info(endpoint_path: str = "/mcp") -> dict[str, Any]:
    """Payload returned by the `app://info` resource."""
    return {
        "name": SERVER_NAME,
        "language": SERVER_LANGUAGE,
        "version": SERVER_VERSION,
        "transport": SERVER_TRANSPORT,
        "endpoint": endpoint_path,
        "tools": list(TOOL_NAMES),
        "resources": list(RESOURCE_URIS),
        "prompts": list(PROMPT_NAMES),
    }


def summarize_text_prompt(text: str) -> str:
    """Reusable prompt asking the model to summarize a piece of text."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("`text` must be a non-empty string")
    return (
        "Please produce a concise, faithful summary of the text below.\n"
        "Keep it under 5 sentences, preserve the original meaning, and do not "
        "invent facts that are not present in the text.\n\n"
        "---BEGIN TEXT---\n"
        f"{text}\n"
        "---END TEXT---"
    )


def explain_code_prompt(code: str, language: str = "python") -> str:
    """Reusable prompt asking the model to explain a code snippet."""
    if not isinstance(code, str) or not code.strip():
        raise ValueError("`code` must be a non-empty string")
    if not isinstance(language, str) or not language.strip():
        language = "unknown"
    return (
        f"Explain the following {language} code as if you were teaching a "
        "junior engineer. Cover:\n"
        "1. What the code does at a high level.\n"
        "2. The role of each major construct or function.\n"
        "3. Any non-obvious behavior, edge cases or potential bugs.\n\n"
        f"```{language}\n{code}\n```"
    )
