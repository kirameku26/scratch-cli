import {
  describe,
  expect,
  test,
} from "bun:test";

import { buildUserProcess } from "./user.ts";

describe("user Python process", () => {
  test("passes the session through stdin instead of process arguments", async () => {
    const sessionId = "private-session-value";
    const processInput = buildUserProcess(sessionId, "griffpatch");

    expect(processInput.args).not.toContain(sessionId);
    expect(processInput.args.slice(-2)).toEqual(["--user", "griffpatch"]);
    expect(await processInput.stdin.text()).toBe(
      JSON.stringify({ session_id: sessionId }),
    );
  });
});
