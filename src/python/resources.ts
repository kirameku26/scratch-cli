import { fail } from "../errors.ts";
import { venvDir } from "./index.ts";
import { spawnScratchPython } from "./process.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("./resources.py", import.meta.url);

type ResourceEntity = "project" | "studio";
type ResourceResponse = Record<string, unknown> & {
  entity: ResourceEntity;
  id: number;
  title: string | null;
  url: string;
  thumbnail_url: string;
};

function nullableScalar(value: unknown): boolean {
  return value === null || typeof value === "string"
    || typeof value === "boolean" || Number.isFinite(value);
}

function isResponse(value: unknown, entity: ResourceEntity): value is ResourceResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as ResourceResponse;
  return response.entity === entity
    && Number.isSafeInteger(response.id)
    && (typeof response.title === "string" || response.title === null)
    && typeof response.url === "string"
    && typeof response.thumbnail_url === "string"
    && Object.values(response).every(nullableScalar);
}

function label(key: string): string {
  return key.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

export async function showResource(entity: ResourceEntity, id: number): Promise<void> {
  const result = spawnScratchPython([pythonPath, scriptPath.pathname, entity, String(id)]);
  if (!result) return;
  const stdout = new TextDecoder().decode(result.stdout).trim();
  if (result.exitCode !== 0) {
    try {
      const parsed = JSON.parse(stdout) as { error?: unknown };
      if (typeof parsed.error === "string") {
        fail(parsed.error);
        return;
      }
    } catch { /* use generic error */ }
    fail(`Could not load the Scratch ${entity}.`);
    return;
  }
  let response: unknown;
  try {
    response = JSON.parse(stdout);
  } catch {
    fail(`Failed to parse the Scratch ${entity} response.`);
    return;
  }
  if (!isResponse(response, entity)) {
    fail(`Received an invalid Scratch ${entity} response.`);
    return;
  }
  console.log(`${entity === "project" ? "Project" : "Studio"}: ${response.title ?? "Untitled"}`);
  for (const [key, value] of Object.entries(response)) {
    if (["entity", "title"].includes(key) || value === null) continue;
    console.log(`${label(key)}: ${typeof value === "boolean" ? value ? "Yes" : "No" : value}`);
  }
}
