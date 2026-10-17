import { getUser } from "../python/user.ts";
import { fail } from "../errors.ts";
import { profile, PROFILE_SECTIONS } from "./profile.ts";
import type { ProfileSection } from "../python/profile.ts";
import {
  runInteraction,
  type UserInteraction,
} from "../python/interactions.ts";
import { runDangerousManagement } from "../python/management.ts";

export const USER_SECTIONS = ["details", ...PROFILE_SECTIONS] as const;
export const USER_ACTIONS = [
  "follow", "unfollow", "comment", "reply", "report-comment", "report", "delete-comment",
] as const;

type UserSection = "details" | ProfileSection;

export type UserArguments = {
  username?: string;
  action?: string;
  section?: string;
  list?: boolean;
  limit?: number;
  offset?: number;
  page?: number;
  text?: string;
  commentId?: number;
  reportType?: string;
};

export async function user(argv: UserArguments) {
  if (argv.action) {
    if (!USER_ACTIONS.includes(argv.action as typeof USER_ACTIONS[number])) {
      fail(`User action must be one of: ${USER_ACTIONS.join(", ")}.`);
      return;
    }
    if (!argv.username) {
      fail("A positional username is required for user actions.");
      return;
    }
    if (argv.action !== "report" && argv.reportType !== undefined) {
      fail("--report-type is available only for the user report action.");
      return;
    }
    if (argv.section || argv.list
      || argv.limit !== undefined || argv.offset !== undefined || argv.page !== undefined) {
      fail("User actions cannot be combined with profile sections or pagination options.");
      return;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(argv.username)) {
      fail("Username may contain only letters, numbers, underscores, and hyphens.");
      return;
    }
    if (argv.action === "report-comment" || argv.action === "delete-comment") {
      if (argv.text !== undefined) {
        fail("User comment reporting does not accept --text.");
        return;
      }
      if (!Number.isSafeInteger(argv.commentId) || argv.commentId! < 1) {
        fail("Comment ID must be a positive integer. Use --comment-id.");
        return;
      }
      await runDangerousManagement({
        entity: "user",
        action: argv.action,
        payload: { username: argv.username, comment_id: argv.commentId },
      }, (account) => [
        `Account: ${account}`,
        `User: ${argv.username}`,
        `Action: ${argv.action === "report-comment" ? "report" : "delete your"} comment ${argv.commentId}`,
      ].join("\n"));
      return;
    }
    if (argv.action === "report") {
      if (!argv.reportType || !["username", "icon", "description", "working_on"].includes(argv.reportType)) {
        fail("User report requires --report-type username|icon|description|working_on.");
        return;
      }
      if (argv.text !== undefined || argv.commentId !== undefined) {
        fail("User reporting accepts only --report-type.");
        return;
      }
      await runDangerousManagement({
        entity: "user", action: "report", payload: { username: argv.username, type: argv.reportType },
      }, (account) => `Account: ${account}\nUser: ${argv.username}\nAction: report ${argv.reportType}`);
      return;
    }
    const text = argv.text?.trim();
    if (argv.action === "comment" || argv.action === "reply") {
      if (!text) {
        fail("Comment text must not be empty. Use --text to provide it.");
        return;
      }
      if (text.length > 500) {
        fail("Comment text must be 500 characters or fewer.");
        return;
      }
    } else if (argv.text !== undefined) {
      fail("--text is available only for comments.");
      return;
    }
    if (argv.action === "reply"
      && (!Number.isSafeInteger(argv.commentId) || argv.commentId! < 1)) {
      fail("Reply comment ID must be a positive integer. Use --comment-id.");
      return;
    }
    if (argv.action !== "reply" && argv.commentId !== undefined) {
      fail("--comment-id is available only for comment replies.");
      return;
    }

    await runInteraction({
      entity: "user",
      action: argv.action as UserInteraction,
      target: argv.username,
      text,
      commentId: argv.commentId,
    });
    return;
  }

  if (argv.text !== undefined) {
    fail("--text requires a user comment action.");
    return;
  }
  if (argv.commentId !== undefined) {
    fail("--comment-id requires a user reply action.");
    return;
  }
  if (argv.reportType !== undefined) {
    fail("--report-type requires the user report action.");
    return;
  }

  if (argv.list) {
    if (argv.username || argv.section
      || argv.limit !== undefined || argv.offset !== undefined || argv.page !== undefined) {
      fail("--list cannot be combined with a user, section, or pagination options.");
      return;
    }

    console.log("Available user sections:");
    console.log(USER_SECTIONS.join("\n"));
    return;
  }

  const username = argv.username;
  const section = argv.section ?? "details";

  if (!USER_SECTIONS.includes(section as UserSection)) {
    fail(`Section must be one of: ${USER_SECTIONS.join(", ")}.`);
    return;
  }

  if (section === "details") {
    if (argv.limit !== undefined || argv.offset !== undefined || argv.page !== undefined) {
      fail("Pagination options are not available for the details section.");
      return;
    }

    if (username !== undefined && !/^[A-Za-z0-9_-]+$/.test(username)) {
      fail("Username may contain only letters, numbers, underscores, and hyphens.");
      return;
    }

    await getUser({ user: username });
    return;
  }

  await profile({
    section,
    user: username,
    limit: argv.limit,
    offset: argv.offset,
    page: argv.page,
  });
}
