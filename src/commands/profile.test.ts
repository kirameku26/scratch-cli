import { describe, expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("user profile sections", () => {
  test.each([
    { args: ["user", "griffpatch", "--section", "unknown"], message: "Invalid values:" },
    { args: ["user", "griffpatch", "--section", "projects", "--limit", "41"], message: "Limit must be an integer between 1 and 40." },
    { args: ["user", "griffpatch", "--section", "projects", "--limit", "0"], message: "Limit must be an integer between 1 and 40." },
    { args: ["user", "griffpatch", "--section", "followers", "--offset", "-1"], message: "Offset must be a non-negative integer." },
    { args: ["user", "griffpatch", "--section", "comments", "--page", "0"], message: "Page must be a positive integer." },
    { args: ["user", "griffpatch", "--section", "comments", "--limit", "10"], message: "Use --page for comments" },
    { args: ["user", "griffpatch", "--section", "projects", "--page", "0"], message: "Page must be a positive integer." },
    { args: ["user", "griffpatch", "--section", "about", "--limit", "2"], message: "Pagination options are not available" },
    { args: ["user", "../other", "--section", "projects"], message: "Username may contain only" },
  ])("rejects invalid arguments before a network request", ({ args, message }) => {
    const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(message);
  });

  test("lists sections without loading a profile", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "user", "--list"]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    for (const section of [
      "about", "projects", "favorites", "studios", "followed-studios",
      "following", "followers", "comments",
    ]) {
      expect(stdout).toContain(section);
    }
  });

  test("documents sections, the username argument, and the active-account default", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "user", "--help"]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    for (const section of [
      "about", "projects", "favorites", "studios", "followed-studios",
      "following", "followers", "comments",
    ]) {
      expect(stdout).toContain(section);
    }
    expect(stdout).toContain("[username]");
    expect(stdout).not.toContain("--user");
    expect(stdout).toContain("default: logged-in account");
  });
});
