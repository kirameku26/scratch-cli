import { describe, expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("project interaction command", () => {
  test("documents reversible project actions", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "project", "--help"]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    for (const action of [
      "love", "unlove", "favorite", "unfavorite", "comment", "list", "create",
      "remix", "share", "trash",
      "details", "restore", "edit", "thumbnail", "report", "report-comment", "reply",
    ]) {
      expect(stdout).toContain(action);
    }
    expect(stdout).toContain("--text");
    expect(stdout).toContain("--visibility");
    expect(stdout).toContain("--title");
    expect(stdout).toContain("--file");
    expect(stdout).toContain("--comment-id");
  });

  test.each([
    {
      args: ["project", "love", "0"],
      message: "Project ID must be a positive integer.",
    },
    {
      args: ["project", "comment", "123"],
      message: "Comment text must not be empty.",
    },
    {
      args: ["project", "love", "123", "--text", "unused"],
      message: "--text is available only for comments.",
    },
    {
      args: ["project", "comment", "123", "--text", "x".repeat(501)],
      message: "Comment text must be 500 characters or fewer.",
    },
    {
      args: ["project", "list", "123"],
      message: "Project list does not accept an ID or mutation options",
    },
    {
      args: ["project", "list", "--page", "0"],
      message: "Page must be a positive integer.",
    },
    {
      args: ["project", "create", "--title", "  "],
      message: "Project title must not be empty.",
    },
    {
      args: ["project", "share", "123"],
      message: "requires confirmation in an interactive terminal",
    },
    {
      args: ["project", "reply", "123", "--text", "reply"],
      message: "Reply comment ID must be a positive integer",
    },
    {
      args: ["project", "report", "123", "--category", "20", "--reason", "reason"],
      message: "Project report requires --category 0-19",
    },
    {
      args: ["project", "report", "123", "--category", "6", "--reason", "reason", "--title", "unused"],
      message: "Project report accepts only --category and --reason.",
    },
  ])("rejects invalid input before loading the session", ({ args, message }) => {
    const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(message);
  });
});
