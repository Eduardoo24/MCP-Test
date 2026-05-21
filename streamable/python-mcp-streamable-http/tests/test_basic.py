"""
Unit tests for the tool-layer logic.

The Streamable HTTP transport is tested manually via `src/client.py` and the
MCP Inspector (see the project README). Spinning up an HTTP server inside
pytest just to exercise the wire format would be brittle, so we focus on
exhaustively testing the pure logic that the tools wrap.
"""

from __future__ import annotations

import re

import pytest

from src.tools import (
    PROMPT_NAMES,
    RESOURCE_URIS,
    SERVER_LANGUAGE,
    SERVER_NAME,
    SERVER_TRANSPORT,
    SERVER_VERSION,
    TOOL_NAMES,
    add_numbers,
    app_info,
    build_demo_log_steps,
    echo,
    explain_code_prompt,
    get_server_time,
    get_system_status,
    summarize_text_prompt,
)


# ---------- echo ----------

def test_echo_returns_input_unchanged() -> None:
    assert echo("hello") == "hello"
    assert echo("") == ""


def test_echo_rejects_non_strings() -> None:
    with pytest.raises(ValueError):
        echo(123)  # type: ignore[arg-type]


# ---------- add_numbers ----------

@pytest.mark.parametrize(
    "a,b,expected",
    [
        (1, 2, 3.0),
        (-1, 1, 0.0),
        (0.5, 0.25, 0.75),
        (1_000_000, 2_500_000, 3_500_000.0),
    ],
)
def test_add_numbers(a: float, b: float, expected: float) -> None:
    assert add_numbers(a, b) == pytest.approx(expected)


@pytest.mark.parametrize("bad", ["x", None, [1], {"a": 1}, True])
def test_add_numbers_rejects_non_numeric(bad: object) -> None:
    with pytest.raises(ValueError):
        add_numbers(bad, 1)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        add_numbers(1, bad)  # type: ignore[arg-type]


# ---------- get_server_time ----------

def test_get_server_time_is_iso8601_with_timezone() -> None:
    out = get_server_time()
    assert set(out.keys()) >= {"iso", "utc", "timezone"}
    # ISO 8601 with timezone offset, e.g. 2026-05-21T08:30:00.000000+00:00
    assert re.match(
        r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?$",
        out["iso"],
    )
    assert out["utc"].endswith("+00:00") or out["utc"].endswith("Z")


# ---------- generate_demo_log ----------

def test_demo_log_returns_expected_steps() -> None:
    entries = build_demo_log_steps(5)
    assert len(entries) == 5
    assert [e.step for e in entries] == [1, 2, 3, 4, 5]
    assert all(e.total == 5 for e in entries)
    assert all("Processing step" in e.message for e in entries)


@pytest.mark.parametrize("bad", [0, -1, 51, 1.5, "3", True])
def test_demo_log_validates_steps(bad: object) -> None:
    with pytest.raises(ValueError):
        build_demo_log_steps(bad)  # type: ignore[arg-type]


# ---------- get_system_status ----------

def test_system_status_shape() -> None:
    status = get_system_status()
    assert status["language"] == SERVER_LANGUAGE
    assert status["name"] == SERVER_NAME
    assert status["version"] == SERVER_VERSION
    assert status["transport"] == SERVER_TRANSPORT
    assert isinstance(status["uptime_seconds"], (int, float))
    assert status["uptime_seconds"] >= 0
    assert set(status["tools"]) == set(TOOL_NAMES)
    assert set(status["resources"]) == set(RESOURCE_URIS)
    assert set(status["prompts"]) == set(PROMPT_NAMES)


# ---------- app://info ----------

def test_app_info_includes_endpoint() -> None:
    info = app_info("/mcp")
    assert info["endpoint"] == "/mcp"
    assert info["transport"] == SERVER_TRANSPORT
    assert info["name"] == SERVER_NAME


# ---------- prompts ----------

def test_summarize_prompt_contains_input_text() -> None:
    text = "hello world"
    prompt = summarize_text_prompt(text)
    assert "summary" in prompt.lower()
    assert text in prompt


@pytest.mark.parametrize("bad", ["", "   "])
def test_summarize_prompt_rejects_empty(bad: str) -> None:
    with pytest.raises(ValueError):
        summarize_text_prompt(bad)


def test_explain_code_prompt_mentions_language() -> None:
    code = "print('hello')"
    prompt = explain_code_prompt(code, "python")
    assert "python" in prompt
    assert code in prompt


def test_explain_code_prompt_rejects_empty_code() -> None:
    with pytest.raises(ValueError):
        explain_code_prompt("", "python")
