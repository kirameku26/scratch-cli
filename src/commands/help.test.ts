import { describe, expect, test } from "bun:test";
import { commands } from "./index.ts";
import { actionHelp, actionHelpTarget } from "./action-help.ts";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

function run(...args: string[]) {
  const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);
  return {
    code: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

describe("command help navigation", () => {
  test.each([[], ["--help"], ["-h"], ["help"]].map((args) => ({ args })))("main help groups commands by purpose", ({ args }) => {
    const result = run(...args);
    expect(result.code).toBe(0);
    for (const label of ["Login and account:", "Browse and discover:", "Projects and studios:", "Teacher tools:"]) {
      expect(result.stdout).toContain(label);
    }
    expect(result.stdout).toContain("scc help <command>");
    expect(result.stderr).toBe("");
  });

  test.each(["project", "studio", "class", "forum"])("bare %s opens help without attempting an action", (name) => {
    const bare = run(name);
    const explicit = run("help", name);
    expect(bare.code).toBe(0);
    expect(bare.stdout).toBe(explicit.stdout);
    expect(bare.stdout).toContain("Examples:");
    expect(bare.stdout).not.toContain("Logging");
    expect(bare.stderr).toBe("");
  });

  test("command help supports aliases and the old --help form", () => {
    expect(run("help", "messages").stdout).toBe(run("notifications", "--help").stdout);
    expect(run("help", "project").stdout).toBe(run("project", "--help").stdout);
    expect(run("help", "logout").stdout).toContain("--local");
    expect(run("u", "--help").stdout).toBe(run("user", "--help").stdout);
  });

  test("unknown help targets fail rather than running another command", () => {
    const result = run("help", "nonexistent");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Error:");
    expect(result.stdout).not.toContain("Logging in");
  });
});

describe("action details", () => {
  test.each([
    { command: "project", action: "edit", direct: ["project", "edit", "--help"], contains: ["Edit a project's title", "at least one", "--instructions", "interactive confirmation"], excludes: ["--file", "--category", "Actions and sections:"] },
    { command: "studio", action: "transfer", direct: ["studio", "transfer", "-h"], contains: ["--user <string> [required]", "transfer <id> to <username>", "password without echo"], excludes: ["--file", "--project"] },
    { command: "class", action: "create-studio", direct: ["class", "create-studio", "--help"], contains: ["<id>", "--title <string> [required]", "teacher account", "100 characters"], excludes: ["--open", "--status"] },
    { command: "user", action: "reply", direct: ["user", "griffpatch", "reply", "--help"], contains: ["user <username> reply", "--text <string> [required]", "--comment-id <number> [required]", "500 characters"], excludes: ["--section", "--report-type"] },
    { command: "account", action: "change-password", direct: ["account", "change-password", "--help"], contains: ["change-password <account>", "read without echo", "6–128 characters"], excludes: ["--password", "--email", "--country"] },
    { command: "notifications", action: "count", direct: ["messages", "count", "--help"], contains: ["unread message count", "scc notifications count"], excludes: ["--limit", "--offset", "interactive confirmation"] },
    { command: "forum", action: "posts", direct: ["forum", "posts", "123", "--help"], contains: ["<id>", "--page", "No login required", "plain text"], excludes: ["interactive confirmation", "--text"] },
    { command: "forum", action: "follow", direct: ["forum", "follow", "123", "--help"], contains: ["<id>", "logged-in", "interactive confirmation"], excludes: ["--page", "--limit"] },
  ])("shows focused $command $action help through both forms", ({ command, action, direct, contains, excludes }) => {
    const explicit = run("help", command, action);
    expect(explicit.code).toBe(0);
    expect(explicit.stderr).toBe("");
    expect(explicit.stdout).toBe(run(...direct).stdout);
    expect(explicit.stdout).toContain("Example:");
    for (const text of contains) expect(explicit.stdout).toContain(text);
    for (const text of excludes) expect(explicit.stdout).not.toContain(text);
  });

  test("every registered action has help using only registered options", () => {
    for (const [name, command] of Object.entries(commands)) {
      const actions = command.positionals?.find((positional) => positional.name === "action")?.choices;
      for (const action of actions ?? []) {
        const help = actionHelp({ command: name, action }, commands);
        expect(help).toContain("Requirements:");
        expect(help).toContain("Example:");
      }
    }
  });

  test("help documents confirmation for every Scratch mutation", () => {
    const readonly = new Set(["details", "list", "comments", "managers", "curators", "students", "studios", "scratcher-status", "count", "categories", "topics", "topic", "posts", "post", "source", "remixes", "reactions", "projects", "activity", "role", "download"]);
    for (const name of ["project", "studio", "user", "account", "class", "notifications", "forum"]) {
      const actions = commands[name]?.positionals?.find((positional) => positional.name === "action")?.choices ?? [];
      for (const action of actions) {
        if (!readonly.has(action)) expect(actionHelp({ command: name, action }, commands)).toContain("interactive");
      }
    }
  });

  test("aliases resolve to the same action details", () => {
    expect(run("help", "u", "follow").stdout).toBe(run("help", "user", "follow").stdout);
    expect(run("help", "messages", "read").stdout).toBe(run("notifications", "read", "--help").stdout);
  });

  test.each([
    { args: ["help", "project", "nonexistent"] },
    { args: ["project", "nonexistent", "--help"] },
    { args: ["help", "user", "nonexistent"] },
  ])("rejects unknown action help without running an action", ({ args }) => {
    const result = run(...args);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown");
    expect(result.stdout).not.toContain("Logging");
  });

  test("help does not inspect local files or require an actual project", () => {
    const result = run("project", "thumbnail", "0", "--file", "/nonexistent/action-help-thumbnail.png", "--help");
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("--file <string> [required]");
    expect(result.stdout).not.toContain("/nonexistent/");
  });

  test("option values and text after -- are not interpreted as help requests", () => {
    expect(actionHelpTarget(["project", "comment", "123", "--text=--help"], commands)).toBeUndefined();
    expect(actionHelpTarget(["project", "comment", "123", "--", "--help"], commands)).toBeUndefined();
    expect(actionHelpTarget(["project", "edit", "--help=false"], commands)).toBeUndefined();
    expect(actionHelpTarget(["project", "--title", "edit", "--help"], commands)).toBeUndefined();
  });
});
