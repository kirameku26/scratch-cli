export type Option = {
  flags: string;
  description: string;
};

export type Section = {
  title: string;
  lines: string[];
};

export type Command = {
  usage: string;
  description: string;
  options?: Option[];
  sections?: Section[];
  handler: (argv: any) => Promise<void>;
};

function output(text: string) {
  process.stdout.write(
    text.trimStart().trimEnd() + "\n",
  );
}

export function showHelp(
  commands: Record<string, Command>,
) {
  let outputText = `SCC - Scratch CLI

Usage: scc [options] <command>

Options:
  -v, --version  output the version number
  -h, --help     output usage information

Commands:
`;

  const entries = Object.entries(commands)
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [name, command] of entries) {
    outputText += `  ${name.padEnd(14)}${command.description}\n`;
  }

  outputText += `
To get detailed information, use \`scc <command> -h\`
`;

  output(outputText);
}

export function showCommandHelp(
  command: Command,
) {
  let outputText = `Usage: ${command.usage}

${command.description}
`;

  const options = [
    ...(command.options ?? []),
    {
      flags: "-h, --help",
      description: "output usage information",
    },
  ];

  if (options.length > 0) {
    outputText += `
Options:
`;

    const flagWidth = Math.max(
      ...options.map((option) => option.flags.length),
    ) + 2;

    for (const option of options) {
      outputText += `  ${option.flags.padEnd(flagWidth)}${option.description}\n`;
    }
  }

  for (const section of command.sections ?? []) {
    outputText += `
${section.title}:
`;

    for (const line of section.lines) {
      outputText += `  ${line}\n`;
    }
  }

  output(outputText);
}