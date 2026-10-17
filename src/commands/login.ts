import {
  loadConfig,
  saveConfig,
} from "../config";
import { fail } from "../errors.ts";
import { checkSession, httpFailure, REQUEST_TIMEOUT_MS, type ScratchFetch } from "../scratch-session.ts";

function getCookie(
  headers: Headers,
  name: string,
): string | undefined {
  for (const cookie of headers.getSetCookie()) {
    const match = cookie.match(
      new RegExp(`${name}=([^;]*)`),
    );

    const value = match?.[1];

    if (value !== undefined) {
      return value.replace(/^"(.*)"$/, "$1");
    }
  }

  return undefined;
}

async function readInput(
  message: string,
): Promise<string> {
  process.stdout.write(message);

  const reader =
    Bun.stdin.stream().getReader();

  try {
    const { value } = await reader.read();

    return new TextDecoder()
      .decode(value)
      .trim();
  } finally {
    reader.releaseLock();
  }
}

export async function readHiddenInput(
  message: string,
): Promise<string> {
  process.stdout.write(message);
  const input = process.stdin;
  const setRawMode = input.setRawMode?.bind(input);
  if (!setRawMode) throw new Error("Hidden input requires an interactive terminal.");
  return await new Promise<string>((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      input.off("data", onData);
      setRawMode(false);
      input.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: Buffer | string) => {
      for (const character of String(chunk)) {
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Input cancelled."));
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    setRawMode(true);
    input.setEncoding("utf8");
    input.resume();
    input.on("data", onData);
  });
}

type LoginDependencies = {
  loadConfig: typeof loadConfig;
  saveConfig: typeof saveConfig;
  fetch: ScratchFetch;
  readInput: typeof readInput;
  readHiddenInput: typeof readHiddenInput;
  interactive: () => boolean;
  fail: typeof fail;
};

export async function login(argv: { username?: string } = {}) {
  await loginWithDependencies({ loadConfig, saveConfig, fetch, readInput, readHiddenInput,
    interactive: () => Boolean(process.stdin.isTTY), fail }, argv);
}

export async function loginWithDependencies(dependencies: LoginDependencies, argv: { username?: string } = {}) {
  const { loadConfig, saveConfig, fetch, readInput, readHiddenInput, fail } = dependencies;
  const config = await loadConfig();
  const status = await checkSession(config, fetch);
  if (status.state === "error") {
    fail(status.message);
    return;
  }
  if (status.state === "authenticated") {
    console.log("Already logged in.");
    return;
  }

  if (!dependencies.interactive()) {
    fail("Login requires an interactive terminal.");
    return;
  }

  let username = argv.username;

  if (!username) {
    try { username = await readInput("Username: "); }
    catch { fail("Could not read the username."); return; }
  }

  if (!username) {
    fail("Username must not be empty.");
    return;
  }

  let password: string;
  try { password = await readHiddenInput("Password: "); }
  catch { fail("Could not read the password securely. Login cancelled."); return; }

  if (!password) {
    fail("Password must not be empty.");
    return;
  }

  console.log("Logging in...");

  try {
    const csrfRes = await fetch(
      "https://scratch.mit.edu/csrf_token/",
      {
        method: "GET",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "X-Requested-With":
            "XMLHttpRequest",

          "Referer":
            "https://scratch.mit.edu/",
        },
      },
    );

    if (!csrfRes.ok) {
      fail(httpFailure(csrfRes, "CSRF token request"));
      return;
    }

    const scratchcsrftoken =
      getCookie(
        csrfRes.headers,
        "scratchcsrftoken",
      );

    if (!scratchcsrftoken) {
      fail("Failed to get scratchcsrftoken.");
      return;
    }

    const loginRes = await fetch(
      "https://scratch.mit.edu/accounts/login/",
      {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),

        headers: {
          "Content-Type":
            "application/json",

          "X-CSRFToken":
            scratchcsrftoken,

          "X-Requested-With":
            "XMLHttpRequest",

          "Origin":
            "https://scratch.mit.edu",

          "Referer":
            "https://scratch.mit.edu/",

          "Cookie":
            `scratchcsrftoken=${scratchcsrftoken}; scratchlanguage=en`,
        },

        body: JSON.stringify({
          username,
          password,
          useMessages: true,
        }),
      },
    );

    if (!loginRes.ok) {
      if (loginRes.status === 429) {
        fail(httpFailure(loginRes, "Login"));
        return;
      }
      let message = "";

      try {
        const body: unknown = await loginRes.json();

        if (Array.isArray(body)) {
          const messages = body
            .map((entry) => {
              if (!entry || typeof entry !== "object") {
                return undefined;
              }

              const msg = (entry as { msg?: unknown }).msg;
              return typeof msg === "string" ? msg.trim() : undefined;
            })
            .filter((msg): msg is string => Boolean(msg));

          message = [...new Set(messages)].join(" ");
        } else if (body && typeof body === "object") {
          const detail = (body as { detail?: unknown }).detail;
          message = typeof detail === "string" ? detail.trim() : "";
        }
      } catch {
        // Keep the status as the fallback when the response is not JSON.
      }

      fail(
        message
          ? `Login failed: ${message}`
          : `Login failed: ${loginRes.status}`,
      );
      return;
    }

    const loginResult: unknown =
      await loginRes.json();

    const firstResult = Array.isArray(loginResult)
      ? loginResult[0]
      : undefined;
    const token = firstResult && typeof firstResult === "object"
      ? (firstResult as { token?: unknown }).token
      : undefined;
    const xToken = typeof token === "string" ? token : undefined;

    if (!xToken) {
      fail("Failed to get x-token.");
      return;
    }

    const scratchsessionsid =
      getCookie(
        loginRes.headers,
        "scratchsessionsid",
      );

    if (!scratchsessionsid) {
      fail("Failed to get scratchsessionsid.");
      return;
    }

    const current = await loadConfig();
    if (current.scratchsessionsid !== config.scratchsessionsid) {
      fail("The active session changed during login. The new saved login was kept.");
      return;
    }
    try {
      await saveConfig({ ...current,
        scratchcsrftoken: getCookie(loginRes.headers, "scratchcsrftoken") ?? scratchcsrftoken,
        scratchsessionsid, "x-token": xToken,
      });
    } catch {
      fail("Login succeeded, but the credentials could not be saved.");
      return;
    }

    console.log("Login successful.");
  } catch {
    fail("Login failed because Scratch could not be reached.");
  }
}
