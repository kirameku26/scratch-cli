import { venvDir } from "./index.ts";
import { fail } from "../errors.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("./search.py", import.meta.url);

type ProjectSearchResult = {
  id: number;
  title: string | null;
  author: string | null;
  url: string;
};

type ProjectSearchResponse = {
  type: "project";
  query: string;
  results: ProjectSearchResult[];
};

type SearchProjectsArguments = {
  query: string;
  limit: number;
  offset: number;
};

function isProjectSearchResponse(
  value: unknown,
): value is ProjectSearchResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<ProjectSearchResponse>;

  return response.type === "project"
    && typeof response.query === "string"
    && Array.isArray(response.results);
}

export async function searchProjects({
  query,
  limit,
  offset,
}: SearchProjectsArguments): Promise<void> {
  const pythonArgs = [
    pythonPath,
    scriptPath.pathname,
    "project",
    query,
    String(limit),
    String(offset),
  ];

  const result = Bun.spawnSync(pythonArgs, {
    stdout: "pipe",
    stderr: "pipe",
  });

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

    fail(stderr || "Failed to search Scratch projects.");
    return;
  }

  try {
    const response: unknown = JSON.parse(stdout);

    if (!isProjectSearchResponse(response)) {
      fail("Received an invalid project search response.");
      return;
    }

    if (response.results.length === 0) {
      console.log(`No projects found for "${response.query}".`);
      return;
    }

    console.log(`Search results for "${response.query}"`);

    for (const [index, project] of response.results.entries()) {
      console.log("");
      console.log(`${index + 1}. ${project.title ?? "Untitled"}`);
      console.log(`   ID: ${project.id}`);
      console.log(`   Author: ${project.author ?? "Unknown"}`);
      console.log(`   URL: ${project.url}`);
    }
  } catch {
    fail("Failed to parse project search response.");
  }
}
