import { searchProjects } from "../python/search.ts";

export type SearchArguments = {
  type: "project";
  query: string;
  limit: number;
  offset: number;
};

export async function search(
  argv: SearchArguments,
): Promise<void> {
  const query = argv.query.trim();

  if (!query) {
    console.error("Search query must not be empty.");
    process.exitCode = 1;
    return;
  }

  if (!Number.isInteger(argv.limit) || argv.limit < 1 || argv.limit > 40) {
    console.error("Limit must be an integer between 1 and 40.");
    process.exitCode = 1;
    return;
  }

  if (!Number.isInteger(argv.offset) || argv.offset < 0) {
    console.error("Offset must be a non-negative integer.");
    process.exitCode = 1;
    return;
  }

  await searchProjects({
    query,
    limit: argv.limit,
    offset: argv.offset,
  });
}
