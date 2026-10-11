import {
  loadConfig,
  saveConfig,
} from "../config";
import { fail } from "../errors.ts";

type LogoutDependencies = {
  loadConfig: typeof loadConfig;
  saveConfig: typeof saveConfig;
  fetch: typeof fetch;
  fail: typeof fail;
};

const defaultDependencies: LogoutDependencies = {
  loadConfig,
  saveConfig,
  fetch,
  fail,
};

export async function logout() {
  await logoutWithDependencies(defaultDependencies);
}

export async function logoutWithDependencies(
  dependencies: LogoutDependencies,
) {
  const config =
    await dependencies.loadConfig();

  if (!config.scratchsessionsid) {
    console.log(
      "No active session.",
    );
    return;
  }

  const scratchsessionsid =
    config.scratchsessionsid;

  const scratchcsrftoken =
    config.scratchcsrftoken;

  console.log(
    "Logging out...",
  );

  try {
    const res = await dependencies.fetch(
      "https://scratch.mit.edu/accounts/logout/",
      {
        method: "POST",

        headers: {
          "x-csrftoken":
            scratchcsrftoken ?? "",

          "X-Requested-With":
            "XMLHttpRequest",

          "Referer":
            "https://scratch.mit.edu/",

          "Cookie": [
            `scratchsessionsid=${scratchsessionsid}`,

            scratchcsrftoken
              ? `scratchcsrftoken=${scratchcsrftoken}`
              : "",
          ]
            .filter(Boolean)
            .join("; "),
        },
      },
    );

    if (!res.ok) {
      dependencies.fail(
        `Logout failed: ${res.status}`,
      );
      return;
    }

    const sessionRes =
      await dependencies.fetch(
        "https://scratch.mit.edu/session/",
        {
          method: "GET",

          headers: {
            "scratchsessionsid":
              scratchsessionsid,

            "X-Requested-With":
              "XMLHttpRequest",

            "Referer":
              "https://scratch.mit.edu/",

            "Cookie": [
              `scratchsessionsid=${scratchsessionsid}`,

              scratchcsrftoken
                ? `scratchcsrftoken=${scratchcsrftoken}`
                : "",
            ]
              .filter(Boolean)
              .join("; "),
          },
        },
      );

    if (!sessionRes.ok) {
      dependencies.fail(
        `Failed to verify logout: ${sessionRes.status}`,
      );
      return;
    }

    const session: unknown =
      await sessionRes.json();

    if (
      session
      && typeof session === "object"
      && "user" in session
      && session.user
    ) {
      dependencies.fail("Logout verification failed.");
      return;
    }

    delete config.scratchcsrftoken;
    delete config.scratchsessionsid;
    delete config["x-token"];

    await dependencies.saveConfig(config);

    console.log("Logged out successfully.");
  } catch {
    dependencies.fail("Logout failed because Scratch could not be reached.");
  }
}
