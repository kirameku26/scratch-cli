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
    try {
      const result = Bun.spawnSync([command, "--version"], { timeout: 15_000 });
      if (result.exitCode === 0) return command;
    } catch {
      // A missing executable must not prevent checking the next candidate.
    }
  }

  return null;
}
