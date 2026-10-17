import { expect, test } from "bun:test";

const entry = new URL("../../index.ts", import.meta.url).pathname;
test.each([
  { args: ["project", "comments", "123", "--limit", "41"], message: "Limit must" },
  { args: ["project", "comments", "123", "--offset", "-1"], message: "Offset must" },
  { args: ["project", "comments", "123", "--text", "Hello"], message: "does not accept" },
  { args: ["project", "reactions", "123", "--limit", "20"], message: "available only" },
  { args: ["project", "settings", "123"], message: "Provide --comments" },
  { args: ["project", "unshare", "123", "--comments", "off"], message: "available only" },
  { args: ["studio", "projects", "0"], message: "positive integer" },
  { args: ["studio", "projects", "123", "--offset", "-1"], message: "Offset must" },
  { args: ["studio", "activity", "123", "--offset", "0"], message: "not available" },
  { args: ["studio", "role", "123", "--user", "other"], message: "does not accept" },
  { args: ["studio", "settings", "123", "--comments", "on", "--open-to-all", "on"], message: "exactly one" },
  { args: ["account", "settings", "--comments", "off", "--cat-ears", "off"], message: "without other" },
  { args: ["account", "edit-profile", "--comments", "off"], message: "available only" },
])("invalid state or list options stop before any API request: $args", ({ args, message }) => {
  const result = Bun.spawnSync([process.execPath, entry, ...args], { stdin: new Blob([]) });
  expect(result.exitCode).toBe(1);
  expect(new TextDecoder().decode(result.stderr)).toContain(message);
});
