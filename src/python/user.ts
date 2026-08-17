import { loadConfig } from "../config.ts";
import { venvDir } from "./index.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("./user.py", import.meta.url);

export async function getLoggedInUser() {
  const config = await loadConfig();

  if (!config.scratchsessionsid) {
    console.error("No active session.");
    return;
  }

  const result = Bun.spawnSync([
    pythonPath,
    scriptPath.pathname,
    config.scratchsessionsid,
  ], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = new TextDecoder()
    .decode(result.stdout)
    .trim();

  const stderr = new TextDecoder()
    .decode(result.stderr)
    .trim();

  if (result.exitCode !== 0) {
    if (stderr) {
      console.error(stderr);
    } else {
      console.error("Failed to get logged-in user.");
    }

    return;
  }

  try {
    const user = JSON.parse(stdout);

    console.log(`Username: ${user.username}`);
    console.log(`User ID: ${user.user.id}`);
  } catch {
    console.error("Failed to parse Scapi response.");
    console.error(stdout);
  }
}