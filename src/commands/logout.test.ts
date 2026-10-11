import {
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";

import { logoutWithDependencies } from "./logout.ts";

describe("logout command", () => {
  test("verifies logout using the session being invalidated", async () => {
    const config = {
      scratchsessionsid: "session-value",
      scratchcsrftoken: "csrf-value",
      "x-token": "token-value",
    };
    const fetchMock = mock()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ user: null }));
    const saveConfig = mock(async () => {});
    const reportFailure = mock(() => {});
    const log = spyOn(console, "log").mockImplementation(() => {});

    await logoutWithDependencies({
      loadConfig: async () => config,
      saveConfig,
      fetch: fetchMock as unknown as typeof fetch,
      fail: reportFailure,
    });

    const verificationRequest = fetchMock.mock.calls[1];
    expect(verificationRequest?.[0]).toBe("https://scratch.mit.edu/session/");
    expect(verificationRequest?.[1]?.headers).toMatchObject({
      scratchsessionsid: "session-value",
      Cookie: "scratchsessionsid=session-value; scratchcsrftoken=csrf-value",
    });
    expect(saveConfig).toHaveBeenCalledWith({});
    expect(reportFailure).not.toHaveBeenCalled();
    log.mockRestore();
  });

  test("keeps local credentials when verification still reports a user", async () => {
    const config = {
      scratchsessionsid: "session-value",
      scratchcsrftoken: "csrf-value",
      "x-token": "token-value",
    };
    const fetchMock = mock()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ user: { username: "user" } }));
    const saveConfig = mock(async () => {});
    const reportFailure = mock(() => {});
    const log = spyOn(console, "log").mockImplementation(() => {});

    await logoutWithDependencies({
      loadConfig: async () => config,
      saveConfig,
      fetch: fetchMock as unknown as typeof fetch,
      fail: reportFailure,
    });

    expect(saveConfig).not.toHaveBeenCalled();
    expect(config.scratchsessionsid).toBe("session-value");
    expect(reportFailure).toHaveBeenCalledWith("Logout verification failed.");
    log.mockRestore();
  });
});
