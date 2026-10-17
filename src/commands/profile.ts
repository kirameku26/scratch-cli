import { loadConfig } from "../config.ts";
import { fail } from "../errors.ts";
import { getProfileSection, type ProfileSection } from "../python/profile.ts";
import { pageOffset } from "../pagination.ts";

export const PROFILE_SECTIONS: readonly ProfileSection[] = [
  "about", "projects", "favorites", "studios", "followed-studios",
  "following", "followers", "comments",
];

export type ProfileArguments = {
  section?: string;
  user?: string;
  limit?: number;
  offset?: number;
  page?: number;
};

export async function profile(argv: ProfileArguments): Promise<void> {
  const username = argv.user;
  const section = argv.section ?? "about";
  let offset = argv.offset ?? 0;

  if (!PROFILE_SECTIONS.includes(section as ProfileSection)) {
    fail(`Section must be one of: ${PROFILE_SECTIONS.join(", ")}.`);
    return;
  }

  if (username !== undefined && !/^[A-Za-z0-9_-]+$/.test(username)) {
    fail("Username may contain only letters, numbers, underscores, and hyphens.");
    return;
  }

  if (section === "about") {
    if (argv.limit !== undefined || argv.offset !== undefined || argv.page !== undefined) {
      fail("Pagination options are not available for the about section.");
      return;
    }
  } else if (section === "comments") {
    if (argv.limit !== undefined || argv.offset !== undefined) {
      fail("Use --page for comments; --limit and --offset are not available.");
      return;
    }
    if (argv.page !== undefined
      && (!Number.isSafeInteger(argv.page) || argv.page < 1)) {
      fail("Page must be a positive integer.");
      return;
    }
  } else {
    const resolved = pageOffset(argv.limit ?? 10, argv.offset, argv.page);
    if (resolved === undefined) return;
    offset = resolved;
  }

  let sessionId: string | undefined;
  if (!username || section === "about") {
    const config = await loadConfig();
    sessionId = config.scratchsessionsid;
    if (!username && !sessionId) {
      fail("No active session. Run `scc login` first or specify a username.");
      return;
    }
  }

  await getProfileSection({
    username,
    sessionId,
    section: section as ProfileSection,
    limit: argv.limit ?? 10,
    offset,
    page: argv.page ?? 1,
  });
}
