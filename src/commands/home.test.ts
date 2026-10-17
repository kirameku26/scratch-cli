import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;
const homeModule = new URL("../python/home.ts", import.meta.url).href;

describe("home command", () => {
  test("lists all sections without loading data", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "home"]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    for (const section of [
      "whats-happening", "news", "featured-projects", "featured-studios",
      "design-studio", "following-loves", "most-loved", "most-remixed",
      "newest-projects", "following-projects", "following-studio-projects",
      "viewed-projects",
    ]) {
      expect(stdout).toContain(section);
    }
  });

  test("documents sections, pagination, and the frontpage alias", () => {
    const help = Bun.spawnSync([process.execPath, entrypoint, "home", "--help"]);
    const alias = Bun.spawnSync([process.execPath, entrypoint, "frontpage"]);
    const stdout = new TextDecoder().decode(help.stdout);

    expect(help.exitCode).toBe(0);
    expect(stdout).toContain("whats-happening");
    expect(stdout).toContain("following-loves");
    expect(stdout).toContain("--limit");
    expect(stdout).toContain("--offset");
    expect(alias.exitCode).toBe(0);
    expect(new TextDecoder().decode(alias.stdout)).toContain("Available home sections:");
  });

  test.each([
    {
      args: ["home", "news", "--limit", "0"],
      message: "Limit must be an integer between 1 and 40.",
    },
    {
      args: ["home", "featured-projects", "--offset", "-1"],
      message: "Offset must be a non-negative integer.",
    },
    {
      args: ["home", "--list", "news"],
      message: "--list cannot be combined with a section.",
    },
  ])("rejects invalid arguments before loading data", ({ args, message }) => {
    const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(message);
  });

  test("requires a session before loading a private section", () => {
    const configPath = join(tmpdir(), `scc-home-test-${crypto.randomUUID()}.json`);
    const script = `import { getHomeSection } from ${JSON.stringify(homeModule)}; await getHomeSection({ section: "whats-happening", limit: 10, offset: 0 }, ${JSON.stringify(configPath)});`;
    const result = Bun.spawnSync([process.execPath, "-e", script]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain("No active session");
  });
});
