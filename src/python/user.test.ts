import {
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveConfig } from "../config.ts";
import { buildUserProcess, getUser } from "./user.ts";

describe("user Python process", () => {
  test("passes the session through stdin instead of process arguments", async () => {
    const sessionId = "private-session-value";
    const processInput = buildUserProcess(sessionId, "griffpatch");

    expect(processInput.args).not.toContain(sessionId);
    expect(processInput.args.slice(-2)).toEqual(["--user", "griffpatch"]);
    expect(await processInput.stdin.text()).toBe(
      JSON.stringify({ session_id: sessionId }),
    );
  });
});

test("a missing local login fails without starting Python", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scc-user-logged-out-"));
  const originalCode = process.exitCode;
  const spawn = spyOn(Bun, "spawnSync");
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    await getUser({}, join(directory, "missing.json"));
    expect(spawn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("No active session. Run `scc login` first.");
    expect(process.exitCode).toBe(1);
  } finally {
    spawn.mockRestore(); error.mockRestore(); process.exitCode = originalCode ?? 0;
    await rm(directory, { recursive: true, force: true });
  }
});

test("Python tracebacks are not printed when user loading fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scc-user-error-"));
  const configPath = join(directory, "config.json");
  const originalCode = process.exitCode;
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({
    exitCode: 1, stdout: Buffer.from("private-session"), stderr: Buffer.from("Traceback: private-session"),
  }) as ReturnType<typeof Bun.spawnSync>);
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    await saveConfig({ scratchsessionsid: "private-session" }, configPath);
    await getUser({}, configPath);
    expect(error.mock.calls.flat().join(" ")).not.toContain("private-session");
    expect(process.exitCode).toBe(1);
  } finally {
    spawn.mockRestore(); error.mockRestore(); process.exitCode = originalCode ?? 0;
    await rm(directory, { recursive: true, force: true });
  }
});

test.each([
  { following: true, label: "Yes" },
  { following: false, label: "No" },
  { following: null, label: "Unknown" },
])("self user details display Following: $label", async ({ following, label }) => {
  const directory = await mkdtemp(join(tmpdir(), "scc-self-user-"));
  const configPath = join(directory, "config.json");
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({
    exitCode: 0,
    stdout: Buffer.from(JSON.stringify({ username: "active_user", is_myself: true, following })),
    stderr: Buffer.from(""),
  }) as ReturnType<typeof Bun.spawnSync>);
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    await saveConfig({ scratchsessionsid: "private-test-session" }, configPath);
    await getUser({}, configPath);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(output).toHaveBeenCalledWith(`Following: ${label}`);
    expect(output).not.toHaveBeenCalledWith("Following: Self");
  } finally {
    spawn.mockRestore();
    output.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
