import { describe, expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("account command", () => {
  test("documents profile and settings actions", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "account", "--help"]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("edit-profile");
    expect(stdout).toContain("settings");
    expect(stdout).toContain("--featured-project");
    expect(stdout).toContain("--cat-ears");
    expect(stdout).toContain("delete-account");
    expect(stdout).toContain("change-email");
    expect(stdout).toContain("change-password");
    expect(stdout).toContain("scratcher-status");
    expect(stdout).not.toContain("--user");
  });

  test("still rejects selecting another account with --user", () => {
    const result = Bun.spawnSync([
      process.execPath, entrypoint, "account", "settings", "--user", "someone_else",
    ]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain("Unknown argument: user");
  });

  test.each([
    {
      args: ["account", "edit-profile"],
      message: "Provide --about, --working-on, or --featured-project.",
    },
    {
      args: ["account", "edit-profile", "--featured-project", "0"],
      message: "Featured project ID must be a positive integer.",
    },
    {
      args: ["account", "settings", "--country", "  "],
      message: "Country must not be empty.",
    },
    {
      args: ["account", "settings", "--cat-ears", "on"],
      message: "requires confirmation in an interactive terminal",
    },
    {
      args: ["account", "change-email", "--email", "invalid"],
      message: "Provide a valid email address",
    },
    {
      args: ["account", "delete-account"],
      message: "requires confirmation in an interactive terminal",
    },
    {
      args: ["account", "change-password"],
      message: "requires confirmation in an interactive terminal",
    },
  ])("rejects unsafe or invalid input before mutation", ({ args, message }) => {
    const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(message);
  });
});
