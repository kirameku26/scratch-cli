import { expect, test } from "bun:test";

import { buildInteractionProcess } from "./interactions.ts";

test("interaction process passes credentials through stdin", async () => {
  const input = buildInteractionProcess("private-session", {
    entity: "project",
    action: "comment",
    target: "123",
    text: "Nice project!",
  });

  expect(input.args).not.toContain("private-session");
  expect(input.args.slice(-3)).toEqual(["project", "comment", "123"]);
  expect(await input.stdin.text()).toBe(JSON.stringify({
    session_id: "private-session",
    text: "Nice project!",
  }));
});
