import { describe, expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("class command", () => {
  test("documents teacher class operations", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "class", "--help"]);
    const output = new TextDecoder().decode(result.stdout);
    expect(result.exitCode).toBe(0);
    for (const word of ["create-studio", "students", "studios", "--open", "--page"]) {
      expect(output).toContain(word);
    }
  });

  test.each([
    { args: ["class", "create"], expected: "Class creation requires --title" },
    { args: ["class", "students", "0"], expected: "Class ID must be a positive integer" },
    { args: ["class", "list", "--page", "0"], expected: "Page must be a positive integer" },
    { args: ["class", "edit", "25", "--open", "off"], expected: "requires confirmation in an interactive terminal" },
    { args: ["class", "create", "--title", "New class"], expected: "requires confirmation in an interactive terminal" },
  ])("rejects invalid or noninteractive mutation", ({ args, expected }) => {
    const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);
    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(expected);
  });
});
