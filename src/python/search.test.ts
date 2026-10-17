import { expect, spyOn, test } from "bun:test";

import { searchProjects } from "./search.ts";

test("popular project search passes the mode to Python and labels the output", async () => {
  const response = {
    type: "project",
    query: "platformer",
    mode: "popular",
    results: [{
      id: 123,
      title: "Popular project",
      author: "creator",
      url: "https://scratch.mit.edu/projects/123/",
    }],
  };
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({
    exitCode: 0,
    stdout: Buffer.from(JSON.stringify(response)),
    stderr: Buffer.from(""),
  }) as ReturnType<typeof Bun.spawnSync>);
  const output = spyOn(console, "log").mockImplementation(() => {});

  try {
    await searchProjects({
      type: "project", query: "platformer", mode: "popular", limit: 10, offset: 20, language: "ja",
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0]?.[0]?.slice(-6)).toEqual([
      "project", "platformer", "popular", "10", "20", "ja",
    ]);
    expect(output).toHaveBeenCalledWith('Popular search results for "platformer"');
    expect(output).toHaveBeenCalledWith("Showing results 21-21 (offset: 20, limit: 10).");
    expect(output).toHaveBeenCalledWith("21. Popular project");
    expect(output).not.toHaveBeenCalledWith("1. Popular project");
  } finally {
    spawn.mockRestore();
    output.mockRestore();
  }
});
