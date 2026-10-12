import { describe, expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("account command", () => {
  test("describes the active account without a username option", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "account", "--help"]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("show details for the active Scratch account");
    expect(stdout).not.toContain("--user");
  });

  test("rejects a username option before requesting account details", () => {
    const result = Bun.spawnSync([
      process.execPath,
      entrypoint,
      "account",
      "--user",
      "someone_else",
    ]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain("Unknown argument: user");
  });
});
