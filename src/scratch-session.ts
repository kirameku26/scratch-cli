import type { Config } from "./config.ts";

export const REQUEST_TIMEOUT_MS = 15_000;
export type ScratchFetch = (url: string, init?: RequestInit) => Promise<Response>;
export type SessionStatus =
  | { state: "authenticated"; username: string }
  | { state: "anonymous" }
  | { state: "error"; message: string };

export function parseSession(value: unknown): Exclude<SessionStatus, { state: "error" }> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  if ("user" in value) {
    if (value.user === null) return { state: "anonymous" };
    if (value.user && typeof value.user === "object" && "username" in value.user
      && typeof value.user.username === "string" && /^[A-Za-z0-9_-]+$/.test(value.user.username)) {
      return { state: "authenticated", username: value.user.username };
    }
    return undefined;
  }
  if ("flags" in value && value.flags && typeof value.flags === "object"
    && "project_comments_enabled" in value.flags && typeof value.flags.project_comments_enabled === "boolean") {
    return { state: "anonymous" };
  }
  return undefined;
}

export function httpFailure(response: Response, operation: string): string {
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    return /^\d+$/.test(retryAfter ?? "")
      ? `Scratch rate limit reached. Try again after ${retryAfter} seconds.`
      : "Scratch rate limit reached. Try again later.";
  }
  return `${operation} failed: HTTP ${response.status}.`;
}

export async function checkSession(config: Config, fetcher: ScratchFetch = fetch): Promise<SessionStatus> {
  if (!config.scratchsessionsid) return { state: "anonymous" };
  try {
    const response = await fetcher("https://scratch.mit.edu/session/", {
      headers: {
        "X-Requested-With": "XMLHttpRequest", Referer: "https://scratch.mit.edu/",
        Cookie: [`scratchsessionsid=${config.scratchsessionsid}`,
          config.scratchcsrftoken ? `scratchcsrftoken=${config.scratchcsrftoken}` : ""].filter(Boolean).join("; "),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return { state: "error", message: httpFailure(response, "Session check") };
    let payload: unknown;
    try { payload = await response.json(); }
    catch { return { state: "error", message: "Scratch returned an invalid session response." }; }
    const status = parseSession(payload);
    return status ?? { state: "error", message: "Scratch returned an invalid session response." };
  } catch {
    return { state: "error", message: "Could not check the Scratch session. The network may be unavailable or the request timed out." };
  }
}
