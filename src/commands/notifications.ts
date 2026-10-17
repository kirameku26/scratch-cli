import { fail } from "../errors.ts";
import { getNotifications } from "../python/notifications.ts";
import { runDangerousManagement } from "../python/management.ts";
import { pageOffset } from "../pagination.ts";

export const NOTIFICATION_ACTIONS = ["list", "count", "read"] as const;

export type NotificationsArguments = {
  action?: string;
  limit?: number;
  offset: number;
  page?: number;
};

export async function notifications(
  argv: NotificationsArguments,
): Promise<void> {
  const action = argv.action ?? "list";
  if (!NOTIFICATION_ACTIONS.includes(action as typeof NOTIFICATION_ACTIONS[number])) {
    fail(`Notification action must be one of: ${NOTIFICATION_ACTIONS.join(", ")}.`);
    return;
  }
  if (argv.limit !== undefined
    && (!Number.isInteger(argv.limit) || argv.limit < 1 || argv.limit > 40)) {
    fail("Limit must be an integer between 1 and 40.");
    return;
  }

  if (pageOffset(argv.limit ?? 40, argv.offset, argv.page) === undefined) return;
  if (action !== "list" && (argv.limit !== undefined || argv.offset !== 0 || argv.page !== undefined)) {
    fail("Pagination options are available only for notification list.");
    return;
  }

  if (action === "read") {
    await runDangerousManagement(
      { entity: "account", action: "clear-messages" },
      (account) => [
        `Account: ${account}`,
        "Action: mark all messages as read",
        "This cannot be undone.",
      ].join("\n"),
    );
    return;
  }

  await getNotifications({ action: action as "list" | "count", limit: argv.limit, offset: argv.offset, page: argv.page });
}
