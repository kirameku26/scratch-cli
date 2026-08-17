import { homedir } from "node:os";
import { join } from "node:path";

export const pythonDir = join(
  homedir(),
  ".config",
  "scc",
  "python",
);

export const venvDir = join(
  pythonDir,
  ".venv",
);

export function findPython(): string | null {
  const candidates = [
    "python3",
    "python",
  ];

  for (const command of candidates) {
    const result = Bun.spawnSync([
      command,
      "--version",
    ]);

    if (result.exitCode === 0) {
      return command;
    }
  }

  return null;
}