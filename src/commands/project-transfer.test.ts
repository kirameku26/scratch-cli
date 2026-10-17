import { expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

test.each([
  ["download"], ["download", "0"], ["download", "123", "--file", "a.sb3"],
  ["download", "123", "--title", "no"], ["download", "123", "--output", "  "],
  ["upload"], ["upload", "-1", "--file", "a.sb3"], ["upload", "123", "--file", "a.sb3", "--title", "no"],
  ["upload", "--file", "a.sb3", "--title", ""], ["upload", "--file", "a.sb3", "--output", "b.sb3"],
  ["upload", "--file", "a.sb3", "--comments", "off"], ["download", "123", "--limit", "1"],
  ["edit", "123", "--title", "hi", "--output", "a.sb3"],
].map((args) => ({ args })))("invalid transfer options stop before any file or server changes: $args", ({ args }) => {
  const result = Bun.spawnSync([process.execPath, entrypoint, "project", ...args]);
  expect(result.exitCode).toBe(1);
  expect(new TextDecoder().decode(result.stdout)).not.toContain("please wait");
});

test("transfer help describes optional upload ID and overwrite safety without reading files", () => {
  const upload = Bun.spawnSync([process.execPath, entrypoint, "help", "project", "upload"]);
  const download = Bun.spawnSync([process.execPath, entrypoint, "project", "download", "123", "--help"]);
  expect(upload.exitCode).toBe(0);
  expect(download.exitCode).toBe(0);
  const help = new TextDecoder().decode(upload.stdout);
  expect(help).toContain("scc project upload [id] --file <string>");
  expect(help).toContain("overwrite <id>");
  expect(help).toContain("sharing settings are preserved");
  expect(new TextDecoder().decode(download.stdout)).toContain("Existing files require interactive confirmation");
});
