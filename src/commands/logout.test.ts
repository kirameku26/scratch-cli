import {
  afterEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";

import { logoutWithDependencies } from "./logout.ts";

afterEach(() => mock.restore());

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

    const logoutRequest = fetchMock.mock.calls[0];
    expect(logoutRequest?.[1]?.body).toBe("csrfmiddlewaretoken=csrf-value");
    expect(logoutRequest?.[1]?.redirect).toBe("manual");
    expect(logoutRequest?.[1]?.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
      "X-CSRFToken": "csrf-value",
    });
    expect(logoutRequest?.[1]?.headers).not.toHaveProperty("X-Requested-With");
    const verificationRequest = fetchMock.mock.calls[1];
    expect(verificationRequest?.[0]).toBe("https://scratch.mit.edu/session/");
    expect(verificationRequest?.[1]?.headers).toMatchObject({
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
    expect(reportFailure).toHaveBeenCalledWith("Scratch did not confirm logout. Use --local to remove only the saved CLI login.");
    log.mockRestore();
  });
});

function fixture() {
  const config = {
    scratchsessionsid: "session-value", scratchcsrftoken: "csrf-value", "x-token": "token-value",
  };
  const fetchMock = mock<typeof fetch>();
  const saveConfig = mock(async () => {});
  const reportFailure = mock(() => {});
  const log = spyOn(console, "log").mockImplementation(() => {});
  const dependencies: Parameters<typeof logoutWithDependencies>[0] = {
    loadConfig: async () => config, saveConfig, fetch: fetchMock, fail: reportFailure,
  };
  return { config, fetchMock, saveConfig, reportFailure, log, dependencies };
}

test.each([
  'scratchsessionsid=""; Path=/; Max-Age=0',
  'scratchsessionsid=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT',
  'scratchsessionsid=expired; Path=/; Max-Age=0',
])("accepts Scratch cookie deletion without reusing the old session: %s", async (cookie) => {
  const f = fixture();
  f.fetchMock.mockResolvedValueOnce(new Response(null, {
    status: 302, headers: { location: "/", "set-cookie": cookie },
  }));
  await logoutWithDependencies(f.dependencies);
  expect(f.fetchMock).toHaveBeenCalledTimes(1);
  expect(f.saveConfig).toHaveBeenCalledWith({});
  expect(f.config.scratchsessionsid).toBe("session-value");
  expect(f.reportFailure).not.toHaveBeenCalled();
});

test("recognizes Scratch's anonymous flags-only session response", async () => {
  const f = fixture();
  f.fetchMock.mockResolvedValueOnce(new Response(null))
    .mockResolvedValueOnce(Response.json({ flags: { project_comments_enabled: true } }));
  await logoutWithDependencies(f.dependencies);
  expect(f.saveConfig).toHaveBeenCalledWith({});
  expect(f.reportFailure).not.toHaveBeenCalled();
});

test.each([{}, null, [], { user: "invalid" }, { flags: {} }].map((response) => ({ response })))("does not clear credentials for an invalid verification response", async ({ response }) => {
  const f = fixture();
  f.fetchMock.mockResolvedValueOnce(new Response(null))
    .mockResolvedValueOnce(Response.json(response));
  await logoutWithDependencies(f.dependencies);
  expect(f.saveConfig).not.toHaveBeenCalled();
  expect(f.reportFailure).toHaveBeenCalledTimes(1);
});

test.each([403, 429, 500])("keeps credentials and does not retry HTTP %i", async (status) => {
  const f = fixture();
  f.fetchMock.mockResolvedValueOnce(new Response(null, { status }));
  await logoutWithDependencies(f.dependencies);
  expect(f.fetchMock).toHaveBeenCalledTimes(1);
  expect(f.saveConfig).not.toHaveBeenCalled();
  expect(f.reportFailure).toHaveBeenCalledTimes(1);
});

test("retrieves a CSRF token when none is saved", async () => {
  const f = fixture();
  f.dependencies.loadConfig = async () => ({ scratchsessionsid: "session-value" });
  f.fetchMock.mockResolvedValueOnce(new Response(null, { headers: { "set-cookie": "scratchcsrftoken=fresh-token; Path=/" } }))
    .mockResolvedValueOnce(new Response(null, { headers: { "set-cookie": 'scratchsessionsid=""; Max-Age=0' } }));
  await logoutWithDependencies(f.dependencies);
  expect(f.fetchMock.mock.calls[0]?.[0]).toBe("https://scratch.mit.edu/csrf_token/");
  expect(f.fetchMock.mock.calls[1]?.[1]?.body).toBe("csrfmiddlewaretoken=fresh-token");
  expect(f.saveConfig).toHaveBeenCalledWith({});
});

test("local logout makes no network request and keeps unrelated settings", async () => {
  const f = fixture();
  f.dependencies.loadConfig = async () => ({ ...f.config, preference: "keep" });
  await logoutWithDependencies(f.dependencies, { local: true });
  expect(f.fetchMock).not.toHaveBeenCalled();
  expect(f.saveConfig).toHaveBeenCalledWith({ preference: "keep" });
  expect(f.reportFailure).not.toHaveBeenCalled();
});

test("does not erase a different session saved while logout was running", async () => {
  const f = fixture();
  f.dependencies.loadConfig = mock()
    .mockResolvedValueOnce(f.config)
    .mockResolvedValueOnce({ ...f.config, scratchsessionsid: "new-session" });
  f.fetchMock.mockResolvedValueOnce(new Response(null, { headers: { "set-cookie": 'scratchsessionsid=""; Max-Age=0' } }));
  await logoutWithDependencies(f.dependencies);
  expect(f.saveConfig).not.toHaveBeenCalled();
  expect(f.reportFailure).toHaveBeenCalledWith("The active session changed during logout; the new login was kept.");
});

test("network errors never expose credentials", async () => {
  const f = fixture();
  f.fetchMock.mockRejectedValueOnce(new Error("session-value csrf-value token-value"));
  await logoutWithDependencies(f.dependencies);
  expect(f.saveConfig).not.toHaveBeenCalled();
  expect(f.reportFailure).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(f.reportFailure.mock.calls)).not.toContain("session-value");
  expect(JSON.stringify(f.log.mock.calls)).not.toContain("token-value");
});

test("reports local save errors separately from network errors", async () => {
  const f = fixture();
  f.saveConfig.mockRejectedValueOnce(new Error("Cannot write file"));
  await logoutWithDependencies(f.dependencies, { local: true });
  expect(f.reportFailure).toHaveBeenCalledWith("Could not remove the saved CLI login.");
  expect(f.log).not.toHaveBeenCalled();
});

test("does not forward credentials to an unexpected redirect", async () => {
  const f = fixture();
  f.fetchMock.mockResolvedValueOnce(new Response(null, {
    status: 302, headers: { location: "https://example.com/", "set-cookie": 'scratchsessionsid=""' },
  }));
  await logoutWithDependencies(f.dependencies);
  expect(f.fetchMock).toHaveBeenCalledTimes(1);
  expect(f.saveConfig).not.toHaveBeenCalled();
  expect(f.reportFailure).toHaveBeenCalledWith("Scratch returned an unexpected logout redirect.");
});

test("a fresh cookie is not mistaken for a cleared session", async () => {
  const f = fixture();
  f.fetchMock.mockResolvedValueOnce(new Response(null, {
    headers: { "set-cookie": 'scratchsessionsid="still-valid"; Max-Age=3600; Expires=Thu, 01 Jan 1970 00:00:00 GMT' },
  })).mockResolvedValueOnce(Response.json({ user: { username: "active" } }));
  await logoutWithDependencies(f.dependencies);
  expect(f.saveConfig).not.toHaveBeenCalled();
  expect(f.reportFailure).toHaveBeenCalledTimes(1);
});

test("no saved session requires neither a request nor a config write", async () => {
  const f = fixture();
  f.dependencies.loadConfig = async () => ({});
  await logoutWithDependencies(f.dependencies);
  expect(f.fetchMock).not.toHaveBeenCalled();
  expect(f.saveConfig).not.toHaveBeenCalled();
  expect(f.reportFailure).not.toHaveBeenCalled();
});
