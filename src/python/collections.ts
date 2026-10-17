import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fail } from "../errors.ts";
import { venvDir } from "./index.ts";
import { spawnScratchPython } from "./process.ts";

export type CollectionArguments = { entity: "project" | "studio"; action: "comments" | "remixes" | "studios" | "projects" | "activity"; id: number; limit: number; offset: number };

function validItem(value: unknown, action: CollectionArguments["action"]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const nullable = (field: unknown) => field === null || typeof field === "string";
  if (action === "activity") return typeof item.action === "string" && nullable(item.actor) && nullable(item.target) && nullable(item.when);
  if (!Number.isSafeInteger(item.id) || Number(item.id) < 1) return false;
  if (action === "comments") return nullable(item.author) && typeof item.content === "string" && nullable(item.created_at);
  const expected = `https://scratch.mit.edu/${action === "studios" ? "studios" : "projects"}/${item.id}`;
  return nullable(item.title) && (item.url === expected || item.url === `${expected}/`);
}

export async function showCollection(args: CollectionArguments): Promise<void> {
  const python = process.platform === "win32" ? join(venvDir, "Scripts", "python.exe") : join(venvDir, "bin", "python");
  const result = spawnScratchPython([python, fileURLToPath(new URL("./resource_collections.py", import.meta.url)), args.entity, args.action, String(args.id), String(args.limit), String(args.offset)]);
  if (!result) return;
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(result.stdout)); }
  catch { fail("Failed to parse the Scratch collection response."); return; }
  if (result.exitCode !== 0) {
    fail(value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "Could not load the Scratch collection.");
    return;
  }
  const data = value as { entity?: unknown; action?: unknown; id?: unknown; items?: unknown } | null;
  if (!data || data.entity !== args.entity || data.action !== args.action || data.id !== args.id
    || !Array.isArray(data.items) || data.items.length > args.limit || !data.items.every((item) => validItem(item, args.action))) {
    fail("Received an invalid Scratch collection response.");
    return;
  }
  console.log(`${args.entity === "project" ? "Project" : "Studio"} ${args.id}: ${args.action}`);
  if (!data.items.length) console.log("No items found.");
  for (const item of data.items as Record<string, unknown>[]) {
    console.log("");
    for (const [key, field] of Object.entries(item)) {
      if (field === null) continue;
      console.log(`${key.replace(/_/g, " ")}: ${String(field).replace(/\r\n?/g, "\n").replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, " ")}`);
    }
  }
}
