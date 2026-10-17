import { fail } from "../errors.ts";
import { runDangerousManagement, runManagement } from "../python/management.ts";
import { showResource } from "../python/resources.ts";
import { runInteraction, type StudioInteraction } from "../python/interactions.ts";
import { loadThumbnail } from "./project.ts";
import { readHiddenInput } from "./login.ts";
import { showCollection } from "../python/collections.ts";
import { pageOffset } from "../pagination.ts";

export const STUDIO_ACTIONS = [
  "details", "create", "accept-invite", "promote", "delete",
  "edit", "thumbnail", "add-project", "list", "follow", "unfollow",
  "leave", "invite", "remove-curator", "remove-project", "managers",
  "curators", "comments", "comment", "reply", "report", "report-comment",
  "delete-comment", "transfer",
  "projects", "activity", "role", "settings",
] as const;

type StudioArguments = {
  action: string;
  id?: number;
  user?: string;
  title?: string;
  description?: string;
  file?: string;
  project?: string;
  type?: "all" | "owned" | "curated";
  page?: number;
  text?: string;
  commentId?: number;
  reportType?: string;
  limit?: number;
  offset?: number;
  comments?: "on" | "off";
  openToAll?: "on" | "off";
};

function projectId(value?: string): number | undefined {
  if (!value) return undefined;
  const match = /^(?:https:\/\/scratch\.mit\.edu\/projects\/)?([1-9]\d*)\/?$/.exec(value.trim());
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : undefined;
}

export async function studio(argv: StudioArguments): Promise<void> {
  if (!STUDIO_ACTIONS.includes(argv.action as typeof STUDIO_ACTIONS[number])) {
    fail(`Studio action must be one of: ${STUDIO_ACTIONS.join(", ")}.`);
    return;
  }
  if (!["projects", "activity"].includes(argv.action) && (argv.limit !== undefined || argv.offset !== undefined)) {
    fail("--limit and --offset are available only for studio projects and activity.");
    return;
  }
  if (argv.action !== "settings" && (argv.comments !== undefined || argv.openToAll !== undefined)) {
    fail("--comments and --open-to-all are available only for studio settings.");
    return;
  }
  if (["projects", "activity", "role", "settings"].includes(argv.action)) {
    if (!Number.isSafeInteger(argv.id) || (argv.id ?? 0) < 1) { fail("Studio ID must be a positive integer."); return; }
    if ([argv.user, argv.title, argv.description, argv.file, argv.project, argv.type,
      argv.text, argv.commentId, argv.reportType].some((value) => value !== undefined)) {
      fail("This studio action does not accept edit, membership, or comment-posting options.");
      return;
    }
    if (argv.action !== "projects" && argv.page !== undefined) { fail("--page is available only for studio projects and list."); return; }
    if (argv.action === "settings") {
      if ((argv.comments === undefined) === (argv.openToAll === undefined)
        || (argv.comments !== undefined && !["on", "off"].includes(argv.comments))
        || (argv.openToAll !== undefined && !["on", "off"].includes(argv.openToAll))) {
        fail("Provide exactly one of --comments on|off or --open-to-all on|off.");
        return;
      }
      await runDangerousManagement({ entity: "studio", action: "settings", payload: {
        studio_id: argv.id, comments: argv.comments === undefined ? undefined : argv.comments === "on",
        open_to_all: argv.openToAll === undefined ? undefined : argv.openToAll === "on",
      } }, (account) => `Account: ${account}\nStudio: ${argv.id}\n${argv.comments === undefined ? `Open to all: ${argv.openToAll}` : `Comments: ${argv.comments}`}`);
    } else if (argv.action === "role") {
      await runManagement({ entity: "studio", action: "role", payload: { studio_id: argv.id } });
    } else {
      const limit = argv.limit ?? 20, offset = pageOffset(limit, argv.offset, argv.page);
      if (offset === undefined) return;
      if (argv.action === "activity" && argv.offset !== undefined) { fail("--offset is not available for studio activity."); return; }
      await showCollection({ entity: "studio", action: argv.action as "projects" | "activity", id: argv.id!, limit, offset });
    }
    return;
  }
  if (argv.action === "details") {
    if (!Number.isSafeInteger(argv.id) || (argv.id ?? 0) < 1) {
      fail("Studio ID must be a positive integer.");
      return;
    }
    if (argv.user !== undefined || argv.title !== undefined || argv.description !== undefined
      || argv.file !== undefined || argv.project !== undefined || argv.type !== undefined
      || argv.page !== undefined || argv.text !== undefined || argv.commentId !== undefined
      || argv.reportType !== undefined) {
      fail("Studio details accepts only a studio ID.");
      return;
    }
    await showResource("studio", argv.id!);
    return;
  }
  if (argv.action === "list") {
    if (argv.id !== undefined || argv.user !== undefined || argv.title !== undefined
      || argv.description !== undefined || argv.file !== undefined || argv.project !== undefined
      || argv.text !== undefined || argv.commentId !== undefined || argv.reportType !== undefined) {
      fail("Studio list does not accept an ID or mutation options.");
      return;
    }
    const page = argv.page ?? 1;
    if (!Number.isSafeInteger(page) || page < 1) {
      fail("Page must be a positive integer.");
      return;
    }
    await runManagement({
      entity: "studio", action: "list", payload: { type: argv.type ?? "all", page },
    });
    return;
  }
  if (argv.type !== undefined || argv.page !== undefined) {
    fail("--type and --page are available only for the studio list action.");
    return;
  }
  if (argv.action !== "report" && argv.reportType !== undefined) {
    fail("--report-type is available only for the studio report action.");
    return;
  }
  if (!["comment", "reply"].includes(argv.action) && argv.text !== undefined) {
    fail("--text is available only for studio comments.");
    return;
  }
  if (!["reply", "report-comment", "delete-comment"].includes(argv.action)
    && argv.commentId !== undefined) {
    fail("--comment-id is available only for replies and comment reports or deletion.");
    return;
  }
  if (argv.action === "report" && !["title", "description", "thumbnail"].includes(argv.reportType ?? "")) {
    fail("Studio report requires --report-type title|description|thumbnail.");
    return;
  }
  if (argv.action === "create") {
    if (argv.id !== undefined || argv.user !== undefined || argv.title !== undefined
      || argv.description !== undefined || argv.file !== undefined || argv.project !== undefined) {
      fail("Studio creation does not accept an ID or edit options.");
      return;
    }
    await runDangerousManagement({ entity: "studio", action: "create" },
      (account) => `Account: ${account}\nAction: create a new Scratch studio`);
    return;
  }
  if (!Number.isSafeInteger(argv.id) || (argv.id ?? 0) < 1) {
    fail("Studio ID must be a positive integer.");
    return;
  }
  if (["follow", "unfollow", "comment", "reply"].includes(argv.action)) {
    if (argv.user !== undefined || argv.title !== undefined || argv.description !== undefined
      || argv.file !== undefined || argv.project !== undefined || argv.type !== undefined
      || argv.reportType !== undefined) {
      fail("Studio interaction does not accept management options.");
      return;
    }
    const text = argv.text?.trim();
    if (["comment", "reply"].includes(argv.action) && !text) {
      fail("Comment text must not be empty. Use --text to provide it.");
      return;
    }
    if (text && text.length > 500) {
      fail("Comment text must be 500 characters or fewer.");
      return;
    }
    if (argv.action === "reply" && (!Number.isSafeInteger(argv.commentId) || argv.commentId! < 1)) {
      fail("Reply comment ID must be a positive integer. Use --comment-id.");
      return;
    }
    if (argv.action !== "reply" && argv.commentId !== undefined) {
      fail("--comment-id is available only for comment replies.");
      return;
    }
    await runInteraction({
      entity: "studio", action: argv.action as StudioInteraction, target: String(argv.id), text,
      commentId: argv.commentId,
    });
    return;
  }
  if (["comments", "managers", "curators"].includes(argv.action)) {
    if (argv.user !== undefined || argv.title !== undefined || argv.description !== undefined
      || argv.file !== undefined || argv.project !== undefined || argv.type !== undefined
      || argv.reportType !== undefined || argv.text !== undefined || argv.commentId !== undefined) {
      fail(`Studio ${argv.action} does not accept additional options.`);
      return;
    }
    await runManagement({ entity: "studio", action: argv.action as "comments" | "managers" | "curators", payload: { studio_id: argv.id } });
    return;
  }
  if (argv.action === "report-comment" || argv.action === "delete-comment") {
    if (!Number.isSafeInteger(argv.commentId) || argv.commentId! < 1) {
      fail("Comment ID must be a positive integer. Use --comment-id.");
      return;
    }
    if (argv.user !== undefined || argv.title !== undefined || argv.description !== undefined
      || argv.file !== undefined || argv.project !== undefined || argv.type !== undefined
      || argv.reportType !== undefined || argv.text !== undefined) {
      fail("Comment reporting and deletion accept only --comment-id.");
      return;
    }
    const args = { entity: "studio" as const, action: argv.action as "report-comment" | "delete-comment", payload: {
      studio_id: argv.id, comment_id: argv.commentId,
    } };
    if (argv.action === "report-comment") {
      await runDangerousManagement(args, (account) => `Account: ${account}\nStudio: ${argv.id}\nAction: report comment ${argv.commentId}`);
    } else {
      await runDangerousManagement(args, (account) => `Account: ${account}\nStudio: ${argv.id}\nAction: delete your comment ${argv.commentId}`);
    }
    return;
  }
  if (argv.action === "accept-invite") {
    if (argv.user !== undefined || argv.title !== undefined || argv.description !== undefined
      || argv.file !== undefined || argv.project !== undefined) {
      fail("Studio invitation acceptance does not accept edit options.");
      return;
    }
    await runDangerousManagement({
      entity: "studio",
      action: "accept-invite",
      payload: { studio_id: argv.id },
    }, (account) => `Account: ${account}\nStudio: ${argv.id}\nAction: accept the curator invitation`);
    return;
  }
  if (argv.action === "promote" && !argv.user) {
    fail("A Scratch username is required with --user.");
    return;
  }
  if (["invite", "remove-curator", "transfer"].includes(argv.action) && !argv.user) {
    fail(`A Scratch username is required with --user for ${argv.action}.`);
    return;
  }
  if (["promote", "invite", "remove-curator", "transfer"].includes(argv.action)
    && !/^[A-Za-z0-9_-]+$/.test(argv.user!)) {
    fail("Username may contain only letters, numbers, underscores, and hyphens.");
    return;
  }
  if (["promote", "invite", "remove-curator", "transfer"].includes(argv.action) && (argv.title !== undefined
    || argv.description !== undefined || argv.file !== undefined || argv.project !== undefined)) {
    fail(`Studio ${argv.action} accepts only --user.`);
    return;
  }
  if (argv.action === "delete" && argv.user !== undefined) {
    fail("--user is available only when promoting a curator.");
    return;
  }
  const title = argv.title?.trim();
  if (argv.title !== undefined && !title) {
    fail("Studio title must not be empty.");
    return;
  }
  if (argv.action === "edit") {
    if (title === undefined && argv.description === undefined) {
      fail("Provide --title or --description.");
      return;
    }
    if (argv.user !== undefined || argv.file !== undefined || argv.project !== undefined) {
      fail("Studio edit accepts only --title and --description.");
      return;
    }
  } else if (argv.action === "thumbnail") {
    if (argv.user !== undefined || title !== undefined || argv.description !== undefined
      || argv.project !== undefined) {
      fail("Studio thumbnail accepts only --file.");
      return;
    }
  } else if (argv.action === "add-project" || argv.action === "remove-project") {
    if (argv.user !== undefined || title !== undefined || argv.description !== undefined
      || argv.file !== undefined) {
      fail(`Studio ${argv.action} accepts only --project.`);
      return;
    }
    if (projectId(argv.project) === undefined) {
      fail("--project must be a positive project ID or Scratch project URL.");
      return;
    }
  } else if (argv.action !== "promote" && (title !== undefined
    || argv.description !== undefined || argv.file !== undefined || argv.project !== undefined)) {
    fail("This studio action does not accept edit options.");
    return;
  }
  if (argv.action === "transfer") {
    await runDangerousManagement(
      { entity: "studio", action: "transfer", payload: { studio_id: argv.id, username: argv.user } },
      (account) => `Account: ${account}\nStudio: ${argv.id}\nNew owner: ${argv.user}\nThis transfers ownership of the studio.`,
      undefined,
      {
        expectedAnswer: () => `transfer ${argv.id} to ${argv.user}`,
        extraPayload: async () => {
          try {
            const password = await readHiddenInput("Scratch password: ");
            if (password) return { password };
            fail("Password must not be empty.");
          } catch {
            fail("Could not read the password securely.");
          }
          return undefined;
        },
      },
    );
    return;
  }
  const thumbnail = argv.action === "thumbnail" ? await loadThumbnail(argv.file) : undefined;
  if (argv.action === "thumbnail" && thumbnail === undefined) return;
  const args = {
    entity: "studio",
    action: argv.action as any,
    payload: {
      studio_id: argv.id, username: argv.user, title,
      description: argv.description, thumbnail,
      project_id: projectId(argv.project),
      type: argv.reportType,
    },
  } as const;
  await runDangerousManagement(args, (account) => [
    `Account: ${account}`,
    `Studio: ${argv.id}`,
    `Action: ${argv.action === "promote" ? `promote ${argv.user} to manager` : argv.action}`,
    "This changes data on Scratch.",
  ].join("\n"));
}
