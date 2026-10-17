import { loadConfig, saveConfig } from "../config";
import { fail } from "../errors.ts";
import { parseSession, REQUEST_TIMEOUT_MS } from "../scratch-session.ts";

type LogoutDependencies = {
  loadConfig: typeof loadConfig;
  saveConfig: typeof saveConfig;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  fail: typeof fail;
};

type LogoutArguments = { local?: boolean };

const defaultDependencies: LogoutDependencies = { loadConfig, saveConfig, fetch, fail };
const scratchOrigin = "https://scratch.mit.edu";

function sessionCookieWasCleared(headers: Headers): boolean {
  return headers.getSetCookie().some((cookie) => {
    const match = /^scratchsessionsid=([^;]*)(?:;|$)/.exec(cookie);
    if (!match) return false;
    if (match[1]?.trim().replace(/^"(.*)"$/, "$1") === "") return true;
    const attributes = cookie.split(";").slice(1).map((value) => value.trim());
    const maxAge = attributes.find((attribute) => /^max-age=/i.test(attribute))?.slice(8);
    // Max-Age takes precedence over Expires when both are supplied.
    if (maxAge !== undefined && /^-?\d+$/.test(maxAge)) return Number(maxAge) <= 0;
    const expires = attributes.find((attribute) => /^expires=/i.test(attribute))?.slice(8);
    return expires !== undefined && Number.isFinite(Date.parse(expires)) && Date.parse(expires) <= Date.now();
  });
}

function isLoggedOutResponse(value: unknown): boolean {
  return parseSession(value)?.state === "anonymous";
}

export async function logout(argv: LogoutArguments = {}) {
  await logoutWithDependencies(defaultDependencies, argv);
}

export async function logoutWithDependencies(
  dependencies: LogoutDependencies,
  argv: LogoutArguments = {},
) {
  const config = await dependencies.loadConfig();
  const sessionId = config.scratchsessionsid;
  if (!sessionId) {
    console.log("No active session.");
    return;
  }

  if (!argv.local) {
    console.log("Logging out...");
    try {
      let csrfToken = config.scratchcsrftoken;
      if (!csrfToken) {
        const csrfResponse = await dependencies.fetch(`${scratchOrigin}/csrf_token/`, {
          headers: { "X-Requested-With": "XMLHttpRequest", Referer: `${scratchOrigin}/` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!csrfResponse.ok) {
          dependencies.fail(`Failed to prepare logout: ${csrfResponse.status}`);
          return;
        }
        for (const cookie of csrfResponse.headers.getSetCookie()) {
          const match = /^scratchcsrftoken=([^;]+)/.exec(cookie);
          if (match?.[1]) csrfToken = match[1].replace(/^"(.*)"$/, "$1");
        }
        if (!csrfToken) {
          dependencies.fail("Scratch did not provide a CSRF token for logout.");
          return;
        }
      }

      const cookie = `scratchsessionsid=${sessionId}; scratchcsrftoken=${csrfToken}`;
      const response = await dependencies.fetch(`${scratchOrigin}/accounts/logout/`, {
        method: "POST",
        // Match Scratch's form submission and preserve Set-Cookie on redirects.
        redirect: "manual",
        body: new URLSearchParams({ csrfmiddlewaretoken: csrfToken }).toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-CSRFToken": csrfToken,
          Origin: scratchOrigin,
          Referer: `${scratchOrigin}/`,
          Cookie: cookie,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const redirected = response.status === 302 || response.status === 303;
      if (!response.ok && !redirected) {
        dependencies.fail(`Logout failed: ${response.status}. Use --local to remove only the saved CLI login.`);
        return;
      }
      if (redirected) {
        const location = response.headers.get("location");
        if (!location || new URL(location, scratchOrigin).origin !== scratchOrigin) {
          dependencies.fail("Scratch returned an unexpected logout redirect.");
          return;
        }
      }

      if (!sessionCookieWasCleared(response.headers)) {
        // An HTTP 200 alone is not proof of logout when Set-Cookie is absent.
        const verification = await dependencies.fetch(`${scratchOrigin}/session/`, {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Referer: `${scratchOrigin}/`,
            Cookie: cookie,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!verification.ok) {
          dependencies.fail(`Failed to verify logout: ${verification.status}`);
          return;
        }
        if (!isLoggedOutResponse(await verification.json())) {
          dependencies.fail("Scratch did not confirm logout. Use --local to remove only the saved CLI login.");
          return;
        }
      }
    } catch {
      dependencies.fail("Logout could not be confirmed. Use --local to remove only the saved CLI login.");
      return;
    }
  }

  try {
    const current = await dependencies.loadConfig();
    if (current.scratchsessionsid !== sessionId) {
      dependencies.fail("The active session changed during logout; the new login was kept.");
      return;
    }
    const remaining = { ...current };
    delete remaining.scratchcsrftoken;
    delete remaining.scratchsessionsid;
    delete remaining["x-token"];
    await dependencies.saveConfig(remaining);
    console.log(argv.local
      ? "Saved CLI login removed. No Scratch logout request was sent."
      : "Logged out of this CLI.");
  } catch {
    dependencies.fail("Could not remove the saved CLI login.");
  }
}
