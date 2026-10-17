import { fail } from "../errors.ts";
import { getHomeSection, type HomeSection } from "../python/home.ts";
import { pageOffset } from "../pagination.ts";

export const HOME_SECTIONS: readonly HomeSection[] = [
  "whats-happening",
  "news",
  "featured-projects",
  "featured-studios",
  "design-studio",
  "following-loves",
  "most-loved",
  "most-remixed",
  "newest-projects",
  "following-projects",
  "following-studio-projects",
  "viewed-projects",
];

export type HomeArguments = {
  section?: string;
  list?: boolean;
  limit: number;
  offset: number;
  page?: number;
};

export async function home(argv: HomeArguments): Promise<void> {
  if (argv.list && argv.section) {
    fail("--list cannot be combined with a section.");
    return;
  }

  if (argv.list || !argv.section) {
    console.log("Available home sections:");
    console.log(HOME_SECTIONS.join("\n"));
    return;
  }

  if (!HOME_SECTIONS.includes(argv.section as HomeSection)) {
    fail(`Section must be one of: ${HOME_SECTIONS.join(", ")}.`);
    return;
  }

  const offset = pageOffset(argv.limit, argv.offset, argv.page);
  if (offset === undefined) return;

  await getHomeSection({
    section: argv.section as HomeSection,
    limit: argv.limit,
    offset,
  });
}
