import { fail } from "../errors.ts";
import { explore } from "../python/explore.ts";

export type ExploreArguments = {
  type: "project" | "studio";
  mode: "trending" | "popular";
  category: "all" | "animations" | "art" | "games" | "music";
  limit: number;
  offset: number;
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

  if (!Number.isInteger(argv.limit) || argv.limit < 1 || argv.limit > 40) {
    fail("Limit must be an integer between 1 and 40.");
    return;
  }

  if (!Number.isInteger(argv.offset) || argv.offset < 0) {
    fail("Offset must be a non-negative integer.");
    return;
  }

  await explore(argv);
}
