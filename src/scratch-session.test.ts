import { expect, mock, test } from "bun:test";
import { checkSession, parseSession } from "./scratch-session.ts";

test("session parsing accepts only known anonymous or authenticated responses", () => {
  expect(parseSession({ user: null })).toEqual({ state: "anonymous" });
  expect(parseSession({ flags: { project_comments_enabled: true } })).toEqual({ state: "anonymous" });
  expect(parseSession({ user: { username: "active_user" } })).toEqual({ state: "authenticated", username: "active_user" });
  for (const invalid of [null, [], {}, { user: {} }, { user: false }, { flags: {} }, { user: { username: "\nsecret" } }]) {
    expect(parseSession(invalid)).toBeUndefined();
  }
});

test("no saved login requires no network request", async () => {
  const fetcher = mock(async () => { throw new Error("unexpected request"); });
  expect(await checkSession({}, fetcher)).toEqual({ state: "anonymous" });
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([
  { name: "offline", response: () => { throw new Error("private-session"); }, message: "network may be unavailable" },
  { name: "rate limited", response: () => new Response("", { status: 429, headers: { "Retry-After": "60" } }), message: "after 60 seconds" },
  { name: "server error", response: () => new Response("private-session", { status: 503 }), message: "HTTP 503" },
  { name: "invalid object", response: () => Response.json({}), message: "invalid session response" },
  { name: "invalid JSON", response: () => new Response("private-session"), message: "invalid session response" },
])("$name is a failed check, not a logged-out session", async ({ response, message }) => {
  const fetcher = mock(async (_url: string, init?: RequestInit) => {
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return response();
  });
  const result = await checkSession({ scratchsessionsid: "private-session" }, fetcher);
  expect(result.state).toBe("error");
  if (result.state === "error") {
    expect(result.message).toContain(message);
    expect(result.message).not.toContain("private-session");
  }
  expect(fetcher).toHaveBeenCalledTimes(1);
});
