import { fail } from "../errors.ts";
import { getNotifications } from "../python/notifications.ts";

export type NotificationsArguments = {
  limit: number;
  offset: number;
};

export async function notifications(
  argv: NotificationsArguments,
): Promise<void> {
  if (!Number.isInteger(argv.limit) || argv.limit < 1 || argv.limit > 40) {
    fail("Limit must be an integer between 1 and 40.");
    return;
  }

  if (!Number.isInteger(argv.offset) || argv.offset < 0) {
    fail("Offset must be a non-negative integer.");
    return;
  }

  await getNotifications(argv);
}
