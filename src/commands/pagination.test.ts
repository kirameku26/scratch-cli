import { expect, spyOn, test } from "bun:test";
import { search } from "./search.ts";
import { exploreCommand } from "./explore.ts";
import { home } from "./home.ts";
import { user } from "./user.ts";
import { project } from "./project.ts";
import { studio } from "./studio.ts";
import * as searchApi from "../python/search.ts";
import * as exploreApi from "../python/explore.ts";
import * as homeApi from "../python/home.ts";
import * as profileApi from "../python/profile.ts";
import * as collectionApi from "../python/collections.ts";

test("every offset-based command passes a calculated offset without extra API calls", async () => {
  const spies = [
    spyOn(searchApi, "searchProjects").mockResolvedValue(undefined),
    spyOn(exploreApi, "explore").mockResolvedValue(undefined),
    spyOn(homeApi, "getHomeSection").mockResolvedValue(undefined),
    spyOn(profileApi, "getProfileSection").mockResolvedValue(undefined),
    spyOn(collectionApi, "showCollection").mockResolvedValue(undefined),
  ];
  try {
    await search({ type: "project", query: "game", mode: "popular", language: "ja", limit: 10, offset: 5, page: 3 });
    await exploreCommand({ type: "studio", category: "all", mode: "popular", language: "ja", limit: 10, offset: 5, page: 3 });
    await home({ section: "news", limit: 10, offset: 5, page: 3 });
    await user({ username: "griffpatch", section: "projects", limit: 10, offset: 5, page: 3 });
    await project({ action: "comments", id: 123, limit: 10, offset: 5, page: 3 });
    await studio({ action: "projects", id: 123, limit: 10, offset: 5, page: 3 });
    for (const spy of spies.slice(0, 4)) {
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]?.[0]).toMatchObject({ limit: 10, offset: 25 });
    }
    expect(spies[4]).toHaveBeenCalledTimes(2);
    for (const call of spies[4]!.mock.calls) expect(call[0]).toMatchObject({ limit: 10, offset: 25 });
  } finally { spies.forEach((spy) => spy.mockRestore()); }
});

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

test.each([
  { page: 1, offset: 0 }, { page: 2, offset: 10 }, { page: 3, offset: 20 },
])("search CLI parses page $page through to Python and shows absolute numbering", ({ page, offset }) => {
  const probe = `
    process.argv = [process.execPath, ${JSON.stringify(entrypoint)}, "search", "project", "game", "--limit", "10", "--page", ${JSON.stringify(String(page))}];
    Bun.spawnSync = (args) => {
      const offset = Number(args.at(-2));
      console.log("Python offset: " + offset);
      return { exitCode: 0, stdout: Buffer.from(JSON.stringify({ type: "project", query: "game", mode: "trending", results: [{ id: 123 + offset, title: "Result", author: "Creator", url: "https://scratch.mit.edu/projects/123/" }] })), stderr: Buffer.from("") };
    };
    await import(${JSON.stringify(entrypoint)});
  `;
  const result = Bun.spawnSync([process.execPath, "--eval", probe]);
  const stdout = new TextDecoder().decode(result.stdout);
  expect(result.exitCode).toBe(0);
  expect(stdout).toContain(`Python offset: ${offset}`);
  expect(stdout).toContain(`${offset + 1}. Result`);
  expect(stdout).toContain(`offset: ${offset}, limit: 10`);
});
test.each([
  ["search", "project", "game", "--page", "0"], ["explore", "project", "--page", "1.5"],
  ["home", "news", "--page", "0"], ["notifications", "count", "--page", "2"],
  ["notifications", "read", "--page", "1"], ["studio", "activity", "123", "--page", "2"],
  ["project", "reactions", "123", "--page", "2"],
].map((args) => ({ args })))("invalid page inputs fail without requests: $args", ({ args }) => {
  const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);
  expect(result.exitCode).toBe(1);
});
