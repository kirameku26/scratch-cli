import { loadConfig } from "../config.ts";
import { venvDir } from "./index.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("../python/user.py", import.meta.url);

export async function getLoggedInUser(
  argv: {
    user?: string;
  } = {},
) {
  const config = await loadConfig();

  if (!config.scratchsessionsid) {
    console.error("No active session.");
    return;
  }

  const pythonArgs = [
    pythonPath,
    scriptPath.pathname,
    config.scratchsessionsid,
  ];

  if (argv.user) {
    pythonArgs.push("--user", argv.user);
  }

  const result = Bun.spawnSync(pythonArgs, {
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
      console.error("Failed to get user information.");
    }

    return;
  }

  try {
    const user = JSON.parse(stdout);

    console.log(
      JSON.stringify(user, null, 2),
    );
  } catch {
    console.error("Failed to parse Scapi response.");
    console.error(stdout);
  }
}