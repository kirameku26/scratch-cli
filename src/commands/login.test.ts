import {
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { Config } from "../config.ts";
import { loginWithDependencies } from "./login.ts";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;

describe("login command", () => {
  test("rejects a password supplied as a command-line option", () => {
    const password = "must-not-appear-in-output";
    const result = Bun.spawnSync([
      process.execPath,
      entrypoint,
      "login",
      "--password",
      password,
    ]);
    const output = [
      new TextDecoder().decode(result.stdout),
      new TextDecoder().decode(result.stderr),
    ].join("\n");

    expect(result.exitCode).toBe(1);
    expect(output).toContain("Unknown argument: password");
    expect(output).not.toContain(password);
  });
});

function dependencies(config: Config = { scratchsessionsid: "stored-session" }) {
  return {
    loadConfig: mock(async () => config), saveConfig: mock(async (_config: Config) => {}),
    fetch: mock(async (_url: string, _init?: RequestInit): Promise<Response> => Response.json({ user: null })),
    readInput: mock(async () => "active_user"), readHiddenInput: mock(async () => "private-password"),
    interactive: mock(() => true), fail: mock((_message: string) => {}),
  };
}

test.each(["offline", "429", "invalid"])("login does not prompt or continue requests after a failed %s session check", async (failure) => {
  const deps = dependencies();
  deps.fetch.mockImplementation(async () => {
    if (failure === "offline") throw new Error("stored-session private-password");
    return failure === "429" ? new Response("", { status: 429, headers: { "Retry-After": "60" } }) : Response.json({});
  });
  await loginWithDependencies(deps);
  expect(deps.fail).toHaveBeenCalledTimes(1);
  expect(deps.fail.mock.calls.flat().join(" ")).not.toContain("stored-session");
  expect(deps.fetch).toHaveBeenCalledTimes(1);
  expect(deps.readInput).not.toHaveBeenCalled();
  expect(deps.readHiddenInput).not.toHaveBeenCalled();
  expect(deps.saveConfig).not.toHaveBeenCalled();
});

test("already authenticated login never asks for credentials", async () => {
  const deps = dependencies();
  deps.fetch.mockImplementation(async () => Response.json({ user: { username: "active_user" } }));
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    await loginWithDependencies(deps);
    expect(deps.readHiddenInput).not.toHaveBeenCalled();
    expect(deps.saveConfig).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Already logged in.");
  } finally { log.mockRestore(); }
});

test("fresh login refuses noninteractive input before any request", async () => {
  const deps = dependencies({});
  deps.interactive.mockReturnValue(false);
  await loginWithDependencies(deps);
  expect(deps.fetch).not.toHaveBeenCalled();
  expect(deps.readHiddenInput).not.toHaveBeenCalled();
  expect(deps.fail).toHaveBeenCalledWith("Login requires an interactive terminal.");
});

test.each(["success", "changed", "save-failed", "csrf-429", "login-429", "offline"])("fresh login handles %s safely", async (scenario) => {
  const deps = dependencies({});
  if (scenario === "changed") deps.loadConfig.mockResolvedValueOnce({}).mockResolvedValue({ scratchsessionsid: "other-session" });
  if (scenario === "save-failed") deps.saveConfig.mockImplementation(async () => { throw new Error("private-password"); });
  let requests = 0;
  deps.fetch.mockImplementation(async (_url, init) => {
    requests += 1;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    if (scenario === "offline") throw new Error("private-password");
    if (scenario === "csrf-429" || (requests === 2 && scenario === "login-429")) return new Response("", { status: 429 });
    if (requests === 1) return new Response("", { headers: { "Set-Cookie": "scratchcsrftoken=csrf-before; Path=/" } });
    const headers = new Headers();
    headers.append("Set-Cookie", 'scratchsessionsid="new-session"; Path=/');
    headers.append("Set-Cookie", "scratchcsrftoken=csrf-after; Path=/");
    return Response.json([{ token: "private-token" }], { headers });
  });
  const log = spyOn(console, "log").mockImplementation(() => {});
  try {
    await loginWithDependencies(deps, { username: "active_user" });
    expect(deps.fetch).toHaveBeenCalledTimes(["offline", "csrf-429"].includes(scenario) ? 1 : 2);
    expect(deps.readInput).not.toHaveBeenCalled();
    if (["success", "save-failed"].includes(scenario)) {
      expect(deps.saveConfig).toHaveBeenCalledWith({ scratchsessionsid: "new-session", scratchcsrftoken: "csrf-after", "x-token": "private-token" });
    } else expect(deps.saveConfig).not.toHaveBeenCalled();
    if (scenario === "success") {
      expect(deps.fail).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith("Login successful.");
    } else {
      expect(deps.fail).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalledWith("Login successful.");
      expect(deps.fail.mock.calls.flat().join(" ")).not.toContain("private-password");
    }
  } finally { log.mockRestore(); }
});
