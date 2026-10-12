import { login } from "./login.ts";
import { logout } from "./logout.ts";
import { session } from "./session.ts";
import { python } from "./python.ts";
import { search } from "./search.ts";
import { user } from "./user.ts";
import { exploreCommand } from "./explore.ts";
import { notifications } from "./notifications.ts";
import { profile } from "./profile.ts";

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
  account: {
    description: "show details for the active Scratch account",
    handler: async () => user({}),
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
    ],
    handler: exploreCommand,
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

  logout: {
    description: "logout from Scratch",
    handler: logout,
  },

  notifications: {
    description: "show Scratch notifications for the active account",
    aliases: ["messages"],
    options: [
      {
        name: "limit",
        type: "number",
        description: "maximum number of notifications",
        default: 10,
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

  profile: {
    command: "profile [section] [legacy-section]",
    description: "view a Scratch profile or browse its public lists",
    positionals: [
      {
        name: "section",
        type: "string",
        description: "profile section (default: about); former syntax also accepts a username here",
      },
      {
        name: "legacy-section",
        type: "string",
        description: "section when using the former profile <username> <section> syntax",
      },
    ],
    options: [
      {
        name: "user",
        alias: "u",
        type: "string",
        description: "Scratch username (default: logged-in account)",
      },
      {
        name: "list",
        type: "boolean",
        description: "list available profile sections without loading a profile",
      },
      {
        name: "limit",
        type: "number",
        description: "maximum number of results (not for comments)",
      },
      {
        name: "offset",
        type: "number",
        description: "number of results to skip (not for comments)",
      },
      {
        name: "page",
        type: "number",
        description: "comment page number (comments only)",
      },
    ],
    handler: profile,
  },

  search: {
    command: "search <type> <query>",
    description: "search Scratch projects",
    positionals: [
      {
        name: "type",
        type: "string",
        description: "type of resource to search",
        choices: ["project"],
      },
      {
        name: "query",
        type: "string",
        description: "search query",
      },
    ],
    options: [
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
    handler: search,
  },

  user: {
    description: "show Scratch user information",
    aliases: ["u"],
    options: [
      {
        name: "user",
        alias: "u",
        type: "string",
        description: "show information for a specific user",
      },
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
