import { loadConfig } from "../config.ts";
import { venvDir } from "./index.ts";
import { fail } from "../errors.ts";
import { spawnScratchPython } from "./process.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("../python/user.py", import.meta.url);

function cleanText(value: unknown): string | null {
  return typeof value === "string"
    ? value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim()
    : null;
}

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
  configPath?: string,
) {
  const config = await loadConfig(configPath);

  if (!config.scratchsessionsid) {
    fail("No active session. Run `scc login` first.");
    return;
  }

  const processInput = buildUserProcess(
    config.scratchsessionsid,
    argv.user,
  );

  const result = spawnScratchPython(processInput.args, { stdin: processInput.stdin });
  if (!result) return;

  const stdout = new TextDecoder()
    .decode(result.stdout)
    .trim();

  if (result.exitCode !== 0) {
    if (stdout) {
      try {
        const error = JSON.parse(stdout);

        if (error && typeof error === "object" && typeof error.error === "string") {
          fail(error.error);
          return;
        }
      } catch {
        // stdout is not JSON
      }
    }

    fail("Failed to get user information. Check the network and Python setup.");

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

    console.log(`Following: ${user.following === true ? "Yes" : user.following === false ? "No" : "Unknown"}`);

    console.log("");
    const featured = user.featured_project;
    console.log(`${cleanText(featured?.label) || "Featured Project"}:`);
    if (featured && typeof featured === "object") {
      console.log(cleanText(featured.title) || `Project #${featured.id}`);
      console.log(`URL: ${cleanText(featured.url) ?? "None"}`);
    } else {
      console.log("None");
    }

    console.log("");
    console.log("Recent activity:");
    const activities = Array.isArray(user.activities) ? user.activities : [];
    if (activities.length === 0) {
      console.log("No recent activity found.");
    }
    for (const activity of activities) {
      console.log(`${activity.actor ?? user.username} ${String(activity.action ?? "activity").replace(/_/g, " ")}`);
      if (activity.target_title) console.log(`   About: ${activity.target_title}`);
      if (activity.when) console.log(`   When: ${activity.when}`);
      if (activity.target_url) console.log(`   URL: ${activity.target_url}`);
    }
  } catch {
    fail("Failed to parse Scapi response.");
  }
}
