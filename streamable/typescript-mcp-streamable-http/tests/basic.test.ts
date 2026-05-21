/**
 * Unit tests for the tool-layer logic.
 *
 * The Streamable HTTP transport is exercised manually by running
 * `npm run client` against `npm run server` (or by pointing MCP Inspector
 * at the same URL). Spinning up an Express server inside tests just to
 * validate the wire protocol is not worth the flakiness, so here we
 * exhaustively cover the pure logic that the tools wrap.
 */

import { describe, expect, it } from "vitest";

import {
  PROMPT_NAMES,
  RESOURCE_URIS,
  SERVER_LANGUAGE,
  SERVER_NAME,
  SERVER_TRANSPORT,
  SERVER_VERSION,
  TOOL_NAMES,
  addNumbers,
  appInfo,
  buildDemoLogSteps,
  echo,
  explainCodePrompt,
  getServerTime,
  getSystemStatus,
  summarizeTextPrompt,
} from "../src/tools.js";

describe("echo", () => {
  it("returns the input unchanged", () => {
    expect(echo("hello")).toBe("hello");
    expect(echo("")).toBe("");
  });

  it("rejects non-strings", () => {
    // @ts-expect-error - testing runtime behaviour
    expect(() => echo(123)).toThrow();
  });
});

describe("addNumbers", () => {
  it.each([
    [1, 2, 3],
    [-1, 1, 0],
    [0.5, 0.25, 0.75],
    [1_000_000, 2_500_000, 3_500_000],
  ])("addNumbers(%s, %s) === %s", (a, b, expected) => {
    expect(addNumbers(a, b)).toBeCloseTo(expected);
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite numbers (%s)", (bad) => {
    expect(() => addNumbers(bad, 1)).toThrow();
    expect(() => addNumbers(1, bad)).toThrow();
  });

  it.each(["1", null, undefined, {}, []])(
    "rejects non-numeric values (%s)",
    (bad) => {
      // @ts-expect-error - testing runtime behaviour
      expect(() => addNumbers(bad, 1)).toThrow();
      // @ts-expect-error - testing runtime behaviour
      expect(() => addNumbers(1, bad)).toThrow();
    },
  );
});

describe("getServerTime", () => {
  it("returns ISO 8601 + UTC + timezone", () => {
    const out = getServerTime();
    expect(out.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    expect(out.utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    expect(typeof out.timezone).toBe("string");
    expect(out.timezone.length).toBeGreaterThan(0);
  });
});

describe("buildDemoLogSteps", () => {
  it("produces N step entries", () => {
    const entries = buildDemoLogSteps(5);
    expect(entries).toHaveLength(5);
    expect(entries.map((e) => e.step)).toEqual([1, 2, 3, 4, 5]);
    expect(entries.every((e) => e.total === 5)).toBe(true);
    expect(entries.every((e) => e.message.includes("Processing step"))).toBe(true);
  });

  it.each([0, -1, 51, 1.5, NaN])("rejects bad step counts (%s)", (bad) => {
    expect(() => buildDemoLogSteps(bad)).toThrow();
  });
});

describe("getSystemStatus", () => {
  it("returns expected shape", () => {
    const status = getSystemStatus();
    expect(status.language).toBe(SERVER_LANGUAGE);
    expect(status.name).toBe(SERVER_NAME);
    expect(status.version).toBe(SERVER_VERSION);
    expect(status.transport).toBe(SERVER_TRANSPORT);
    expect(typeof status.uptime_seconds).toBe("number");
    expect(status.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(new Set(status.tools)).toEqual(new Set(TOOL_NAMES));
    expect(new Set(status.resources)).toEqual(new Set(RESOURCE_URIS));
    expect(new Set(status.prompts)).toEqual(new Set(PROMPT_NAMES));
  });
});

describe("appInfo", () => {
  it("includes the endpoint", () => {
    const info = appInfo("/mcp");
    expect(info.endpoint).toBe("/mcp");
    expect(info.transport).toBe(SERVER_TRANSPORT);
    expect(info.name).toBe(SERVER_NAME);
  });
});

describe("prompts", () => {
  it("summarizeTextPrompt contains the input text", () => {
    const prompt = summarizeTextPrompt("hello world");
    expect(prompt.toLowerCase()).toContain("summary");
    expect(prompt).toContain("hello world");
  });

  it.each(["", "   "])("summarizeTextPrompt rejects empty input (%s)", (bad) => {
    expect(() => summarizeTextPrompt(bad)).toThrow();
  });

  it("explainCodePrompt mentions the language", () => {
    const prompt = explainCodePrompt('console.log("hi")', "typescript");
    expect(prompt).toContain("typescript");
    expect(prompt).toContain('console.log("hi")');
  });

  it("explainCodePrompt rejects empty code", () => {
    expect(() => explainCodePrompt("", "typescript")).toThrow();
  });
});
