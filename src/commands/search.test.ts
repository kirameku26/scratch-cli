import {
  describe,
  expect,
  test,
} from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("search command validation", () => {
  test.each([
    {
      args: ["search"],
      message: 'Error: Missing required arguments: <type> (choose "project" or "studio"), <query> (search query).',
    },
    {
      args: ["search", "project"],
      message: "Error: Missing required argument: <query> (search query).",
    },
    {
      args: ["search", "--limit", "5", "project"],
      message: "Error: Missing required argument: <query> (search query).",
    },
  ])("names missing required positionals", ({ args, message }) => {
    const result = Bun.spawnSync([
      process.execPath,
      entrypoint,
      ...args,
    ]);
    const stdout = new TextDecoder().decode(result.stdout);
    const stderr = new TextDecoder().decode(result.stderr);

    expect(result.exitCode).toBe(1);
    expect(stdout).toContain("scc search <type> <query>");
    expect(stderr.trim()).toBe(message);
  });

  test.each([
    {
      args: ["search", "project", "  "],
      message: "Search query must not be empty.",
    },
    {
      args: ["search", "project", "cat", "--limit", "0"],
      message: "Limit must be an integer between 1 and 40.",
    },
    {
      args: ["search", "project", "cat", "--offset", "-1"],
      message: "Offset must be a non-negative integer.",
    },
    {
      args: ["search", "project", "cat", "--mode", "newest"],
      message: 'Invalid values:\n  Argument: mode, Given: "newest", Choices: "trending", "popular"',
    },
    {
      args: ["search", "project", "cat", "--language", "../ja"],
      message: "Language must be a valid language code",
    },
  ])("rejects invalid arguments without starting a search", async ({ args, message }) => {
    const result = Bun.spawnSync([
      process.execPath,
      entrypoint,
      ...args,
    ]);
    const stderr = new TextDecoder().decode(result.stderr);

    expect(result.exitCode).toBe(1);
    expect(stderr).toContain(message);
  });

  test("documents trending and popular search modes", () => {
    const result = Bun.spawnSync([
      process.execPath,
      entrypoint,
      "search",
      "--help",
    ]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("--mode");
    expect(stdout).toContain('choices: "trending", "popular"');
    expect(stdout).toContain('default: "trending"');
    expect(stdout).toContain("--language");
    expect(stdout).toContain('choices: "project", "studio"');
  });
});
