import { expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;
function run(...args: string[]) {
  const result = Bun.spawnSync([process.execPath, entrypoint, "forum", ...args], { stdin: new Blob(["yes\n"]) });
  return { code: result.exitCode, out: new TextDecoder().decode(result.stdout), err: new TextDecoder().decode(result.stderr) };
}

test("forum help describes public reads and confirmed subscriptions", () => {
  const result = run("--help");
  expect(result.code).toBe(0);
  for (const action of ["categories", "topics", "topic", "posts", "post", "source", "follow", "unfollow"]) expect(result.out).toContain(action);
  expect(result.out).toContain("Creating posts and replies is not supported");
});

test.each([
  { args: ["categories", "18"], message: "does not accept an ID" },
  { args: ["categories", "--page", "1"], message: "only for forum topics and posts" },
  { args: ["topic"], message: "positive integer" },
  { args: ["topic", "-1"], message: "positive integer" },
  { args: ["post", "1.5"], message: "positive integer" },
  { args: ["posts", "1", "--page", "0"], message: "Page must be" },
  { args: ["topics", "18", "--limit", "41"], message: "Limit must be" },
  { args: ["source", "123", "--limit", "20"], message: "only for forum topics and posts" },
  { args: ["follow", "123"], message: "requires confirmation in an interactive terminal" },
  { args: ["unfollow", "123"], message: "requires confirmation in an interactive terminal" },
  { args: ["reply", "123"], message: "Invalid values" },
])("invalid or noninteractive forum actions stop before a request: $args", ({ args, message }) => {
  const result = run(...args);
  expect(result.code).toBe(1);
  expect(result.err).toContain(message);
});
