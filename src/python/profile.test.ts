import { expect, spyOn, test } from "bun:test";

import { getProfileSection } from "./profile.ts";

test("missing profile identity fails without suggesting removed CLI options", async () => {
  const originalCode = process.exitCode;
  const spawn = spyOn(Bun, "spawnSync");
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    await getProfileSection({ section: "about", limit: 10, offset: 0, page: 1 });
    expect(spawn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("No active session. Run `scc login` first or specify a username.");
    expect(process.exitCode).toBe(1);
  } finally {
    spawn.mockRestore();
    error.mockRestore();
    process.exitCode = originalCode ?? 0;
  }
});

test("profile renderer shows comments and cached replies without control characters", async () => {
  const response = {
    username: "griffpatch",
    section: "comments",
    items: [{
      id: 300,
      author: "commenter",
      content: "Hello\x1b[31m",
      created_at: "2026-01-01T00:00:00",
      replies: [{
        id: 301,
        author: "replier",
        content: "Reply",
        created_at: null,
      }],
    }],
  };
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({
    exitCode: 0,
    stdout: Buffer.from(JSON.stringify(response)),
    stderr: Buffer.from(""),
  }) as ReturnType<typeof Bun.spawnSync>);
  const output = spyOn(console, "log").mockImplementation(() => {});

  try {
    await getProfileSection({
      username: "griffpatch", section: "comments", limit: 10, offset: 0, page: 2,
    });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0]?.[0]?.slice(-5)).toEqual([
      "griffpatch", "comments", "10", "0", "2",
    ]);
    const rendered = output.mock.calls.map((call) => call[0]).join("\n");
    expect(rendered).toContain("1. commenter: Hello [31m");
    expect(rendered).toContain("Reply — replier: Reply");
    expect(rendered).not.toContain("\x1b");
  } finally {
    spawn.mockRestore();
    output.mockRestore();
  }
});

test("profile process passes the active session through stdin, not arguments", async () => {
  const response = {
    username: "active_user",
    section: "projects",
    items: [{ id: 1, title: "Project", author: null, url: "https://scratch.mit.edu/projects/1/" }],
  };
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({
    exitCode: 0,
    stdout: Buffer.from(JSON.stringify(response)),
    stderr: Buffer.from(""),
  }) as ReturnType<typeof Bun.spawnSync>);
  const output = spyOn(console, "log").mockImplementation(() => {});

  try {
    await getProfileSection({
      sessionId: "private-session", section: "projects", limit: 10, offset: 0, page: 1,
    });

    const args = spawn.mock.calls[0]?.[0] as string[];
    const options = spawn.mock.calls[0]?.[1] as { stdin: Blob };
    expect(args).not.toContain("private-session");
    expect(args.slice(-5)).toEqual(["", "projects", "10", "0", "1"]);
    expect(await options.stdin.text()).toBe(JSON.stringify({ session_id: "private-session" }));
    expect(output).toHaveBeenCalledWith("Shared projects for active_user");
  } finally {
    spawn.mockRestore();
    output.mockRestore();
  }
});

test("profile renderer keeps safe line breaks in About me", async () => {
  const response = {
    username: "example",
    section: "about",
    about: {
      id: 1,
      username: "example",
      role: "Scratcher",
      country: "Japan",
      joined_at: null,
      bio: "First line\nSecond line\x1b[31m",
      status: "Building a game",
      icon_url: null,
      url: "https://scratch.mit.edu/users/example/",
      following: true,
      featured_project: {
        id: 42,
        title: "Featured game",
        url: "https://scratch.mit.edu/projects/42/",
        label: "Tutorial",
      },
      activities: [{
        action: "project",
        actor: "example",
        target_title: "New game",
        target_url: "https://scratch.mit.edu/projects/43/",
        when: "2 days ago",
      }],
    },
  };
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({
    exitCode: 0,
    stdout: Buffer.from(JSON.stringify(response)),
    stderr: Buffer.from(""),
  }) as ReturnType<typeof Bun.spawnSync>);
  const output = spyOn(console, "log").mockImplementation(() => {});

  try {
    await getProfileSection({
      username: "example", section: "about", limit: 10, offset: 0, page: 1,
    });
    const rendered = output.mock.calls.map((call) => call[0]).join("\n");
    expect(rendered).toContain("Role: Scratcher");
    expect(rendered).toContain("Country: Japan");
    expect(rendered).toContain("Following: Yes");
    expect(rendered).toContain("About me:\nFirst line\nSecond line [31m");
    expect(rendered).toContain("Tutorial:\nFeatured game");
    expect(rendered).toContain("1. example shared a project: New game");
    expect(rendered).toContain("When: 2 days ago");
    expect(rendered).not.toContain("\x1b");
  } finally {
    spawn.mockRestore();
    output.mockRestore();
  }
});

test.each([
  { following: true, label: "Yes" },
  { following: false, label: "No" },
  { following: null, label: "Unknown" },
])("self profile displays Following: $label", async ({ following, label }) => {
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({
    exitCode: 0,
    stdout: Buffer.from(JSON.stringify({
      username: "active_user", section: "about",
      about: {
        id: 1, username: "active_user", role: null, country: null, joined_at: null,
        bio: null, status: null, icon_url: null, url: "https://scratch.mit.edu/users/active_user/",
        following, featured_project: null, activities: [],
      },
    })),
    stderr: Buffer.from(""),
  }) as ReturnType<typeof Bun.spawnSync>);
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    await getProfileSection({ sessionId: "private-test-session", section: "about", limit: 10, offset: 0, page: 1 });
    expect(output).toHaveBeenCalledWith(`Following: ${label}`);
    expect(output).not.toHaveBeenCalledWith("Following: Self");
  } finally {
    spawn.mockRestore();
    output.mockRestore();
  }
});
