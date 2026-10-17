import { expect, test } from "bun:test";

import { buildManagementProcess } from "./management.ts";

test("management process passes credentials through stdin", async () => {
  const input = buildManagementProcess("private-session", {
    entity: "project",
    action: "list",
    payload: { visibility: "shared", page: 2 },
  });

  expect(input.args).not.toContain("private-session");
  expect(input.args.slice(-2)).toEqual(["project", "list"]);
  expect(await input.stdin.text()).toBe(JSON.stringify({
    session_id: "private-session",
    visibility: "shared",
    page: 2,
  }));
});

test("password changes and studio transfers keep passwords out of process arguments", async () => {
  for (const operation of [
    { entity: "account", action: "change-password", payload: { old_password: "old-secret", new_password: "new-secret" } },
    { entity: "studio", action: "transfer", payload: { studio_id: 12, username: "recipient", password: "transfer-secret" } },
  ] as const) {
    const input = buildManagementProcess("private-session", operation);
    const args = input.args.join(" ");
    for (const secret of ["private-session", "old-secret", "new-secret", "transfer-secret"]) {
      expect(args).not.toContain(secret);
    }
    expect(JSON.parse(await input.stdin.text())).toEqual({ session_id: "private-session", ...operation.payload });
  }
});
