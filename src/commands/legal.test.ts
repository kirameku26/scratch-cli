import { describe, expect, test } from "bun:test";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("legal command", () => {
  test.each([
    ["community-guidelines", "Scratch Community Guidelines", "https://scratch.mit.edu/community_guidelines/"],
    ["terms", "Scratch Terms of Service", "https://mitscratch.freshdesk.com/en/support/solutions/articles/4000219182-scratch-terms-of-service"],
  ])("prints the official %s URL", (document, title, url) => {
    const result = Bun.spawnSync([process.execPath, entrypoint, "legal", document]);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toBe(`${title}\n${url}\n`);
    expect(new TextDecoder().decode(result.stderr)).toBe("");
  });
});
