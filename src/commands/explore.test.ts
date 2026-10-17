import { describe, expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("explore command validation", () => {
  test.each([
    {
      args: ["explore"],
      message: '<type> (choose "project" or "studio")',
    },
    {
      args: ["explore", "user"],
      message: "Invalid values:",
    },
    {
      args: ["explore", "project", "--mode", "recent"],
      message: "Invalid values:",
    },
    {
      args: ["explore", "project", "--category", "stories"],
      message: "Invalid values:",
    },
    {
      args: ["explore", "studio", "--category", "games"],
      message: "Category is available only for projects.",
    },
    {
      args: ["explore", "project", "--limit", "0"],
      message: "Limit must be an integer between 1 and 40.",
    },
    {
      args: ["explore", "studio", "--offset", "-1"],
      message: "Offset must be a non-negative integer.",
    },
    {
      args: ["explore", "project", "--language", "../ja"],
      message: "Language must be a valid language code",
    },
  ])("rejects invalid arguments without a network request", ({ args, message }) => {
    const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);
    const stderr = new TextDecoder().decode(result.stderr);

    expect(result.exitCode).toBe(1);
    expect(stderr).toContain(message);
  });

  test("shows the default ranking and both resource types in help", () => {
    const result = Bun.spawnSync([
      process.execPath,
      entrypoint,
      "explore",
      "--help",
    ]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('choices: "project", "studio"');
    expect(stdout).toContain('choices: "trending", "popular"');
    expect(stdout).toContain('default: "trending"');
    expect(stdout).toContain('choices: "all", "animations", "art", "games", "music"');
    expect(stdout).toMatch(/default:\s*"all"/);
    expect(stdout).toContain("--language");
  });
});
