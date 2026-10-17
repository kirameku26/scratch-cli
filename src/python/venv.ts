import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { confirmAction } from "../confirmation.ts";
import { fail } from "../errors.ts";
import {
  findPython,
  pythonDir,
  venvDir,
} from "./index.ts";

export async function ensureVenv(): Promise<boolean> {
  if (existsSync(venvDir)) {
    const executable = process.platform === "win32"
      ? join(venvDir, "Scripts", "python.exe") : join(venvDir, "bin", "python");
    if (existsSync(executable)) return true;
    fail("The existing Python environment is incomplete. No files were changed; check the environment before trying setup again.");
    return false;
  }
  const python = findPython();

  if (!python) {
    return false;
  }

  if (!await confirmAction(`Python environment: ${venvDir}\nAction: create a dedicated Python virtual environment`)) return false;

  await mkdir(pythonDir, {
    recursive: true,
  });

  const result = Bun.spawnSync([
    python,
    "-m",
    "venv",
    venvDir,
  ], { timeout: 120_000 });

  return result.exitCode === 0;
}
