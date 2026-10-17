import { describe, expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("studio command", () => {
  test("documents studio management actions", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "studio", "--help"]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("create");
    expect(stdout).toContain("accept-invite");
    expect(stdout).toContain("promote");
    expect(stdout).toContain("delete");
    expect(stdout).toContain("details");
    expect(stdout).toContain("edit");
    expect(stdout).toContain("thumbnail");
    expect(stdout).toContain("add-project");
    expect(stdout).toContain("remove-curator");
    expect(stdout).toContain("transfer");
    expect(stdout).toContain("comments");
    expect(stdout).toContain("list");
    expect(stdout).toContain("--user");
  });

  test.each([
    {
      args: ["studio", "create", "123"],
      message: "Studio creation does not accept an ID or edit options.",
    },
    {
      args: ["studio", "accept-invite"],
      message: "Studio ID must be a positive integer.",
    },
    {
      args: ["studio", "accept-invite", "0"],
      message: "Studio ID must be a positive integer.",
    },
    {
      args: ["studio", "promote", "123"],
      message: "A Scratch username is required with --user.",
    },
    {
      args: ["studio", "delete", "123"],
      message: "requires confirmation in an interactive terminal",
    },
    {
      args: ["studio", "transfer", "123"],
      message: "A Scratch username is required with --user for transfer.",
    },
    {
      args: ["studio", "transfer", "123", "--user", "newowner"],
      message: "requires confirmation in an interactive terminal",
    },
  ])("rejects invalid input before loading the session", ({ args, message }) => {
    const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(message);
  });
});
