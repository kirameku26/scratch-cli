import { loadConfig } from "../config.ts";
import { fail } from "../errors.ts";
import { getProfileSection, type ProfileSection } from "../python/profile.ts";

const sections: readonly ProfileSection[] = [
  "about", "projects", "favorites", "studios", "followed-studios",
  "following", "followers", "comments",
];

export type ProfileArguments = {
  section?: string;
  legacySection?: string;
  user?: string;
  list?: boolean;
  limit?: number;
  offset?: number;
  page?: number;
};

export async function profile(argv: ProfileArguments): Promise<void> {
  if (argv.list) {
    if (argv.section || argv.legacySection || argv.user
      || argv.limit !== undefined || argv.offset !== undefined || argv.page !== undefined) {
      fail("--list cannot be combined with a section or other options.");
      return;
    }
    console.log("Available profile sections:");
    console.log(sections.join("\n"));
    return;
  }

  let username = argv.user;
  let section = argv.section ?? "about";

  // Keep the former `profile <username> <section>` form working.
  if (argv.legacySection !== undefined) {
    if (argv.user) {
      fail("Specify the user either with --user or in the legacy position, not both.");
      return;
    }
    username = argv.section;
    section = argv.legacySection;
  }

  if (!sections.includes(section as ProfileSection)) {
    fail(`Section must be one of: ${sections.join(", ")}.`);
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
    if (argv.page !== undefined) {
      fail("--page is available only for comments.");
      return;
    }
    if (argv.limit !== undefined
      && (!Number.isSafeInteger(argv.limit) || argv.limit < 1 || argv.limit > 40)) {
      fail("Limit must be an integer between 1 and 40.");
      return;
    }
    if (argv.offset !== undefined
      && (!Number.isSafeInteger(argv.offset) || argv.offset < 0)) {
      fail("Offset must be a non-negative integer.");
      return;
    }
  }

  let sessionId: string | undefined;
  if (!username) {
    const config = await loadConfig();
    sessionId = config.scratchsessionsid;
    if (!sessionId) {
      fail("No active session. Run `scc login` first or specify --user.");
      return;
    }
  }

  await getProfileSection({
    username,
    sessionId,
    section: section as ProfileSection,
    limit: argv.limit ?? 10,
    offset: argv.offset ?? 0,
    page: argv.page ?? 1,
  });
}
