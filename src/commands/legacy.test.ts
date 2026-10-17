import { describe, expect, test } from "bun:test";
import { commands } from "./index.ts";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("removed compatibility syntax", () => {
  test.each([
    { args: ["profile"], message: "Unknown argument: profile" },
    { args: ["profile", "griffpatch", "projects"], message: "Unknown arguments:" },
    { args: ["profile", "projects", "--user", "griffpatch"], message: "Unknown arguments:" },
    { args: ["user", "--user", "griffpatch"], message: "Unknown argument: user" },
    { args: ["user", "-u", "griffpatch"], message: "Unknown argument: u" },
    { args: ["u", "--user", "griffpatch"], message: "Unknown argument: user" },
    { args: ["account"], message: "Missing required argument: <action>" },
    { args: ["account", "--about", "Hello"], message: "Missing required argument: <action>" },
    { args: ["help", "profile"], message: "Invalid values:" },
  ])("rejects $args without invoking a handler", ({ args, message }) => {
    const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);
    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(message);
    expect(new TextDecoder().decode(result.stdout)).not.toContain("Logging");
  });

  test("does not register the former command or user options", () => {
    expect(commands.profile).toBeUndefined();
    expect(commands.user?.options?.some((option) => option.name === "user" || option.alias === "u")).toBe(false);
    expect(commands.user?.aliases).toContain("u");
    expect(commands.studio?.options?.some((option) => option.name === "user")).toBe(true);
  });

  test("completion retains modern sections but not the removed syntax", () => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "completion"]);
    const stdout = new TextDecoder().decode(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(stdout).not.toContain("'profile:");
    expect(stdout).not.toContain("    profile)");
    expect(stdout).not.toContain("python profile project");
    const userCompletion = stdout.split("\n    user|u)\n")[1];
    expect(userCompletion).toContain("--section");
    expect(userCompletion).not.toContain("--user");
    expect(userCompletion).not.toContain("{-u,");
  });
});
