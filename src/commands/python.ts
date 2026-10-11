import {
  findPython,
  venvDir,
} from "../python/index.ts";

import { ensureVenv } from "../python/venv.ts";
import { ensureScapi } from "../python/scapi.ts";
import { fail } from "../errors.ts";

export async function python() {
  const command = findPython();

  if (!command) {
    fail("Python was not found.");
    return;
  }

  const result = Bun.spawnSync([
    command,
    "--version",
  ]);

  const version =
    new TextDecoder()
      .decode(result.stdout)
      .trim();

  console.log(`Python found: ${version}`);

  const venvSuccess =
    await ensureVenv();

  if (!venvSuccess) {
    fail("Failed to create Python virtual environment.");
    return;
  }

  console.log(
    `Virtual environment: ${venvDir}`,
  );

  const scapiSuccess =
    await ensureScapi();

  if (!scapiSuccess) {
    fail("Failed to install or update Scapi.");
    return;
  }

  console.log("Scapi is ready.");
}
