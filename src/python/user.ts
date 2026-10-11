import { loadConfig } from "../config.ts";
import { venvDir } from "./index.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("../python/user.py", import.meta.url);

export async function getUser(
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
    if (stdout) {
      try {
        const error = JSON.parse(stdout);

        if (error.error) {
          console.error(error.error);
          return;
        }
      } catch {
        // stdout is not JSON
      }
    }

    if (stderr) {
      console.error(stderr);
    } else {
      console.error("Failed to get user information.");
    }

    return;
  }

  try {
    const user = JSON.parse(stdout);

    const labels: Record<string, string> = {
      username: "Username",
      id: "ID",
      profile_id: "Profile ID",
      icon_url: "Icon URL",
      country: "Country",
      joined_at: "Joined",
      comments_allowed: "Comments Allowed",
      exist: "Exist",
      is_scratcher: "Is Scratcher",
      classroom_id: "Classroom ID",
      scratchteam: "Is Scratchteam",
      membership_avatar_badge: "Membership Avatar Badge",
      membership_label: "Membership Label",
    };

    for (const [key, label] of Object.entries(labels)) {
      console.log(`${label}: ${user[key] ?? "None"}`);

      if (key === "classroom_id") {
        console.log("Bio:");
        if(user.bio !== ""){
          console.log(
            typeof user.bio === "string"
              ? user.bio.trim()
              : user.bio ?? "None",
          );
        }

        console.log("Status:");
        if(user.status !== ""){
          console.log(
            typeof user.status === "string"
              ? user.status.trim()
              : user.status ?? "None",
          );
        }
      }
    }
  } catch {
    console.error("Failed to parse Scapi response.");
    console.error(stdout);
  }
}