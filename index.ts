#!/usr/bin/env bun

import { commands } from "./src/commands/index.ts";
import {
  showHelp,
  showCommandHelp,
} from "./src/help/index.ts";

const packageJson = await Bun.file(
  new URL("./package.json", import.meta.url),
).json();

const args = process.argv.slice(2);

const isHelp = (value?: string) =>
  value === "-h" || value === "--help";

if (args.length === 0) {
  showHelp(commands);
  process.exit(0);
}

if (isHelp(args[0])) {
  showHelp(commands);
  process.exit(0);
}

if (
  args[0] === "-v" ||
  args[0] === "--version"
) {
  console.log(packageJson.version);
  process.exit(0);
}

const commandName = args[0];
const command = commands[commandName];

if (!command) {
  console.error(
    `Invalid command: ${commandName}`,
  );
  console.error(
    "Use `scc --help` for a list of available commands.",
  );
  process.exit(1);
}

if (isHelp(args[1])) {
  showCommandHelp(command);
  process.exit(0);
}

await command.handler();