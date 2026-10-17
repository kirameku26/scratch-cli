import { fail } from "../errors.ts";
import { runForum, type ForumAction } from "../python/forum.ts";

export const FORUM_ACTIONS: readonly ForumAction[] = [
  "categories", "topics", "topic", "posts", "post", "source", "follow", "unfollow",
];

export async function forum(argv: { action: string; id?: number; page?: number; limit?: number }): Promise<void> {
  if (!FORUM_ACTIONS.includes(argv.action as ForumAction)) {
    fail(`Action must be one of: ${FORUM_ACTIONS.join(", ")}.`);
    return;
  }
  if (argv.action === "categories" ? argv.id !== undefined : !Number.isSafeInteger(argv.id) || argv.id! < 1) {
    fail(argv.action === "categories" ? "Forum categories does not accept an ID." : "Forum ID must be a positive integer.");
    return;
  }
  const paginated = ["topics", "posts"].includes(argv.action);
  if (!paginated && (argv.page !== undefined || argv.limit !== undefined)) {
    fail("--page and --limit are available only for forum topics and posts.");
    return;
  }
  const page = argv.page ?? 1;
  const limit = argv.limit ?? 20;
  if (!Number.isSafeInteger(page) || page < 1) {
    fail("Page must be a positive integer.");
    return;
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 40) {
    fail("Limit must be an integer between 1 and 40.");
    return;
  }
  await runForum({ action: argv.action as ForumAction, id: argv.id, page, limit });
}
