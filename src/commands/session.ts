import { loadConfig } from "../config";
import { fail } from "../errors.ts";

export async function session() {
  const config =
    await loadConfig();

  if (!config.scratchsessionsid) {
    console.log(
      "Not logged in.",
    );
    return;
  }

  console.log(
    "Checking authentication...",
  );

  try {
    const res = await fetch(
      "https://scratch.mit.edu/session/",
      {
        method: "GET",

        headers: {
          "scratchsessionsid":
            config.scratchsessionsid,

          "X-Requested-With":
            "XMLHttpRequest",

          "Referer":
            "https://scratch.mit.edu/",

          "Cookie": [
            `scratchsessionsid=${config.scratchsessionsid}`,

            config.scratchcsrftoken
              ? `scratchcsrftoken=${config.scratchcsrftoken}`
              : "",
          ]
            .filter(Boolean)
            .join("; "),
        },
      },
    );

    if (!res.ok) {
      fail(
        `Failed to check status: ${res.status}`,
      );
      return;
    }

    const result: unknown =
      await res.json();

    const user = result
      && typeof result === "object"
      && "user" in result
      && result.user
      && typeof result.user === "object"
      ? result.user as { username?: unknown }
      : undefined;

    if (user) {
      console.log("Logged in.");
      console.log(
        `Username: ${typeof user.username === "string" ? user.username : "Unknown"}`,
      );
    } else {
      console.log("Not logged in.");
    }
  } catch {
    fail("Failed to check status because Scratch could not be reached.");
  }
}
