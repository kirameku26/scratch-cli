import { login } from "./login.ts";
import { logout } from "./logout.ts";
import { session } from "./session.ts";
import { python } from "./python.ts";
import { search } from "./search.ts";
import { user, USER_ACTIONS, USER_SECTIONS } from "./user.ts";
import { exploreCommand } from "./explore.ts";
import { notifications, NOTIFICATION_ACTIONS } from "./notifications.ts";
import { home, HOME_SECTIONS } from "./home.ts";
import { project, PROJECT_ACTIONS } from "./project.ts";
import { studio, STUDIO_ACTIONS } from "./studio.ts";
import { account, ACCOUNT_ACTIONS } from "./account.ts";
import { legal, LEGAL_DOCUMENTS } from "./legal.ts";
import { classroom, CLASS_ACTIONS } from "./classroom.ts";
import { forum, FORUM_ACTIONS } from "./forum.ts";

export type Option = {
  name: string;
  alias?: string;
  type: "string" | "boolean" | "number";
  description: string;
  default?: string | boolean | number;
  choices?: readonly string[];
};

export type Positional = {
  name: string;
  type: "string" | "number";
  description: string;
  choices?: readonly string[];
};

export type Command = {
  command?: string;
  description: string;
  aliases?: string[];
  options?: Option[];
  positionals?: Positional[];
  handler: (argv: any) => Promise<void>;
};

export const commands: Record<string, Command> = {
  forum: {
    command: "forum <action> [id]",
    description: "browse Scratch forums and follow topics",
    positionals: [
      { name: "action", type: "string", description: "forum action", choices: FORUM_ACTIONS },
      { name: "id", type: "number", description: "category, topic, or post ID (except categories)" },
    ],
    options: [
      { name: "page", type: "number", description: "one page of topics or posts (default: 1)" },
      { name: "limit", type: "number", description: "maximum items from that page, 1–40 (default: 20)" },
    ],
    handler: forum,
  },
  class: {
    command: "class <action> [id]",
    description: "manage classes for a Scratch teacher account",
    positionals: [
      { name: "action", type: "string", description: "class action", choices: CLASS_ACTIONS },
      { name: "id", type: "number", description: "Scratch class ID (except list or create)" },
    ],
    options: [
      { name: "title", type: "string", description: "class or class studio title" },
      { name: "description", type: "string", description: "class or class studio description" },
      { name: "status", type: "string", description: "class status (create or edit)" },
      { name: "open", type: "string", description: "open or close a class (edit only)", choices: ["on", "off"] },
      { name: "type", type: "string", description: "class list type", choices: ["all", "closed"] },
      { name: "page", type: "number", description: "one page of classes, students, or studios" },
    ],
    handler: classroom,
  },

  account: {
    command: "account <action>",
    description: "show or update the active Scratch account",
    positionals: [
      {
        name: "action",
        type: "string",
        description: "account action",
        choices: ACCOUNT_ACTIONS,
      },
    ],
    options: [
      { name: "about", type: "string", description: "new About me text (edit-profile only)" },
      { name: "working-on", type: "string", description: "new What I'm working on text (edit-profile only)" },
      { name: "featured-project", type: "number", description: "featured project ID (edit-profile only)" },
      { name: "country", type: "string", description: "new country (settings only)" },
      { name: "state", type: "string", description: "new state or region (settings only)" },
      { name: "cat-ears", type: "string", description: "cat ears avatar decoration (settings only)", choices: ["on", "off"] },
      { name: "comments", type: "string", description: "profile comments permission (settings only; use without other settings)", choices: ["on", "off"] },
      { name: "email", type: "string", description: "new email address (change-email only)" },
      { name: "delete-projects", type: "boolean", description: "also delete projects (delete-account only)" },
    ],
    handler: account,
  },

  explore: {
    command: "explore <type>",
    description: "show trending or popular Scratch projects and studios",
    positionals: [
      {
        name: "type",
        type: "string",
        description: "type of resource to explore",
        choices: ["project", "studio"],
      },
    ],
    options: [
      { name: "page", type: "number", description: "1-based page; adds (page - 1) * limit to offset" },
      {
        name: "mode",
        type: "string",
        description: "ranking to show",
        choices: ["trending", "popular"],
        default: "trending",
      },
      {
        name: "category",
        type: "string",
        description: "project category (project only)",
        choices: ["all", "animations", "art", "games", "music"],
        default: "all",
      },
      {
        name: "limit",
        type: "number",
        description: "maximum number of results",
        default: 10,
      },
      {
        name: "offset",
        type: "number",
        description: "number of results to skip",
        default: 0,
      },
      {
        name: "language",
        type: "string",
        description: "Scratch result language code",
        default: "en",
      },
    ],
    handler: exploreCommand,
  },

  home: {
    command: "home [section]",
    description: "view sections from the Scratch home page",
    aliases: ["frontpage"],
    positionals: [
      {
        name: "section",
        type: "string",
        description: "home page section to show",
        choices: HOME_SECTIONS,
      },
    ],
    options: [
      { name: "page", type: "number", description: "1-based page; adds (page - 1) * limit to offset" },
      {
        name: "list",
        type: "boolean",
        description: "list available home sections without loading data",
      },
      {
        name: "limit",
        type: "number",
        description: "maximum number of results",
        default: 10,
      },
      {
        name: "offset",
        type: "number",
        description: "number of results to skip",
        default: 0,
      },
    ],
    handler: home,
  },

  login: {
    description: "login to Scratch",
    options: [
      {
        name: "username",
        type: "string",
        description: "Scratch username",
      },
    ],
    handler: login,
  },

  legal: {
    command: "legal <document>",
    description: "show an official Scratch policy document URL",
    positionals: [
      { name: "document", type: "string", description: "policy document", choices: LEGAL_DOCUMENTS },
    ],
    handler: legal,
  },

  logout: {
    description: "log out and remove the saved CLI login",
    options: [
      { name: "local", type: "boolean", description: "remove only the saved CLI login without contacting Scratch" },
    ],
    handler: logout,
  },

  notifications: {
    command: "notifications [action]",
    description: "show Scratch notifications for the active account",
    aliases: ["messages"],
    positionals: [
      { name: "action", type: "string", description: "notification action", choices: NOTIFICATION_ACTIONS },
    ],
    options: [
      { name: "page", type: "number", description: "1-based list page; uses --limit or the unread count (up to 40) as page size" },
      {
        name: "limit",
        type: "number",
        description: "maximum number of notifications",
      },
      {
        name: "offset",
        type: "number",
        description: "number of notifications to skip",
        default: 0,
      },
    ],
    handler: notifications,
  },

  session: {
    description: "check login status",
    aliases: ["s"],
    handler: session,
  },

  python: {
    description: "check Python installation",
    handler: python,
  },

  project: {
    command: "project <action> [id]",
    description: "manage and interact with Scratch projects",
    positionals: [
      {
        name: "action",
        type: "string",
        description: "project action",
        choices: PROJECT_ACTIONS,
      },
      {
        name: "id",
        type: "number",
        description: "Scratch project ID (for project-specific actions)",
      },
    ],
    options: [
      {
        name: "text",
        type: "string",
        description: "comment text (comments only)",
      },
      { name: "comment-id", type: "number", description: "parent or target comment ID (reply, report-comment, delete-comment)" },
      {
        name: "title",
        type: "string",
        description: "project title (create, remix, edit, or new upload)",
      },
      { name: "instructions", type: "string", description: "new project instructions (edit only)" },
      { name: "credits", type: "string", description: "new project Notes and Credits (edit only)" },
      { name: "file", type: "string", description: "thumbnail image path or sb3 file path (thumbnail or upload)" },
      { name: "output", type: "string", description: "project destination path (download only; default: <project title>.sb3)" },
      { name: "format", type: "string", description: "download format (default: sb3); original keeps the source format", choices: ["sb", "sb2", "sb3", "original"] },
      { name: "category", type: "number", description: "Scratch report category 0-19 (report only)" },
      { name: "reason", type: "string", description: "report explanation (report only)" },
      { name: "comments", type: "string", description: "comments permission (settings only)", choices: ["on", "off"] },
      { name: "limit", type: "number", description: "maximum items, 1–40 (comments, remixes, studios only; default: 20)" },
      { name: "offset", type: "number", description: "items to skip (comments, remixes, studios only; default: 0)" },
      {
        name: "visibility",
        type: "string",
        description: "projects to list (default: all)",
        choices: ["all", "shared", "notshared", "trashed"],
      },
      {
        name: "page",
        type: "number",
        description: "My Stuff page, or 1-based comments/remixes/studios page (default: 1)",
      },
    ],
    handler: project,
  },

  search: {
    command: "search <type> <query>",
    description: "search Scratch projects and studios",
    positionals: [
      {
        name: "type",
        type: "string",
        description: "type of resource to search",
        choices: ["project", "studio"],
      },
      {
        name: "query",
        type: "string",
        description: "search query",
      },
    ],
    options: [
      { name: "page", type: "number", description: "1-based page; adds (page - 1) * limit to offset" },
      {
        name: "mode",
        type: "string",
        description: "result ranking",
        choices: ["trending", "popular"],
        default: "trending",
      },
      {
        name: "limit",
        type: "number",
        description: "maximum number of results",
        default: 10,
      },
      {
        name: "offset",
        type: "number",
        description: "number of results to skip",
        default: 0,
      },
      {
        name: "language",
        type: "string",
        description: "Scratch result language code",
        default: "en",
      },
    ],
    handler: search,
  },

  studio: {
    command: "studio <action> [id]",
    description: "manage Scratch studios",
    positionals: [
      {
        name: "action",
        type: "string",
        description: "studio action",
        choices: STUDIO_ACTIONS,
      },
      {
        name: "id",
        type: "number",
        description: "Scratch studio ID (except list or create)",
      },
    ],
    options: [
      { name: "comments", type: "string", description: "comments permission (settings only)", choices: ["on", "off"] },
      { name: "open-to-all", type: "string", description: "allow everyone to add projects (settings only)", choices: ["on", "off"] },
      { name: "limit", type: "number", description: "maximum items, 1–40 (projects or activity only; default: 20)" },
      { name: "offset", type: "number", description: "projects to skip (projects only; default: 0)" },
      {
        name: "user",
        type: "string",
        description: "username for promote, invite, remove-curator, or transfer",
      },
      { name: "title", type: "string", description: "new studio title (edit only)" },
      { name: "description", type: "string", description: "new studio description (edit only)" },
      { name: "file", type: "string", description: "PNG, JPEG, or GIF thumbnail path (thumbnail only)" },
      { name: "project", type: "string", description: "project ID or URL (add-project or remove-project)" },
      { name: "type", type: "string", description: "studio list type", choices: ["all", "owned", "curated"] },
      { name: "page", type: "number", description: "studio list page or 1-based projects page (default: 1)" },
      { name: "text", type: "string", description: "studio comment text" },
      { name: "comment-id", type: "number", description: "parent or target comment ID" },
      { name: "report-type", type: "string", description: "studio report reason", choices: ["title", "description", "thumbnail"] },
    ],
    handler: studio,
  },

  user: {
    command: "user [username] [action]",
    description: "show user details, profiles, and public lists",
    aliases: ["u"],
    positionals: [
      {
        name: "username",
        type: "string",
        description: "Scratch username (default: logged-in account)",
      },
      {
        name: "action",
        type: "string",
        description: "optional user action",
        choices: USER_ACTIONS,
      },
    ],
    options: [
      {
        name: "section",
        type: "string",
        description: "information to show (default: details)",
        choices: USER_SECTIONS,
      },
      {
        name: "list",
        type: "boolean",
        description: "list available user sections without loading a user",
      },
      {
        name: "limit",
        type: "number",
        description: "maximum number of results (for public lists)",
      },
      {
        name: "offset",
        type: "number",
        description: "number of results to skip (for public lists)",
      },
      {
        name: "page",
        type: "number",
        description: "1-based comments or public-list page (default: 1)",
      },
      {
        name: "text",
        type: "string",
        description: "comment text (user comment actions only)",
      },
      { name: "comment-id", type: "number", description: "parent or target comment ID (reply, report-comment, delete-comment)" },
      { name: "report-type", type: "string", description: "user report reason", choices: ["username", "icon", "description", "working_on"] },
    ],
    handler: user,
  },

  version: {
    description: "output the version number",
    handler: async () => {
      const packageJson = await Bun.file(
        new URL("../../package.json", import.meta.url),
      ).json();

      console.log(packageJson.version);
    },
  },

  completion: {
    description: "output zsh completion script",
    handler: async () => {
      const completion = await Bun.file(
        new URL("../completion/_scc", import.meta.url),
      ).text();

      process.stdout.write(completion);
    },
  },
};
