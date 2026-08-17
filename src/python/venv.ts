import { mkdir } from "node:fs/promises";
import {
  findPython,
  pythonDir,
  venvDir,
} from "./index.ts";

export async function ensureVenv(): Promise<boolean> {
  const python = findPython();

  if (!python) {
    return false;
  }

  await mkdir(pythonDir, {
    recursive: true,
  });

  const result = Bun.spawnSync([
    python,
    "-m",
    "venv",
    venvDir,
  ]);

  return result.exitCode === 0;
}