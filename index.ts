#!/usr/bin/env bun

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { commands } from "./src/commands/index.ts";
import { commandGuide, helpArguments, mainHelp } from "./src/commands/help.ts";
import { actionHelp, actionHelpTarget } from "./src/commands/action-help.ts";

const packageJson = await Bun.file(
  new URL("./package.json", import.meta.url),
).json();

const args = helpArguments(hideBin(process.argv), commands);
const isMainHelp = args.length === 0 || (args.length === 1 && ["help", "--help", "-h"].includes(args[0]!));
const actionTarget = actionHelpTarget(args, commands);

function explainMissingPositionals(message: string): string {
  const match = /^Not enough non-option arguments: got (\d+), need at least (\d+)$/.exec(message);
  const positionals = commands[args[0] ?? ""]?.positionals;

  if (!match || !positionals || Number(match[2]) !== positionals.length) {
    return message;
  }

  const missing = positionals.slice(Number(match[1]));

  if (missing.length === 0) {
    return message;
  }

  const names = missing.map((positional) => {
    const hint = positional.choices?.length
      ? `choose ${positional.choices.map((choice) => `"${choice}"`).join(" or ")}`
      : positional.description;

    return `<${positional.name}> (${hint})`;
  });

  return `Missing required argument${missing.length === 1 ? "" : "s"}: ${names.join(", ")}.`;
}

const cli = yargs(
  args.length === 0 ? ["--help"] : args,
)
  .scriptName("scc")
  .locale("en")
  .strict()
  .version(packageJson.version)
  .alias("v", "version")
  .help("help", "output usage information")
  .alias("h", "help")
  .wrap(100)
  .fail((message, error, command) => {
    if (Object.entries(commands).some(([name, command]) => name === args[0] || command.aliases?.includes(args[0]!))) {
      command.showHelp("log");
    } else {
      console.log(mainHelp(commands));
    }
    console.log();
    const detail = message || error?.message || "Unknown error";
    console.error(`Error: ${explainMissingPositionals(detail)}`);
    process.exitCode = 1;
  });

cli.command(
  "help [command] [action]",
  "output usage information",
  (yargs) => yargs.positional("command", {
    type: "string", description: "command to explain",
    choices: Object.entries(commands).flatMap(([name, command]) => [name, ...(command.aliases ?? [])]),
  }).positional("action", { type: "string", description: "action to explain" }),
  () => {
    console.log(mainHelp(commands));
  },
);

const sortedCommands = Object.entries(commands).sort(
  ([a], [b]) => a.localeCompare(b),
);

for (const [name, command] of sortedCommands) {
  cli.command({
    command: [command.command ?? name, ...(command.aliases ?? [])],

    describe: command.description,

    builder: (yargs) => {
      const guide = commandGuide(name);
      if (guide) yargs.epilog(guide);
      for (const positional of command.positionals ?? []) {
        yargs.positional(positional.name, {
          type: positional.type,
          description: positional.description,
          choices: positional.choices,
        });
      }

      for (const option of command.options ?? []) {
        yargs.option(option.name, {
          alias: option.alias,
          type: option.type,
          description: option.description,
          default: option.default,
          choices: option.choices,
        });
      }

      return yargs;
    },

    handler: async (argv) => {
      await command.handler(argv);
    },
  });
}

if (actionTarget?.error) {
  console.log(commandGuide(actionTarget.command));
  console.error(`Error: ${actionTarget.error}`);
  process.exitCode = 1;
} else if (actionTarget) console.log(actionHelp(actionTarget, commands));
else if (isMainHelp) console.log(mainHelp(commands));
else await cli.parseAsync();
