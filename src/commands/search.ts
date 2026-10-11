import { searchProjects } from "../python/search.ts";
import { fail } from "../errors.ts";

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
    fail("Search query must not be empty.");
    return;
  }

  if (!Number.isInteger(argv.limit) || argv.limit < 1 || argv.limit > 40) {
    fail("Limit must be an integer between 1 and 40.");
    return;
  }

  if (!Number.isInteger(argv.offset) || argv.offset < 0) {
    fail("Offset must be a non-negative integer.");
    return;
  }

  await searchProjects({
    query,
    limit: argv.limit,
    offset: argv.offset,
  });
}
