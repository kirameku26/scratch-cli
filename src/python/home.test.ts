import { expect, spyOn, test } from "bun:test";

import { getHomeSection } from "./home.ts";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveConfig } from "../config.ts";

test("renders the current Scratch Design Studio title", async () => {
  const response = {
    section: "design-studio",
    studio: { id: 30, title: "What If?", url: "https://scratch.mit.edu/studios/30/" },
    items: [{
      id: 20,
      title: "Design project",
      author: "creator",
      love_count: 12,
      url: "https://scratch.mit.edu/projects/20/",
    }],
  };
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({
    exitCode: 0,
    stdout: Buffer.from(JSON.stringify(response)),
    stderr: Buffer.from(""),
  }) as ReturnType<typeof Bun.spawnSync>);
  const output = spyOn(console, "log").mockImplementation(() => {});

  try {
    await getHomeSection({ section: "design-studio", limit: 10, offset: 0 });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0]?.[0]?.slice(-3)).toEqual([
      "design-studio", "10", "0",
    ]);
    expect(output).toHaveBeenCalledWith("Scratch Design Studio - What If?");
    expect(output).toHaveBeenCalledWith("1. Design project");
  } finally {
    spawn.mockRestore();
    output.mockRestore();
  }
});

test("What's Happening renders the requested private feed without exposing credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scc-home-feed-"));
  const configPath = join(directory, "config.json");
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({ exitCode: 0, stdout: Buffer.from(JSON.stringify({
    section: "whats-happening", username: "active_user", items: [{ action: "project_share", actor: "friend",
      target_title: "Shared project", target_url: "https://scratch.mit.edu/projects/3/", created_at: "2026-10-17T00:00:00+00:00" }],
  })), stderr: Buffer.from("") }) as ReturnType<typeof Bun.spawnSync>);
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    await saveConfig({ scratchsessionsid: "private-session" }, configPath);
    await getHomeSection({ section: "whats-happening", limit: 10, offset: 2 }, configPath);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0]?.[0]?.slice(-3)).toEqual(["whats-happening", "10", "2"]);
    expect(spawn.mock.calls[0]?.[0]?.join(" ")).not.toContain("private-session");
    expect(log).toHaveBeenCalledWith("What's Happening? for active_user");
    expect(log).toHaveBeenCalledWith("3. friend project share");
    expect(log.mock.calls.flat().join(" ")).not.toContain("private-session");
  } finally { spawn.mockRestore(); log.mockRestore(); await rm(directory, { recursive: true, force: true }); }
});

test.each([
  "Could not reach Scratch. Check your internet connection and try again.",
  "Scratch rate limit reached. Try again after 120 seconds.",
  "Stored Scratch session is invalid. Run `scc login` again.",
  "Received an invalid Scratch home response.",
])("private home errors are shown without retrying or erasing the saved login: %s", async (message) => {
  const directory = await mkdtemp(join(tmpdir(), "scc-home-error-"));
  const configPath = join(directory, "config.json");
  const originalCode = process.exitCode;
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({ exitCode: 1,
    stdout: Buffer.from(JSON.stringify({ error: message })), stderr: Buffer.from("private-session traceback"),
  }) as ReturnType<typeof Bun.spawnSync>);
  const error = spyOn(console, "error").mockImplementation(() => {});
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    await saveConfig({ scratchsessionsid: "private-session" }, configPath);
    const before = await readFile(configPath, "utf8");
    await getHomeSection({ section: "whats-happening", limit: 10, offset: 0 }, configPath);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith(message);
    expect(error.mock.calls.flat().join(" ")).not.toContain("private-session");
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    expect(await readFile(configPath, "utf8")).toBe(before);
  } finally {
    spawn.mockRestore(); error.mockRestore(); log.mockRestore(); process.exitCode = originalCode ?? 0;
    await rm(directory, { recursive: true, force: true });
  }
});
