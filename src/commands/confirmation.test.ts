import { expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

test.each([
  ["project", "create"], ["project", "remix", "123"],
  ["project", "unshare", "123"], ["project", "settings", "123", "--comments", "on"],
  ["studio", "settings", "123", "--comments", "off"],
  ["studio", "settings", "123", "--open-to-all", "on"],
  ["account", "settings", "--comments", "off"],
  ["project", "love", "123"], ["project", "unlove", "123"],
  ["project", "favorite", "123"], ["project", "unfavorite", "123"],
  ["project", "comment", "123", "--text", "Public message"],
  ["project", "reply", "123", "--comment-id", "456", "--text", "Public reply"],
  ["studio", "create"], ["studio", "accept-invite", "123"],
  ["studio", "follow", "123"], ["studio", "unfollow", "123"],
  ["studio", "comment", "123", "--text", "Public message"],
  ["studio", "reply", "123", "--comment-id", "456", "--text", "Public reply"],
  ["user", "griffpatch", "follow"], ["user", "griffpatch", "unfollow"],
  ["user", "griffpatch", "comment", "--text", "Public message"],
  ["user", "griffpatch", "reply", "--comment-id", "456", "--text", "Public reply"],
].map((args) => ({ args, label: args.join(" ") })))("a mutation cannot run with noninteractive input: $label", ({ args }) => {
  const result = Bun.spawnSync([process.execPath, entrypoint, ...args], { stdin: new Blob(["yes\n"]) });
  expect(result.exitCode).toBe(1);
  expect(new TextDecoder().decode(result.stderr)).toContain("requires confirmation in an interactive terminal");
});
