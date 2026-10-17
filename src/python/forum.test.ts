import { expect, spyOn, test } from "bun:test";
import { buildForumProcess, runForum, type ForumAction } from "./forum.ts";

test("forum processes keep credentials in stdin and public reads have none", async () => {
  const args = { action: "follow" as const, id: 123, page: 1, limit: 20 };
  const input = buildForumProcess(args, "private-session", "active_user");
  expect(input.args.join(" ")).not.toContain("private-session");
  expect(input.args.slice(-4)).toEqual(["follow", "123", "1", "20"]);
  expect(JSON.parse(await input.stdin!.text())).toEqual({ session_id: "private-session", expected_account: "active_user" });
  expect(buildForumProcess({ ...args, action: "posts" }).stdin).toBeUndefined();
});

test.each(["categories", "topics", "topic", "posts", "post", "source"] as const)("public forum %s requires no saved login and sanitizes output", async (action) => {
  const id = action === "categories" ? undefined : 123;
  const kind = action === "categories" ? "category" : ["topic", "topics"].includes(action) ? "topic" : "post";
  const data = { action, id: id ?? null, page: ["topics", "posts"].includes(action) ? 2 : null,
    ...(action === "source" ? { source: "[b]Text[/b]\n\x1b[2J" } : {
      items: [{ kind, id: 123, title: "Example\x1b[2J", url: `https://scratch.mit.edu/discuss/${kind === "category" ? "" : `${kind}/`}123/`, ...(kind === "post" ? { content: "Hello\nworld\x1b[2J" } : {}) }],
    }),
  };
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({ exitCode: 0, stdout: Buffer.from(JSON.stringify(data)), stderr: Buffer.from("") }) as ReturnType<typeof Bun.spawnSync>);
  const log = spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    await runForum({ action, id, page: 2, limit: 20 }, "/nonexistent/scc-forum-test/config.json");
    expect(spawn).toHaveBeenCalledTimes(1);
    const options = spawn.mock.calls[0]?.[1] as { stdin?: Blob; timeout?: number };
    expect(options.stdin).toBeUndefined();
    expect(options.timeout).toBe(35_000);
    expect(error).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).not.toContain("\x1b");
  } finally { spawn.mockRestore(); log.mockRestore(); error.mockRestore(); }
});

test.each([
  { action: "posts", id: 123, page: 1, items: [] },
  { action: "topic", id: 123, page: null, items: [] },
  { action: "posts", id: 124, page: 2, items: [] },
  { action: "posts", id: 123, page: 2, items: [{ kind: "post", id: 456, title: "Post", content: "Text", url: "https://unsafe.example/" }] },
])("forum rejects mismatched or malformed responses", async (data) => {
  const originalCode = process.exitCode;
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({ exitCode: 0, stdout: Buffer.from(JSON.stringify(data)), stderr: Buffer.from("") }) as ReturnType<typeof Bun.spawnSync>);
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    await runForum({ action: "posts", id: 123, page: 2, limit: 20 });
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith("Received an invalid Scratch forum response.");
  } finally { spawn.mockRestore(); error.mockRestore(); process.exitCode = originalCode ?? 0; }
});

test("forum failures do not print Python tracebacks or retry", async () => {
  const originalCode = process.exitCode;
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({ exitCode: 1, stdout: Buffer.from("not JSON"), stderr: Buffer.from("private-session") }) as ReturnType<typeof Bun.spawnSync>);
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    await runForum({ action: "topic", id: 123, page: 1, limit: 20 });
    expect(process.exitCode).toBe(1);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.flat().join(" ")).not.toContain("private-session");
  } finally { spawn.mockRestore(); error.mockRestore(); process.exitCode = originalCode ?? 0; }
});
