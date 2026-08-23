import { login } from "./login.ts";
import { logout } from "./logout.ts";
import { session } from "./session.ts";
import { python } from "./python.ts";
import { user } from "./user.ts";

export type Option = {
  name: string;
  alias?: string;
  type: "string" | "boolean";
  description: string;
};

export type Command = {
  description: string;
  aliases?: string[];
  options?: Option[];
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
      {
        name: "password",
        type: "string",
        description: "Scratch password",
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
};