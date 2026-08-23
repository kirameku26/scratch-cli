#!/usr/bin/env bun

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { commands } from "./src/commands/index.ts";

const packageJson = await Bun.file(
  new URL("./package.json", import.meta.url),
).json();

const args = hideBin(process.argv);

const cli = yargs(
  args.length === 0 ? ["--help"] : args,
)
  .scriptName("scc")
  .locale("en")
  .version(packageJson.version)
  .alias("v", "version")
  .help("help", "output usage information")
  .alias("h", "help");

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
    command: [name, ...(command.aliases ?? [])],

    describe: command.description,

    builder: (yargs) => {
      for (const option of command.options ?? []) {
        yargs.option(option.name, {
          alias: option.alias,
          type: option.type,
          description: option.description,
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