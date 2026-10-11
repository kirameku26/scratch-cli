import { login } from "./login.ts";
import { logout } from "./logout.ts";
import { session } from "./session.ts";
import { python } from "./python.ts";
import { search } from "./search.ts";
import { user } from "./user.ts";

export type Option = {
  name: string;
  alias?: string;
  type: "string" | "boolean" | "number";
  description: string;
  default?: string | boolean | number;
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

  session: {
    description: "check login status",
    aliases: ["s"],
    handler: session,
  },

  python: {
    description: "check Python installation",
    handler: python,
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
