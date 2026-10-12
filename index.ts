#!/usr/bin/env bun

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { commands } from "./src/commands/index.ts";

const packageJson = await Bun.file(
  new URL("./package.json", import.meta.url),
).json();

const args = hideBin(process.argv);

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
  .fail((message, error, command) => {
    command.showHelp("log");
    console.log();
    const detail = message || error?.message || "Unknown error";
    console.error(`Error: ${explainMissingPositionals(detail)}`);
    process.exitCode = 1;
  });

cli.command(
  "help",
  "output usage information",
  () => {},
  () => {
    cli.showHelp();
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

await cli.parseAsync();
