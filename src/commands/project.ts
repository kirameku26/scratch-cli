import { fail } from "../errors.ts";
import {
  runInteraction,
  type ProjectInteraction,
} from "../python/interactions.ts";
import { runDangerousManagement, runManagement } from "../python/management.ts";
import { showResource } from "../python/resources.ts";
import { showCollection } from "../python/collections.ts";
import { transferProject } from "../python/project-transfer.ts";
import { pageOffset } from "../pagination.ts";

export const PROJECT_ACTIONS = [
  "love", "unlove", "favorite", "unfavorite", "comment", "reply",
  "details", "list", "create", "remix", "share", "trash", "restore",
  "edit", "thumbnail", "report", "report-comment", "delete-comment",
  "comments", "remixes", "studios", "reactions", "unshare", "settings",
  "download", "upload",
] as const;

const PROJECT_INTERACTIONS: readonly ProjectInteraction[] = [
  "love", "unlove", "favorite", "unfavorite", "comment", "reply",
];

export type ProjectArguments = {
  action: string;
  id?: number;
  text?: string;
  title?: string;
  visibility?: "all" | "shared" | "notshared" | "trashed";
  page?: number;
  instructions?: string;
  credits?: string;
  file?: string;
  output?: string;
  format?: "sb" | "sb2" | "sb3" | "original";
  category?: number;
  reason?: string;
  commentId?: number;
  limit?: number;
  offset?: number;
  comments?: "on" | "off";
};

export async function loadThumbnail(path?: string): Promise<string | undefined> {
  if (!path?.trim()) {
    fail("A thumbnail image path is required with --file.");
    return undefined;
  }
  try {
    const file = Bun.file(path);
    if (!await file.exists()) {
      fail("Thumbnail file does not exist.");
      return undefined;
    }
    if (file.size < 1 || file.size > 5 * 1024 * 1024) {
      fail("Thumbnail image must be between 1 byte and 5 MiB.");
      return undefined;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isGif = String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8");
    if (!isPng && !isJpeg && !isGif) {
      fail("Thumbnail must be a PNG, JPEG, or GIF image.");
      return undefined;
    }
    return Buffer.from(bytes).toString("base64");
  } catch {
    fail("Could not read the thumbnail file.");
    return undefined;
  }
}

export function validateCommentText(action: string, text?: string): string | undefined {
  if (action !== "comment" && action !== "reply") {
    if (text !== undefined) fail("--text is available only for comments.");
    return undefined;
  }
  const content = text?.trim();
  if (!content) {
    fail("Comment text must not be empty. Use --text to provide it.");
    return undefined;
  }
  if (content.length > 500) {
    fail("Comment text must be 500 characters or fewer.");
    return undefined;
  }
  return content;
}

export async function project(argv: ProjectArguments): Promise<void> {
  if (!PROJECT_ACTIONS.includes(argv.action as typeof PROJECT_ACTIONS[number])) {
    fail(`Project action must be one of: ${PROJECT_ACTIONS.join(", ")}.`);
    return;
  }

  if (argv.action === "download" || argv.action === "upload") {
    if ([argv.text, argv.visibility, argv.page, argv.instructions, argv.credits, argv.category,
      argv.reason, argv.commentId, argv.limit, argv.offset, argv.comments].some((value) => value !== undefined)) {
      fail("Project transfers do not accept comment, report, edit, or list options."); return;
    }
    if ((argv.action === "download" || argv.id !== undefined)
      && (!Number.isSafeInteger(argv.id) || argv.id! < 1)) {
      fail("Project ID must be a positive integer."); return;
    }
    if (argv.action === "download") {
      if (argv.file !== undefined || argv.title !== undefined || (argv.output !== undefined && !argv.output.trim())) {
        fail("Project download accepts only an ID and an optional --output path."); return;
      }
    } else {
      if (!argv.file?.trim() || argv.output !== undefined || argv.format !== undefined) {
        fail("Project upload requires --file <project.sb3> and does not accept --output."); return;
      }
      if (argv.title !== undefined && (argv.id !== undefined || !argv.title.trim() || argv.title.length > 100)) {
        fail("--title (1–100 characters) is available only for new uploads."); return;
      }
    }
    await transferProject({ action: argv.action, id: argv.id, file: argv.file, output: argv.output, title: argv.title, format: argv.format });
    return;
  }
  if (argv.output !== undefined) { fail("--output is available only for project download."); return; }
  if (argv.format !== undefined) { fail("--format is available only for project download."); return; }

  if (!["comments", "remixes", "studios"].includes(argv.action) && (argv.limit !== undefined || argv.offset !== undefined)) {
    fail("--limit and --offset are available only for project comments, remixes, and studios.");
    return;
  }
  if (argv.action !== "settings" && argv.comments !== undefined) {
    fail("--comments is available only for project settings.");
    return;
  }
  if (["comments", "remixes", "studios", "reactions", "settings"].includes(argv.action)) {
    if (!Number.isSafeInteger(argv.id) || (argv.id ?? 0) < 1) {
      fail("Project ID must be a positive integer.");
      return;
    }
    if ([argv.text, argv.title, argv.visibility, argv.instructions, argv.credits,
      argv.file, argv.category, argv.reason, argv.commentId].some((value) => value !== undefined)) {
      fail("This project action does not accept edit, report, or comment-posting options.");
      return;
    }
    if (["settings", "reactions"].includes(argv.action) && argv.page !== undefined) { fail("--page is not available for this project action."); return; }
    if (argv.action === "settings") {
      if (!["on", "off"].includes(argv.comments ?? "")) { fail("Provide --comments on|off."); return; }
      await runDangerousManagement({ entity: "project", action: "settings", payload: { project_id: argv.id, comments: argv.comments === "on" } },
        (account) => `Account: ${account}\nProject: ${argv.id}\nComments: ${argv.comments}`);
    } else if (argv.action === "reactions") {
      await runManagement({ entity: "project", action: "reactions", payload: { project_id: argv.id } });
    } else {
      const limit = argv.limit ?? 20, offset = pageOffset(limit, argv.offset, argv.page);
      if (offset === undefined) return;
      await showCollection({ entity: "project", action: argv.action as "comments" | "remixes" | "studios", id: argv.id!, limit, offset });
    }
    return;
  }

  if (argv.action === "details") {
    if (!Number.isSafeInteger(argv.id) || (argv.id ?? 0) < 1) {
      fail("Project ID must be a positive integer.");
      return;
    }
    if (argv.text !== undefined || argv.title !== undefined || argv.visibility !== undefined
      || argv.page !== undefined || argv.instructions !== undefined || argv.credits !== undefined
      || argv.file !== undefined || argv.category !== undefined || argv.reason !== undefined
      || argv.commentId !== undefined) {
      fail("Project details accepts only a project ID.");
      return;
    }
    await showResource("project", argv.id!);
    return;
  }

  if (argv.action === "list") {
    if (argv.id !== undefined || argv.text !== undefined || argv.title !== undefined
      || argv.instructions !== undefined || argv.credits !== undefined
      || argv.file !== undefined || argv.category !== undefined || argv.reason !== undefined
      || argv.commentId !== undefined) {
      fail("Project list does not accept an ID or mutation options.");
      return;
    }
    const page = argv.page ?? 1;
    if (!Number.isSafeInteger(page) || page < 1) {
      fail("Page must be a positive integer.");
      return;
    }
    await runManagement({
      entity: "project",
      action: "list",
      payload: { visibility: argv.visibility ?? "all", page },
    });
    return;
  }

  if (argv.action === "create") {
    if (argv.id !== undefined || argv.text !== undefined
      || argv.visibility !== undefined || argv.page !== undefined
      || argv.instructions !== undefined || argv.credits !== undefined
      || argv.file !== undefined || argv.category !== undefined || argv.reason !== undefined
      || argv.commentId !== undefined) {
      fail("Project create accepts only --title.");
      return;
    }
    const title = argv.title?.trim();
    if (argv.title !== undefined && !title) {
      fail("Project title must not be empty.");
      return;
    }
    await runDangerousManagement({
      entity: "project",
      action: "create",
      payload: { title },
    }, (account) => `Account: ${account}\nAction: create a new Scratch project\nTitle: ${title ?? "Default title"}`);
    return;
  }

  if (["remix", "share", "unshare", "trash", "restore", "edit", "thumbnail", "report", "report-comment", "delete-comment"].includes(argv.action)) {
    if (!Number.isSafeInteger(argv.id) || (argv.id ?? 0) < 1) {
      fail("Project ID must be a positive integer.");
      return;
    }
    if (argv.text !== undefined || argv.visibility !== undefined || argv.page !== undefined) {
      fail("This project action does not accept comment or list options.");
      return;
    }
    const title = argv.title?.trim();
    if (argv.title !== undefined && !title) {
      fail("Project title must not be empty.");
      return;
    }
    if (!['report-comment', 'delete-comment'].includes(argv.action) && argv.commentId !== undefined) {
      fail("--comment-id is available only for replies and comment reports.");
      return;
    }
    if (argv.action === "edit") {
      if (title === undefined && argv.instructions === undefined && argv.credits === undefined) {
        fail("Provide --title, --instructions, or --credits.");
        return;
      }
      if (argv.file !== undefined || argv.category !== undefined || argv.reason !== undefined) {
        fail("Thumbnail and report options cannot be used with project edit.");
        return;
      }
    } else if (argv.action === "remix") {
      if (argv.instructions !== undefined || argv.credits !== undefined
        || argv.file !== undefined || argv.category !== undefined || argv.reason !== undefined) {
        fail("Project remix accepts only --title.");
        return;
      }
    } else if (argv.action === "thumbnail") {
      if (title !== undefined || argv.instructions !== undefined || argv.credits !== undefined
        || argv.category !== undefined || argv.reason !== undefined) {
        fail("Project thumbnail accepts only --file.");
        return;
      }
    } else if (argv.action === "report") {
      if (!Number.isSafeInteger(argv.category) || argv.category! < 0 || argv.category! > 19
        || !argv.reason?.trim()) {
        fail("Project report requires --category 0-19 and a non-empty --reason.");
        return;
      }
      if (title !== undefined || argv.instructions !== undefined || argv.credits !== undefined
        || argv.file !== undefined) {
        fail("Project report accepts only --category and --reason.");
        return;
      }
    } else if (argv.action === "report-comment" || argv.action === "delete-comment") {
      if (!Number.isSafeInteger(argv.commentId) || argv.commentId! < 1) {
        fail("Comment ID must be a positive integer. Use --comment-id.");
        return;
      }
      if (title !== undefined || argv.instructions !== undefined || argv.credits !== undefined
        || argv.file !== undefined || argv.category !== undefined || argv.reason !== undefined) {
        fail("Project comment reporting and deletion accept only --comment-id.");
        return;
      }
    } else if (argv.action !== "remix" && (title !== undefined
      || argv.instructions !== undefined || argv.credits !== undefined
      || argv.file !== undefined || argv.category !== undefined || argv.reason !== undefined)) {
      fail("This project action does not accept edit, thumbnail, or report options.");
      return;
    }
    const thumbnail = argv.action === "thumbnail" ? await loadThumbnail(argv.file) : undefined;
    if (argv.action === "thumbnail" && thumbnail === undefined) return;
    const args = {
      entity: "project" as const,
      action: argv.action as "remix" | "share" | "unshare" | "trash" | "restore" | "edit" | "thumbnail" | "report" | "report-comment" | "delete-comment",
      payload: {
        project_id: argv.id, title, instructions: argv.instructions,
        description: argv.credits, thumbnail, category: argv.category,
        reason: argv.reason?.trim(),
        comment_id: argv.commentId,
      },
    };
    await runDangerousManagement(args, (account) => [
        `Account: ${account}`,
        `Project: ${argv.id}`,
        `Action: ${argv.action}`,
        title === undefined ? undefined : `Title: ${title}`,
        "This changes data on Scratch.",
      ].filter(Boolean).join("\n"));
    return;
  }

  if (!PROJECT_INTERACTIONS.includes(argv.action as ProjectInteraction)) {
    fail("Unsupported project action.");
    return;
  }
  if (!Number.isSafeInteger(argv.id) || (argv.id ?? 0) < 1) {
    fail("Project ID must be a positive integer.");
    return;
  }
  if (argv.title !== undefined || argv.visibility !== undefined || argv.page !== undefined) {
    fail("List and creation options are not available for this project action.");
    return;
  }
  if (argv.instructions !== undefined || argv.credits !== undefined
    || argv.file !== undefined || argv.category !== undefined || argv.reason !== undefined) {
    fail("Edit, thumbnail, and report options are not available for this project action.");
    return;
  }
  const text = validateCommentText(argv.action, argv.text);
  if (["comment", "reply"].includes(argv.action) && text === undefined) return;
  if (!["comment", "reply"].includes(argv.action) && argv.text !== undefined) return;
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
    entity: "project",
    action: argv.action as ProjectInteraction,
    target: String(argv.id),
    text,
    commentId: argv.commentId,
  });
}
