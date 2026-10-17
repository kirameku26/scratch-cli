import { describe, expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("unified user command", () => {
  test("documents the unified syntax and all sections", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "user", "--help"]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("scc user [username] [action]");
    expect(stdout).toContain("--section");
    for (const section of [
      "details", "about", "projects", "favorites", "studios",
      "followed-studios", "following", "followers", "comments",
    ]) {
      expect(stdout).toContain(section);
    }
    for (const action of ["follow", "unfollow", "comment", "reply", "report-comment"]) {
      expect(stdout).toContain(action);
    }
  });

  test("lists sections without loading a user", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "user", "--list"]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("Available user sections:");
    expect(stdout).toContain("details");
    expect(stdout).toContain("comments");
  });

  test.each([
    {
      args: ["user", "griffpatch", "--user", "other"],
      message: "Unknown argument: user",
    },
    {
      args: ["user", "griffpatch", "--limit", "10"],
      message: "Pagination options are not available for the details section.",
    },
    {
      args: ["user", "../other"],
      message: "Username may contain only",
    },
    {
      args: ["user", "griffpatch", "--section", "projects", "--limit", "41"],
      message: "Limit must be an integer between 1 and 40.",
    },
    {
      args: ["user", "--section", "comments", "--limit", "10"],
      message: "Use --page for comments",
    },
    {
      args: ["user", "griffpatch", "comment"],
      message: "Comment text must not be empty.",
    },
    {
      args: ["user", "griffpatch", "follow", "--section", "about"],
      message: "User actions cannot be combined with profile sections",
    },
    {
      args: ["user", "griffpatch", "follow", "--text", "unused"],
      message: "--text is available only for comments.",
    },
    {
      args: ["user", "../other", "follow"],
      message: "Username may contain only",
    },
  ])("rejects invalid unified arguments before loading a user", ({ args, message }) => {
    const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(message);
  });
});
