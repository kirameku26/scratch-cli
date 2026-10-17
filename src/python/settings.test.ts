import { expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveConfig } from "../config.ts";
import { confirmationIO } from "../confirmation.ts";
import { runDangerousManagement, runManagement, type ManagementArguments } from "./management.ts";

test("settings confirmation carries the desired state and renders verified or unchanged results", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scc-settings-"));
  const configPath = join(directory, "config.json");
  const originalCode = process.exitCode;
  const interactive = spyOn(confirmationIO, "interactive").mockReturnValue(true);
  const answer = spyOn(confirmationIO, "readAnswer").mockResolvedValue("yes");
  const print = spyOn(confirmationIO, "print").mockImplementation(() => {});
  const prompt = spyOn(confirmationIO, "prompt").mockImplementation(() => {});
  const log = spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    await saveConfig({ scratchsessionsid: "private" }, configPath);
    for (const args of [
      { entity: "project", action: "settings", payload: { project_id: 7, comments: false } },
      { entity: "studio", action: "settings", payload: { studio_id: 8, open_to_all: true } },
      { entity: "account", action: "settings", payload: { comments: true } },
    ] satisfies ManagementArguments[]) {
      let input: Blob | undefined;
      const spawn = spyOn(Bun, "spawnSync").mockImplementation((...parameters: unknown[]) => {
        const identity = (parameters[0] as string[]).at(-1) === "identify";
        if (!identity) input = (parameters[1] as { stdin: Blob }).stdin;
        const data = identity ? { entity: "account", action: "identify", account: "active_user" }
          : { ...args, ...args.payload, account: "active_user", changed: false };
        return { exitCode: 0, stdout: Buffer.from(JSON.stringify(data)), stderr: Buffer.from("") } as ReturnType<typeof Bun.spawnSync>;
      });
      try {
        const ok = await runDangerousManagement(args, (account) => `Account: ${account}\nAction: settings`, configPath);
        expect(ok).toBe(true);
        expect(spawn).toHaveBeenCalledTimes(2);
        expect(JSON.parse(await input!.text())).toEqual({ session_id: "private", ...args.payload, expected_account: "active_user" });
        expect(error).not.toHaveBeenCalled();
      } finally { spawn.mockRestore(); }
    }
    expect(log).toHaveBeenCalledWith("Comments: Off");
    expect(log).toHaveBeenCalledWith("Open to all: On");
    expect(log).toHaveBeenCalledWith("No setting change needed for account as active_user.");
  } finally {
    for (const mock of [interactive, answer, print, prompt, log, error]) mock.mockRestore();
    process.exitCode = originalCode ?? 0;
    await rm(directory, { recursive: true, force: true });
  }
});

test("reaction and role status do not prompt for confirmation and validate booleans", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scc-state-"));
  const configPath = join(directory, "config.json");
  const originalCode = process.exitCode;
  const answer = spyOn(confirmationIO, "readAnswer");
  const log = spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    await saveConfig({ scratchsessionsid: "private" }, configPath);
    for (const malformed of [false, true]) {
      for (const args of [
        { entity: "project", action: "reactions", payload: { project_id: 7 } },
        { entity: "studio", action: "role", payload: { studio_id: 8 } },
      ] satisfies ManagementArguments[]) {
        const data = { ...args, ...args.payload, account: "active_user", loved: malformed ? null : true, favorited: false,
          role: { manager: malformed ? null : true, curator: true, invited: false, following: false } };
        const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({ exitCode: 0, stdout: Buffer.from(JSON.stringify(data)), stderr: Buffer.from("") }) as ReturnType<typeof Bun.spawnSync>);
        try {
          await runManagement(args, configPath);
          expect(spawn).toHaveBeenCalledTimes(1);
          if (malformed) expect(process.exitCode).toBe(1);
        } finally { spawn.mockRestore(); }
      }
    }
    expect(answer).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Loved: Yes");
    expect(log).toHaveBeenCalledWith("Favorited: No");
    expect(log).toHaveBeenCalledWith("manager: Yes");
  } finally {
    for (const mock of [answer, log, error]) mock.mockRestore();
    process.exitCode = originalCode ?? 0;
    await rm(directory, { recursive: true, force: true });
  }
});
