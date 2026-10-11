import { loadConfig } from "../config.ts";
import { venvDir } from "./index.ts";
import { fail } from "../errors.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("../python/user.py", import.meta.url);

export function buildUserProcess(
  sessionId: string,
  username?: string,
) {
  const args = [
    pythonPath,
    scriptPath.pathname,
  ];

  if (username) {
    args.push("--user", username);
  }

  return {
    args,
    stdin: new Blob([
      JSON.stringify({
        session_id: sessionId,
      }),
    ]),
  };
}

export async function getUser(
  argv: {
    user?: string;
  } = {},
) {
  const config = await loadConfig();

  if (!config.scratchsessionsid) {
    fail("No active session.");
    return;
  }

  const processInput = buildUserProcess(
    config.scratchsessionsid,
    argv.user,
  );

  const result = Bun.spawnSync(processInput.args, {
    stdin: processInput.stdin,
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
          fail(error.error);
          return;
        }
      } catch {
        // stdout is not JSON
      }
    }

    if (stderr) {
      fail(stderr);
    } else {
      fail("Failed to get user information.");
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
    fail("Failed to parse Scapi response.");
    console.error(stdout);
  }
}
