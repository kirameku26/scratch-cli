import { venvDir } from "./index.ts";
import { spawnScratchPython } from "./process.ts";
import { fail } from "../errors.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("./search.py", import.meta.url);

type SearchResult = {
  id: number;
  title: string | null;
  author?: string | null;
  url: string;
};

type SearchResponse = {
  type: "project" | "studio";
  query: string;
  mode: SearchMode;
  results: SearchResult[];
};

type SearchMode = "trending" | "popular";

type SearchProjectsArguments = {
  type: "project" | "studio";
  query: string;
  mode: SearchMode;
  limit: number;
  offset: number;
  language: string;
};

function isSearchResponse(
  value: unknown,
  type: "project" | "studio",
  mode: SearchMode,
): value is SearchResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<SearchResponse>;

  return response.type === type
    && typeof response.query === "string"
    && response.mode === mode
    && Array.isArray(response.results);
}

export async function searchProjects({
  type,
  query,
  mode,
  limit,
  offset,
  language,
}: SearchProjectsArguments): Promise<void> {
  const pythonArgs = [
    pythonPath,
    scriptPath.pathname,
    type,
    query,
    mode,
    String(limit),
    String(offset),
    language,
  ];

  const result = spawnScratchPython(pythonArgs);
  if (!result) return;

  const stdout = new TextDecoder()
    .decode(result.stdout)
    .trim();

  const stderr = new TextDecoder()
    .decode(result.stderr)
    .trim();

  if (result.exitCode !== 0) {
    if (stdout) {
      try {
        const error = JSON.parse(stdout) as { error?: unknown };

        if (typeof error.error === "string") {
          fail(error.error);
          return;
        }
      } catch {
        // Fall through to the stderr-based error below.
      }
    }

    fail(stderr || `Failed to search Scratch ${type}s.`);
    return;
  }

  try {
    const response: unknown = JSON.parse(stdout);

    if (!isSearchResponse(response, type, mode)) {
      fail(`Received an invalid ${type} search response.`);
      return;
    }

    if (response.results.length === 0) {
      console.log(`No ${type}s found for "${response.query}".`);
      return;
    }

    const label = mode === "popular" ? "Popular search results" : "Search results";
    console.log(`${label} for "${response.query}"`);
    console.log(`Showing results ${offset + 1}-${offset + response.results.length} (offset: ${offset}, limit: ${limit}).`);

    for (const [index, project] of response.results.entries()) {
      console.log("");
      console.log(`${offset + index + 1}. ${project.title ?? "Untitled"}`);
      console.log(`   ID: ${project.id}`);
      if (type === "project") console.log(`   Author: ${project.author ?? "Unknown"}`);
      console.log(`   URL: ${project.url}`);
    }
  } catch {
    fail(`Failed to parse ${type} search response.`);
  }
}
