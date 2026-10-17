import { fail } from "../errors.ts";
import { venvDir } from "./index.ts";
import { spawnScratchPython } from "./process.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("./explore.py", import.meta.url);

type ExploreType = "project" | "studio";
type ExploreMode = "trending" | "popular";
type ProjectCategory = "all" | "animations" | "art" | "games" | "music";

type ExploreResult = {
  id: number;
  title: string | null;
  url: string;
  author?: string | null;
  host_id?: number | null;
};

type ExploreResponse = {
  type: ExploreType;
  mode: ExploreMode;
  results: ExploreResult[];
};

type ExploreArguments = {
  type: ExploreType;
  mode: ExploreMode;
  category: ProjectCategory;
  limit: number;
  offset: number;
  language: string;
};

function isExploreResponse(
  value: unknown,
  type: ExploreType,
  mode: ExploreMode,
): value is ExploreResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<ExploreResponse>;

  return response.type === type
    && response.mode === mode
    && Array.isArray(response.results)
    && response.results.every((result: unknown) => {
      if (!result || typeof result !== "object") {
        return false;
      }

      const item = result as Partial<ExploreResult>;
      const shared = Number.isSafeInteger(item.id)
        && (typeof item.title === "string" || item.title === null)
        && typeof item.url === "string";

      return shared && (type === "project"
        ? typeof item.author === "string" || item.author === null
        : Number.isSafeInteger(item.host_id) || item.host_id === null);
    });
}

export async function explore({
  type,
  mode,
  category,
  limit,
  offset,
  language,
}: ExploreArguments): Promise<void> {
  const result = spawnScratchPython([
      pythonPath,
      scriptPath.pathname,
      type,
      mode,
      category,
      String(limit),
      String(offset),
      language,
    ]);
  if (!result) return;

  const stdout = new TextDecoder().decode(result.stdout).trim();

  if (result.exitCode !== 0) {
    try {
      const error: unknown = JSON.parse(stdout);

      if (error && typeof error === "object" && "error" in error
        && typeof error.error === "string") {
        fail(error.error);
        return;
      }
    } catch {
      // Use the generic message when Python did not return an error payload.
    }

    fail("Failed to fetch Scratch Explore results.");
    return;
  }

  let response: unknown;

  try {
    response = JSON.parse(stdout);
  } catch {
    fail("Failed to parse Scratch Explore response.");
    return;
  }

  if (!isExploreResponse(response, type, mode)) {
    fail("Received an invalid Scratch Explore response.");
    return;
  }

  const plural = type === "project" ? "projects" : "studios";
  const label = mode === "trending" ? "Trending" : "Popular";
  const categoryLabel = type === "project" && category !== "all"
    ? ` (${category})`
    : "";

  if (response.results.length === 0) {
    console.log(`No ${mode} Scratch ${plural}${categoryLabel} found.`);
    return;
  }

  console.log(`${label} Scratch ${plural}${categoryLabel}`);

  for (const [index, item] of response.results.entries()) {
    console.log("");
    console.log(`${offset + index + 1}. ${item.title ?? "Untitled"}`);
    console.log(`   ID: ${item.id}`);

    if (type === "project") {
      console.log(`   Author: ${item.author ?? "Unknown"}`);
    } else {
      console.log(`   Host ID: ${item.host_id ?? "Unknown"}`);
    }

    console.log(`   URL: ${item.url}`);
  }
}
