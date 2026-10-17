import yargs from "yargs";

import type { Command, Option } from "./index.ts";
import { canonicalCommandName } from "./help.ts";

type ActionGuide = {
  description: string;
  options: string[];
  example: string;
  required?: string[];
  requirements?: string[];
  confirmation?: string;
  public?: boolean;
};

const confirmation = "Requires interactive confirmation showing the active account and target.";
const commentRequirements = ["Comment text must contain 1–500 characters."];
const thumbnailRequirements = ["Provide an existing PNG, JPEG, or GIF file between 1 byte and 5 MiB."];

function commentActions(entity: "project" | "studio" | "user"): Record<string, ActionGuide> {
  const target = entity === "user" ? "griffpatch" : "123";
  const prefix = entity === "user" ? `scc user ${target}` : `scc ${entity}`;
  const suffix = entity === "user" ? "" : ` ${target}`;
  return {
    comment: {
      description: `Post a public comment on a ${entity}.`, options: ["text"], required: ["text"],
      requirements: commentRequirements, confirmation, example: `${prefix} comment${suffix} --text "Hello!"`,
    },
    reply: {
      description: `Reply to a comment on a ${entity}.`, options: ["comment-id", "text"], required: ["comment-id", "text"],
      requirements: [...commentRequirements, "--comment-id must be a positive parent comment ID on the target."],
      confirmation, example: `${prefix} reply${suffix} --comment-id 456 --text "Thanks!"`,
    },
    "report-comment": {
      description: `Report a comment on a ${entity} to the Scratch Team.`, options: ["comment-id"], required: ["comment-id"],
      requirements: ["--comment-id must be a positive comment ID on the target."],
      confirmation, example: `${prefix} report-comment${suffix} --comment-id 456`,
    },
    "delete-comment": {
      description: `Delete your comment on a ${entity}.`, options: ["comment-id"], required: ["comment-id"],
      requirements: ["--comment-id must be a positive comment ID on the target."],
      confirmation, example: `${prefix} delete-comment${suffix} --comment-id 456`,
    },
  };
}

const actionGuides: Record<string, Record<string, ActionGuide>> = {
  forum: {
    categories: { description: "List public forum categories grouped by section.", options: [], public: true, example: "scc forum categories" },
    topics: { description: "List one page of topics in a forum category.", options: ["page", "limit"], public: true,
      requirements: ["ID identifies a category. Page defaults to 1; limit defaults to 20 (1–40). No following pages are fetched."], example: "scc forum topics 18 --page 1" },
    topic: { description: "Show a forum topic's title, category, page count, and URL.", options: [], public: true, example: "scc forum topic 123" },
    posts: { description: "Read one page of posts in a forum topic as plain text.", options: ["page", "limit"], public: true,
      requirements: ["ID identifies a topic. Page defaults to 1; limit defaults to 20 (1–40). No following pages are fetched."], example: "scc forum posts 123 --page 2" },
    post: { description: "Read a forum post, its author, dates, and topic as plain text.", options: [], public: true, example: "scc forum post 456" },
    source: { description: "Show the BBCode source of a forum post.", options: [], public: true, example: "scc forum source 456" },
    follow: { description: "Follow a forum topic with the active account.", options: [], confirmation, example: "scc forum follow 123" },
    unfollow: { description: "Unfollow a forum topic with the active account.", options: [], confirmation, example: "scc forum unfollow 123" },
  },
  project: {
    download: {
      description: "Download a Scratch project as sb3 by default, converting older formats offline.",
      options: ["output", "format"], public: true,
      requirements: ["Destination defaults to <project title>.sb3; its parent directory must exist. Existing files require interactive confirmation.", "Use --format original to keep the source, or --format sb|sb2|sb3 to select the output. Upgrades from sb to sb2/sb3 and sb2 to sb3 are supported; downgrades are not.", "Invalid filename characters are replaced and long titles shortened. Empty or unavailable titles fall back to the ID. --output takes priority, but Scratch extensions must match --format.", "Conversion does not execute project scripts or load external extensions. SVG appearance may differ from the old editor; original keeps the source format without conversion. Files up to 50 MiB; download timeout 120 seconds and conversion timeout 120 seconds."],
      example: "scc project download 123 --output project.sb3",
    },
    upload: {
      description: "Upload an sb3 as a new unshared project, or overwrite an existing project owned by the active account.",
      options: ["file", "title"], required: ["file"], confirmation,
      requirements: ["ID is optional: omit it to create; provide it to replace code, costumes, and sounds. Existing titles and sharing settings are preserved.", "Existing projects require typing overwrite <id>. Back up your project first; the CLI cannot undo uploads.", "--title (1–100 characters) is allowed only when creating. sb3 only, up to 50 MiB, 200 unique assets, 100 MiB expanded, 10 MiB per asset, 5 MiB JSON; timeout 120 seconds.", "Assets are uploaded before project data. Failures may leave uploaded assets or a completed change; check Scratch before retrying."],
      example: "scc project upload --file project.sb3 --title \"My project\"",
    },
    comments: { description: "Read one page of top-level project comments, including IDs for replies.", options: ["limit", "offset", "page"], public: true,
      requirements: ["Limit defaults to 20 (1–40); offset defaults to 0. Replies are not fetched automatically."], example: "scc project comments 123 --limit 20 --offset 0" },
    remixes: { description: "List remixes of a project (not a remix tree).", options: ["limit", "offset", "page"], public: true, example: "scc project remixes 123" },
    studios: { description: "List studios containing a project.", options: ["limit", "offset", "page"], public: true, example: "scc project studios 123" },
    reactions: { description: "Show whether the active account has loved or favorited a project.", options: [], example: "scc project reactions 123" },
    settings: { description: "Set project comments explicitly on or off.", options: ["comments"], required: ["comments"], confirmation, example: "scc project settings 123 --comments off" },
    details: {
      description: "Show the title, remix source, instructions, Notes and Credits, and project statistics.",
      options: [], public: true, example: "scc project details 123",
    },
    list: {
      description: "List one page of the active account's My Stuff projects.", options: ["visibility", "page"],
      requirements: ["Visibility defaults to all; page defaults to 1 (a positive integer)."],
      example: "scc project list --visibility trashed --page 1",
    },
    create: {
      description: "Create a new empty project for the active account.", options: ["title"], confirmation,
      example: "scc project create --title \"New project\"",
    },
    remix: {
      description: "Create a new project by copying an existing project's data and recording its remix source.",
      options: ["title"], confirmation, example: "scc project remix 123 --title \"My remix\"",
    },
    edit: {
      description: "Edit a project's title, instructions, or Notes and Credits.", options: ["title", "instructions", "credits"],
      requirements: ["Provide at least one of --title, --instructions, or --credits."], confirmation,
      example: "scc project edit 123 --title \"New title\" --credits \"Thanks!\"",
    },
    thumbnail: {
      description: "Replace a project's thumbnail with a local image.", options: ["file"], required: ["file"],
      requirements: thumbnailRequirements, confirmation, example: "scc project thumbnail 123 --file thumbnail.png",
    },
    share: {
      description: "Share a project publicly on Scratch.", options: [], confirmation, example: "scc project share 123",
    },
    unshare: { description: "Make a shared project unshared.", options: [], confirmation, example: "scc project unshare 123" },
    trash: {
      description: "Move a project to My Stuff's trash.", options: [], confirmation, example: "scc project trash 123",
    },
    restore: {
      description: "Restore a project from My Stuff's trash.", options: [], confirmation, example: "scc project restore 123",
    },
    love: { description: "Add a love to a project.", options: [], confirmation, example: "scc project love 123" },
    unlove: { description: "Remove your love from a project.", options: [], confirmation, example: "scc project unlove 123" },
    favorite: { description: "Add a project to your favorites.", options: [], confirmation, example: "scc project favorite 123" },
    unfavorite: { description: "Remove a project from your favorites.", options: [], confirmation, example: "scc project unfavorite 123" },
    report: {
      description: "Report a project to the Scratch Team.", options: ["category", "reason"], required: ["category", "reason"],
      requirements: ["Category must be an integer from 0 to 19; reason must not be empty."], confirmation,
      example: "scc project report 123 --category 6 --reason \"Explanation\"",
    },
    ...commentActions("project"),
  },
  studio: {
    projects: { description: "List one page of projects in a studio.", options: ["limit", "offset", "page"], public: true, example: "scc studio projects 123 --limit 20" },
    activity: { description: "List recent studio activities with one request.", options: ["limit"], public: true, example: "scc studio activity 123 --limit 20" },
    role: { description: "Show the active account's manager, curator, invitation, and following states in a studio.", options: [], example: "scc studio role 123" },
    settings: { description: "Set studio comments or public project additions explicitly on or off.", options: ["comments", "open-to-all"], confirmation,
      requirements: ["Provide exactly one of --comments or --open-to-all. Already matching settings are not changed."], example: "scc studio settings 123 --open-to-all off" },
    details: {
      description: "Show a studio's title, description, owner, settings, and statistics.", options: [], public: true,
      example: "scc studio details 123",
    },
    list: {
      description: "List one page of the active account's My Stuff studios.", options: ["type", "page"],
      requirements: ["Type defaults to all; page defaults to 1 (a positive integer)."],
      example: "scc studio list --type owned --page 1",
    },
    create: { description: "Create a new studio for the active account.", options: [], confirmation, example: "scc studio create" },
    edit: {
      description: "Edit a studio's title or description.", options: ["title", "description"],
      requirements: ["Provide at least one of --title or --description."], confirmation,
      example: "scc studio edit 123 --title \"New title\"",
    },
    thumbnail: {
      description: "Replace a studio's thumbnail with a local image.", options: ["file"], required: ["file"],
      requirements: thumbnailRequirements, confirmation, example: "scc studio thumbnail 123 --file thumbnail.png",
    },
    delete: { description: "Delete a studio.", options: [], confirmation, example: "scc studio delete 123" },
    "add-project": {
      description: "Add an existing Scratch project to a studio.", options: ["project"], required: ["project"],
      requirements: ["--project accepts a positive project ID or an https://scratch.mit.edu/projects/<id>/ URL."],
      confirmation, example: "scc studio add-project 123 --project https://scratch.mit.edu/projects/456/",
    },
    "remove-project": {
      description: "Remove a project from a studio without deleting the project.", options: ["project"], required: ["project"],
      requirements: ["--project accepts a positive project ID or an https://scratch.mit.edu/projects/<id>/ URL."],
      confirmation, example: "scc studio remove-project 123 --project 456",
    },
    "accept-invite": { description: "Accept a curator invitation to a studio.", options: [], confirmation, example: "scc studio accept-invite 123" },
    follow: { description: "Follow a studio.", options: [], confirmation, example: "scc studio follow 123" },
    unfollow: { description: "Unfollow a studio.", options: [], confirmation, example: "scc studio unfollow 123" },
    leave: { description: "Leave a studio's curator team.", options: [], confirmation, example: "scc studio leave 123" },
    invite: {
      description: "Invite a user to curate a studio.", options: ["user"], required: ["user"], confirmation,
      example: "scc studio invite 123 --user curator_name",
    },
    "remove-curator": {
      description: "Remove a user from a studio's curator team.", options: ["user"], required: ["user"], confirmation,
      example: "scc studio remove-curator 123 --user curator_name",
    },
    promote: {
      description: "Promote a studio curator to manager.", options: ["user"], required: ["user"], confirmation,
      example: "scc studio promote 123 --user curator_name",
    },
    transfer: {
      description: "Transfer a studio's ownership to another user.", options: ["user"], required: ["user"],
      confirmation: 'Requires typing "transfer <id> to <username>" in an interactive terminal, then entering your password without echo.',
      example: "scc studio transfer 123 --user new_owner",
    },
    managers: { description: "List the first page of a studio's managers (up to 40).", options: [], example: "scc studio managers 123" },
    curators: { description: "List the first page of a studio's curators (up to 40).", options: [], example: "scc studio curators 123" },
    comments: { description: "List the first page of a studio's comments (up to 40).", options: [], example: "scc studio comments 123" },
    report: {
      description: "Report a studio's title, description, or thumbnail to the Scratch Team.",
      options: ["report-type"], required: ["report-type"], confirmation,
      example: "scc studio report 123 --report-type title",
    },
    ...commentActions("studio"),
  },
  user: {
    follow: { description: "Follow a Scratch user with the active account.", options: [], confirmation, example: "scc user griffpatch follow" },
    unfollow: { description: "Unfollow a Scratch user with the active account.", options: [], confirmation, example: "scc user griffpatch unfollow" },
    report: {
      description: "Report a user's username, avatar, About me, or What I'm working on to the Scratch Team.",
      options: ["report-type"], required: ["report-type"], confirmation,
      example: "scc user griffpatch report --report-type icon",
    },
    ...commentActions("user"),
  },
  account: {
    "edit-profile": {
      description: "Edit the active account's public profile or featured project.",
      options: ["about", "working-on", "featured-project"], confirmation,
      requirements: ["Provide at least one of --about, --working-on, or --featured-project."],
      example: "scc account edit-profile --about \"Hello!\" --working-on \"A game\"",
    },
    settings: {
      description: "Edit the active account's country, region, cat ears avatar decoration, or profile comments permission.", options: ["country", "state", "cat-ears", "comments"], confirmation,
      requirements: ["Provide --country, --state, --cat-ears, or --comments. Use --comments alone without other account settings."],
      example: "scc account settings --country Japan --cat-ears on",
    },
    "scratcher-status": {
      description: "Check whether the active account has an invitation to become a Scratcher.", options: [],
      example: "scc account scratcher-status",
    },
    "become-scratcher": {
      description: "Accept the active account's invitation to become a Scratcher.", options: [], confirmation,
      example: "scc account become-scratcher",
    },
    "change-email": {
      description: "Request an email address change for the active account.", options: ["email"], required: ["email"],
      confirmation: `${confirmation} Your password is then read without echo.`,
      example: "scc account change-email --email new@example.com",
    },
    "change-password": {
      description: "Change the active account's password and clear the saved CLI login after success.", options: [],
      requirements: ["The new password must contain 6–128 characters, differ from the current password, and be entered twice."],
      confirmation: 'Requires typing "change-password <account>" in an interactive terminal. Current and new passwords are read without echo.',
      example: "scc account change-password",
    },
    "delete-account": {
      description: "Request deletion of the active Scratch account and clear the saved CLI login after success.", options: ["delete-projects"],
      requirements: ["Projects are not deleted unless --delete-projects is explicitly specified."],
      confirmation: 'Requires typing "delete <account>" in an interactive terminal, then entering your password without echo.',
      example: "scc account delete-account",
    },
  },
  class: {
    list: {
      description: "List one page of the teacher account's classes.", options: ["type", "page"],
      requirements: ["Type defaults to all; page defaults to 1 (a positive integer)."], example: "scc class list --type closed --page 1",
    },
    details: { description: "Show a class's title, description, status, and counts.", options: [], example: "scc class details 123" },
    students: { description: "List one page of a class's students.", options: ["page"], requirements: ["Page defaults to 1 (a positive integer)."], example: "scc class students 123 --page 1" },
    studios: { description: "List one page of a class's studios.", options: ["page"], requirements: ["Page defaults to 1 (a positive integer)."], example: "scc class studios 123 --page 1" },
    create: {
      description: "Create a class for the teacher account.", options: ["title", "description", "status"], required: ["title"], confirmation,
      requirements: ["Title must contain 1–100 characters. Description and status must each contain at most 5000 characters."],
      example: "scc class create --title \"My class\"",
    },
    edit: {
      description: "Edit a class's profile or open/close the class.", options: ["title", "description", "status", "open"],
      requirements: ["Provide at least one of --title, --description, --status, or --open.", "Title must contain 1–100 characters. Description and status must each contain at most 5000 characters."],
      confirmation: `${confirmation} Closing requires typing "close class <id>".`,
      example: "scc class edit 123 --open off",
    },
    "create-studio": {
      description: "Create a studio in a class.", options: ["title", "description"], required: ["title"], confirmation,
      requirements: ["Title must contain 1–100 characters. Description must contain at most 5000 characters."],
      example: "scc class create-studio 123 --title \"Class projects\"",
    },
  },
  notifications: {
    list: {
      description: "List messages for the active account; default to the unread count, capped at 40.", options: ["limit", "offset", "page"],
      requirements: ["--limit must be 1–40. --offset must be a non-negative integer (default: 0)."],
      example: "scc notifications list --limit 20 --offset 20",
    },
    count: { description: "Show only the active account's unread message count.", options: [], example: "scc notifications count" },
    read: {
      description: "Mark all messages for the active account as read.", options: [], confirmation,
      requirements: ["This clears the unread count for all messages, not just the displayed page."], example: "scc notifications read",
    },
  },
};

export type ActionHelpTarget = { command: string; action: string; error?: string };

export function actionHelpTarget(args: string[], commands: Record<string, Command>): ActionHelpTarget | undefined {
  const name = canonicalCommandName(args[0], commands);
  if (!name) return undefined;
  const command = commands[name]!;
  const actionIndex = command.positionals?.findIndex((positional) => positional.name === "action") ?? -1;
  if (actionIndex < 0) return undefined;

  // Parse options without registering any command handlers. This distinguishes
  // --help from text supplied as an option value and never performs an action.
  const parser = yargs(args.slice(1)).help(false).version(false).exitProcess(false).fail(() => {});
  for (const option of command.options ?? []) {
    parser.option(option.name, { type: option.type, alias: option.alias });
  }
  const parsed = parser.option("help", { type: "boolean", alias: "h" })
    .option("version", { type: "boolean", alias: "v" }).parseSync();
  if (parsed.version || !parsed.help || parsed._[actionIndex] === undefined) return undefined;
  const action = String(parsed._[actionIndex]);
  const choices = command.positionals![actionIndex]!.choices ?? [];
  if (!choices.includes(action)) {
    return { command: name, action, error: `Unknown ${name} action. Choose one of: ${choices.join(", ")}.` };
  }
  return { command: name, action };
}

function optionUsage(option: Option): string {
  const value = option.type === "boolean" ? "" : ` <${option.choices?.join("|") ?? option.type}>`;
  return `${option.alias ? `-${option.alias}, ` : ""}--${option.name}${value}`;
}

export function actionHelp(target: ActionHelpTarget, commands: Record<string, Command>): string {
  const { command: name, action } = target;
  const guide = actionGuides[name]?.[action];
  const command = commands[name];
  if (!guide || !command) throw new Error("Missing action help definition.");
  const optionalId = name === "project" && action === "upload";
  const takesId = (["project", "studio", "class"].includes(name) && !["list", "create", "upload"].includes(action))
    || (name === "forum" && action !== "categories");
  const usage = name === "user" ? `scc user <username> ${action}` : `scc ${name} ${action}${takesId ? " <id>" : optionalId ? " [id]" : ""}`;
  const options = guide.options.map((name) => {
    const option = command.options?.find((option) => option.name === name);
    if (!option) throw new Error("Unknown action help option.");
    return option;
  });
  const requiredOptions = options.filter((option) => guide.required?.includes(option.name));
  const lines = [`${usage}${requiredOptions.map((option) => ` ${optionUsage(option)}`).join("")} [options]`, "", guide.description];
  if (takesId || name === "user") {
    lines.push("", "Arguments:", takesId
      ? `  id  Positive integer identifying the Scratch ${name}.`
      : "  username  Scratch username (letters, numbers, underscores, and hyphens).");
  }
  lines.push("", "Options:");
  for (const option of options) {
    const required = guide.required?.includes(option.name) ? " [required]" : "";
    const defaultValue = option.default !== undefined ? ` [default: ${option.default}]` : "";
    lines.push(`  ${optionUsage(option)}${required}`, `    ${option.description}${defaultValue}`);
  }
  lines.push("  -h, --help", "    Show help for this action.", "  -v, --version", "    Show version.");
  lines.push("", "Requirements:", `  ${guide.public ? "No login required." : name === "class" ? "Requires a logged-in Scratch teacher account." : "Requires a logged-in Scratch account."}`);
  for (const requirement of guide.requirements ?? []) lines.push(`  ${requirement}`);
  if (guide.options.includes("offset") && guide.options.includes("page")) lines.push("  Effective offset = offset + (page - 1) * limit; page defaults to 1. Each request loads only the selected page.");
  if (guide.confirmation) lines.push(`  ${guide.confirmation}`);
  lines.push("", "Example:", `  ${guide.example}`);
  return lines.join("\n");
}
