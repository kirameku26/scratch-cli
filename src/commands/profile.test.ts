import { describe, expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("profile command", () => {
  test.each([
    { args: ["profile", "unknown"], message: "Section must be one of:" },
    { args: ["profile", "griffpatch", "unknown"], message: "Section must be one of:" },
    { args: ["profile", "projects", "--user", "griffpatch", "--limit", "41"], message: "Limit must be an integer between 1 and 40." },
    { args: ["profile", "griffpatch", "projects", "--limit", "0"], message: "Limit must be an integer between 1 and 40." },
    { args: ["profile", "followers", "--user", "griffpatch", "--offset", "-1"], message: "Offset must be a non-negative integer." },
    { args: ["profile", "comments", "--user", "griffpatch", "--page", "0"], message: "Page must be a positive integer." },
    { args: ["profile", "comments", "--user", "griffpatch", "--limit", "10"], message: "Use --page for comments" },
    { args: ["profile", "projects", "--user", "griffpatch", "--page", "2"], message: "--page is available only for comments." },
    { args: ["profile", "about", "--user", "griffpatch", "--limit", "2"], message: "Pagination options are not available" },
    { args: ["profile", "projects", "--user", "../other"], message: "Username may contain only" },
    { args: ["profile", "griffpatch", "projects", "--user", "other"], message: "Specify the user either" },
  ])("rejects invalid arguments before a network request", ({ args, message }) => {
    const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(message);
  });

  test("lists sections without loading a profile", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "profile", "--list"]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    for (const section of [
      "about", "projects", "favorites", "studios", "followed-studios",
      "following", "followers", "comments",
    ]) {
      expect(stdout).toContain(section);
    }
  });

  test("documents the username option and the active-account default", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "profile", "--help"]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("--user");
    expect(stdout).toContain("default: logged-in account");
  });
});
