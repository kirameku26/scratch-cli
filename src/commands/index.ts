import { login } from "./login.ts";
import { logout } from "./logout.ts";
import { session } from "./session.ts";
import { python } from "./python.ts";
import { showHelp } from "../help/index.ts";
import { user } from "./user.ts";

export const commands = {
  help: {
    usage: "scc help",
    description: "display help information",
    options: [],
    handler: async () => {
      showHelp(commands);
    },
  },

  login: {
    usage: "scc login [options]",
    description: "login to Scratch",
    options: [
      {
        flags: "--username <username>",
        description: "Scratch username",
      },
      {
        flags: "--password <password>",
        description: "Scratch password",
      },
    ],
    handler: login,
  },

  logout: {
    usage: "scc logout",
    description: "logout from Scratch",
    options: [],
    handler: logout,
  },

  session: {
    usage: "scc session",
    description: "check login status",
    options: [],
    handler: session,
  },

  python: {
    usage: "scc python",
    description: "check Python installation",
    options: [],
    handler: python,
  },

  user: {
    usage: "scc user",
    description: "show the logged-in Scratch user",
    options: [],
    handler: user,
  },

  version: {
    usage: "scc version",
    description: "output the version number",
    options: [],
    handler: async () => {
      const packageJson = await Bun.file(
        new URL("../../package.json", import.meta.url),
      ).json();

      console.log(packageJson.version);
    },
  },
} as const;