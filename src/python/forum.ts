import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.ts";
import { fail } from "../errors.ts";
import { venvDir } from "./index.ts";
import { confirmAccountAction } from "./management.ts";
import { spawnScratchPython } from "./process.ts";

export type ForumAction = "categories" | "topics" | "topic" | "posts" | "post" | "source" | "follow" | "unfollow";
export type ForumArguments = { action: ForumAction; id?: number; page: number; limit: number };
type ForumItem = Record<string, string | number | boolean | null> & { id: number; title: string; url: string };
type ForumResponse = { action: ForumAction; id: number | null; page: number | null; items?: ForumItem[]; source?: string; account?: string };

export function buildForumProcess(args: ForumArguments, sessionId?: string, expectedAccount?: string) {
  const python = process.platform === "win32" ? join(venvDir, "Scripts", "python.exe") : join(venvDir, "bin", "python");
  return {
    args: [python, fileURLToPath(new URL("./forum.py", import.meta.url)), args.action, String(args.id ?? 0), String(args.page), String(args.limit)],
    ...(sessionId ? { stdin: new Blob([JSON.stringify({ session_id: sessionId, expected_account: expectedAccount })]) } : {}),
  };
}

function isResponse(value: unknown, args: ForumArguments): value is ForumResponse {
  if (!value || typeof value !== "object") return false;
  const data = value as ForumResponse;
  if (data.action !== args.action || data.id !== (args.id ?? null)
    || data.page !== (["topics", "posts"].includes(args.action) ? args.page : null)) return false;
  if (["follow", "unfollow"].includes(args.action)) return typeof data.account === "string" && /^[A-Za-z0-9_-]+$/.test(data.account);
  if (args.action === "source") return typeof data.source === "string";
  const kind = args.action === "categories" ? "category" : ["topic", "topics"].includes(args.action) ? "topic" : "post";
  return Array.isArray(data.items)
    && (!["topics", "posts"].includes(args.action) || data.items.length <= args.limit)
    && (!["topic", "post"].includes(args.action) || (data.items.length === 1 && data.items[0]?.id === args.id))
    && data.items.every((item) => item && typeof item === "object" && item.kind === kind
      && Number.isSafeInteger(item.id) && item.id > 0 && typeof item.title === "string"
      && item.url === `https://scratch.mit.edu/discuss/${kind === "category" ? "" : `${kind}/`}${item.id}/`
      && Object.values(item).every((field) => field === null || typeof field === "string"
        || typeof field === "boolean" || (typeof field === "number" && Number.isFinite(field)))
      && (kind !== "post" || typeof item.content === "string"));
}

function safeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, " ");
}

export async function runForum(args: ForumArguments, configPath?: string): Promise<void> {
  const mutation = ["follow", "unfollow"].includes(args.action);
  let account: string | undefined;
  let sessionId: string | undefined;
  if (mutation) {
    account = await confirmAccountAction((name) => `Account: ${name}\nTopic: ${args.id}\nAction: ${args.action}`, configPath);
    if (!account) return;
    sessionId = (await loadConfig(configPath)).scratchsessionsid;
    if (!sessionId) { fail("No active session. Run `scc login` first."); return; }
  }
  const input = buildForumProcess(args, sessionId, account);
  const result = spawnScratchPython(input.args, input.stdin ? { stdin: input.stdin } : {});
  if (!result) return;
  let response: unknown;
  try { response = JSON.parse(new TextDecoder().decode(result.stdout)); }
  catch { fail("Failed to parse the Scratch forum response."); return; }
  if (result.exitCode !== 0) {
    fail(response && typeof response === "object" && "error" in response && typeof response.error === "string"
      ? safeText(response.error) : "Could not complete the Scratch forum request.");
    return;
  }
  if (!isResponse(response, args) || (mutation && response.account !== account)) {
    fail("Received an invalid Scratch forum response.");
    return;
  }
  if (mutation) {
    console.log(`${args.action === "follow" ? "Followed" : "Unfollowed"} forum topic ${args.id} as ${response.account}.`);
  } else if (args.action === "source") {
    console.log(safeText(response.source!));
  } else {
    console.log(`Forum ${args.action}${response.page === null ? "" : ` (page ${response.page})`}`);
    if (!response.items!.length) console.log("No items found on this page.");
    for (const item of response.items!) {
      console.log(`\n${item.id}. ${safeText(item.title)}`);
      for (const [key, field] of Object.entries(item)) {
        if (["id", "title", "kind"].includes(key) || field === null) continue;
        console.log(`${key.replace(/_/g, " ")}: ${typeof field === "boolean" ? field ? "Yes" : "No" : safeText(String(field))}`);
      }
    }
  }
}
