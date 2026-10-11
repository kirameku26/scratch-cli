import {
  describe,
  expect,
  test,
} from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("login command", () => {
  test("rejects a password supplied as a command-line option", () => {
    const password = "must-not-appear-in-output";
    const result = Bun.spawnSync([
      process.execPath,
      entrypoint,
      "login",
      "--password",
      password,
    ]);
    const output = [
      new TextDecoder().decode(result.stdout),
      new TextDecoder().decode(result.stderr),
    ].join("\n");

    expect(result.exitCode).toBe(1);
    expect(output).toContain("Unknown argument: password");
    expect(output).not.toContain(password);
  });
});
