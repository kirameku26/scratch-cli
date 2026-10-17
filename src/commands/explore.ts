import { fail } from "../errors.ts";
import { explore } from "../python/explore.ts";
import { pageOffset } from "../pagination.ts";

export type ExploreArguments = {
  type: "project" | "studio";
  mode: "trending" | "popular";
  category: "all" | "animations" | "art" | "games" | "music";
  limit: number;
  offset: number;
  page?: number;
  language: string;
};

export async function exploreCommand(argv: ExploreArguments): Promise<void> {
  if (argv.type !== "project" && argv.type !== "studio") {
    fail("Explore type must be project or studio.");
    return;
  }

  if (argv.mode !== "trending" && argv.mode !== "popular") {
    fail("Mode must be trending or popular.");
    return;
  }

  if (!["all", "animations", "art", "games", "music"].includes(argv.category)) {
    fail("Category must be all, animations, art, games, or music.");
    return;
  }

  if (argv.type === "studio" && argv.category !== "all") {
    fail("Category is available only for projects.");
    return;
  }

  const offset = pageOffset(argv.limit, argv.offset, argv.page);
  if (offset === undefined) return;
  argv.language = argv.language.trim().toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(argv.language)) {
    fail("Language must be a valid language code such as en or ja.");
    return;
  }

  await explore({ ...argv, offset });
}
