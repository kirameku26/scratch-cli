import { expect, spyOn, test } from "bun:test";
import { showCollection, type CollectionArguments } from "./collections.ts";

test.each(["comments", "remixes", "studios", "projects", "activity"] as const)("public $action collection uses no credentials and sanitizes terminal controls", async (action) => {
  const args: CollectionArguments = { entity: ["projects", "activity"].includes(action) ? "studio" : "project", action, id: 123, limit: 20, offset: 0 };
  const item = action === "comments" ? { id: 456, author: "author", content: "Hello\x1b[2J\nWorld", created_at: null }
    : action === "activity" ? { action: "addproject", actor: "author", target: "Project\x1b[2J", when: null }
    : { id: 456, title: "Title\x1b[2J", url: `https://scratch.mit.edu/${action === "studios" ? "studios" : "projects"}/456/` };
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({ exitCode: 0, stdout: Buffer.from(JSON.stringify({ ...args, items: [item] })), stderr: Buffer.from("") }) as ReturnType<typeof Bun.spawnSync>);
  const log = spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    await showCollection(args);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect((spawn.mock.calls[0]?.[1] as { stdin?: unknown }).stdin).toBeUndefined();
    expect(error).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).not.toContain("\x1b");
  } finally { spawn.mockRestore(); log.mockRestore(); error.mockRestore(); }
});

test("collection errors and malformed responses fail safely", async () => {
  for (const data of [{ entity: "studio", action: "projects", id: 999, items: [] }, { entity: "studio", action: "projects", id: 123, items: [{}] }]) {
    const originalCode = process.exitCode;
    const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({ exitCode: 0, stdout: Buffer.from(JSON.stringify(data)), stderr: Buffer.from("private") }) as ReturnType<typeof Bun.spawnSync>);
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      await showCollection({ entity: "studio", action: "projects", id: 123, limit: 20, offset: 0 });
      expect(process.exitCode).toBe(1);
      expect(error).toHaveBeenCalledWith("Received an invalid Scratch collection response.");
    } finally { spawn.mockRestore(); error.mockRestore(); process.exitCode = originalCode ?? 0; }
  }
});
