import { searchProjects } from "../python/search.ts";
import { fail } from "../errors.ts";
import { pageOffset } from "../pagination.ts";

export type SearchArguments = {
  type: "project" | "studio";
  query: string;
  mode: "trending" | "popular";
  limit: number;
  offset: number;
  page?: number;
  language: string;
};

export async function search(
  argv: SearchArguments,
): Promise<void> {
  const query = argv.query.trim();

  if (!query) {
    fail("Search query must not be empty.");
    return;
  }

  if (argv.mode !== "trending" && argv.mode !== "popular") {
    fail("Mode must be trending or popular.");
    return;
  }

  const offset = pageOffset(argv.limit, argv.offset, argv.page);
  if (offset === undefined) return;
  const language = argv.language.trim().toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(language)) {
    fail("Language must be a valid language code such as en or ja.");
    return;
  }

  await searchProjects({
    type: argv.type,
    query,
    mode: argv.mode,
    limit: argv.limit,
    offset,
    language,
  });
}
