import type { Command } from "./index.ts";

const commandGroups = [
  ["Login and account", ["login", "logout", "session", "account", "notifications"]],
  ["Browse and discover", ["home", "search", "explore", "user", "forum", "legal"]],
  ["Projects and studios", ["project", "studio"]],
  ["Teacher tools", ["class"]],
  ["Setup and tools", ["python", "completion", "version"]],
] as const;

type Guide = { groups: Array<[string, string[]]>; examples: string[]; note?: string };

const guides: Record<string, Guide> = {
  forum: {
    groups: [["Read", ["categories", "topics", "topic", "posts", "post", "source"]], ["Subscriptions", ["follow", "unfollow"]]],
    examples: ["scc forum categories", "scc forum topics 18 --page 1", "scc forum posts 123 --page 2", "scc forum source 456", "scc forum follow 123"],
    note: "Reads are public and load only one page. ID means category for topics, topic for topic/posts/follow/unfollow, and post for post/source. Following requires login and confirmation. Creating posts and replies is not supported.",
  },
  account: {
    groups: [
      ["Profile and appearance", ["edit-profile", "settings"]],
      ["Scratcher membership", ["scratcher-status", "become-scratcher"]],
      ["Security", ["change-email", "change-password", "delete-account"]],
    ],
    examples: ["scc account edit-profile --about \"Hello!\"", "scc account settings --country Japan", "scc account change-password"],
    note: "An action is required. Use scc user to view the active user. Changes require interactive confirmation.",
  },
  project: {
    groups: [
      ["Read", ["details", "list", "comments", "remixes", "studios", "reactions"]],
      ["Create and edit", ["create", "remix", "edit", "thumbnail"]],
      ["Local files", ["download", "upload"]],
      ["Publish and trash", ["share", "unshare", "trash", "restore"]],
      ["Permissions", ["settings"]],
      ["Reactions", ["love", "unlove", "favorite", "unfavorite"]],
      ["Comments", ["comment", "reply", "delete-comment"]],
      ["Reports", ["report", "report-comment"]],
    ],
    examples: ["scc project details 123", "scc project list --visibility shared", "scc project comment 123 --text \"Nice project!\"", "scc project edit 123 --title \"New title\""],
    note: "list shows your own projects. ID is required except for list, create, and new uploads. Uploading with an ID overwrites that project's contents after confirmation.",
  },
  studio: {
    groups: [
      ["Read", ["details", "list", "projects", "activity", "role", "managers", "curators", "comments"]],
      ["Permissions", ["settings"]],
      ["Create and edit", ["create", "edit", "thumbnail", "delete"]],
      ["Projects", ["add-project", "remove-project"]],
      ["Membership", ["accept-invite", "follow", "unfollow", "leave", "invite", "remove-curator", "promote", "transfer"]],
      ["Comments", ["comment", "reply", "delete-comment"]],
      ["Reports", ["report", "report-comment"]],
    ],
    examples: ["scc studio details 123", "scc studio list --type owned", "scc studio add-project 123 --project 456", "scc studio invite 123 --user curator_name"],
    note: "list shows your own studios. ID is required except for list and create.",
  },
  user: {
    groups: [
      ["Profile sections (--section)", ["details", "about", "projects", "favorites", "studios", "followed-studios", "following", "followers", "comments"]],
      ["Follow", ["follow", "unfollow"]],
      ["Comments", ["comment", "reply", "delete-comment"]],
      ["Reports", ["report", "report-comment"]],
    ],
    examples: ["scc user griffpatch --section about", "scc user griffpatch --section projects", "scc user griffpatch follow", "scc user griffpatch comment --text \"Hello!\""],
    note: "Username comes before the action. Without a username, reads use the active account.",
  },
  class: {
    groups: [
      ["Read", ["list", "details", "students", "studios"]],
      ["Create and edit", ["create", "edit", "create-studio"]],
    ],
    examples: ["scc class list", "scc class students 123", "scc class create --title \"My class\"", "scc class edit 123 --open off"],
    note: "Requires a Scratch teacher account. ID is required except for list and create.",
  },
  notifications: {
    groups: [["Read", ["list", "count"]], ["Mark as read", ["read"]]],
    examples: ["scc notifications", "scc notifications count", "scc notifications read"],
    note: "Without an action, lists unread messages (up to 40). read requires confirmation.",
  },
  home: {
    groups: [
      ["News", ["news"]],
      ["Featured", ["featured-projects", "featured-studios", "design-studio"]],
      ["Popular and new", ["most-loved", "most-remixed", "newest-projects"]],
      ["Personal (login required)", ["whats-happening", "following-loves", "following-projects", "following-studio-projects", "viewed-projects"]],
    ],
    examples: ["scc home news", "scc home featured-projects", "scc home following-projects"],
    note: "Without a section, lists available sections without a network request.",
  },
  logout: {
    groups: [],
    examples: ["scc logout", "scc logout --local"],
    note: "--local removes only the saved CLI login without contacting Scratch. Browser logins are separate.",
  },
};

export function commandGuide(name: string): string | undefined {
  const guide = guides[name];
  if (!guide) return undefined;
  const lines: string[] = [];
  if (guide.groups.length) {
    lines.push("Actions and sections:");
    for (const [title, actions] of guide.groups) lines.push(`  ${title}: ${actions.join(", ")}`);
    lines.push("");
  }
  lines.push("Examples:", ...guide.examples.map((example) => `  ${example}`));
  if (guide.note) lines.push("", guide.note);
  if (["search", "explore", "home", "user", "project", "studio", "notifications"].includes(name)) {
    lines.push("", "For offset-based lists: --page is 1-based; effective offset = offset + (page - 1) * limit. Native page-based lists keep their original page size.");
  }
  if (name !== "home" && name !== "logout") lines.push("", `For action details: scc help ${name} <action>`);
  return lines.join("\n");
}

export function mainHelp(commands: Record<string, Command>): string {
  const lines = ["scc <command> [options]", "", "Use scc help <command> or scc <command> --help for actions, options, and examples."];
  for (const [title, names] of commandGroups) {
    lines.push("", `${title}:`);
    for (const name of names) {
      const command = commands[name];
      if (command) lines.push(`  scc ${(command.command ?? name).padEnd(32)} ${command.description}`);
    }
  }
  lines.push(
    `  scc ${"help [command] [action]".padEnd(32)} show command or action details`,
    "", "Options:", "  -h, --help                       show help", "  -v, --version                    show version",
    "", "Aliases: u = user; s = session; messages = notifications; frontpage = home.",
  );
  return lines.join("\n");
}

export function helpArguments(args: string[], commands: Record<string, Command>): string[] {
  const name = canonicalCommandName(args[1], commands);
  if (args[0] === "help" && args.length >= 2 && args.length <= 3 && name) {
    if (args.length === 3 && name === "user") return [args[1]!, "<username>", args[2]!, "--help"];
    return [args[1]!, ...args.slice(2), "--help"];
  }
  if (args.length === 1 && ["project", "studio", "class", "forum"].includes(args[0]!)) return [args[0]!, "--help"];
  return args;
}

export function canonicalCommandName(name: string | undefined, commands: Record<string, Command>): string | undefined {
  return Object.keys(commands).find((key) => key === name || commands[key]!.aliases?.includes(name ?? ""));
}
