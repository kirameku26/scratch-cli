import {
  loadConfig,
  saveConfig,
} from "../config";

export async function logout() {
  const config =
    await loadConfig();

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

  const res = await fetch(
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
    console.error(
      `Logout failed: ${res.status}`,
    );
    return;
  }

  const sessionRes =
    await fetch(
      "https://scratch.mit.edu/session/",
      {
        method: "GET",

        headers: {
          "X-Requested-With":
            "XMLHttpRequest",

          "Referer":
            "https://scratch.mit.edu/",
        },
      },
    );

  if (!sessionRes.ok) {
    console.error(
      `Failed to verify logout: ${sessionRes.status}`,
    );
    return;
  }

  const session =
    await sessionRes.json();

  if (session?.user) {
    console.error(
      "Logout verification failed.",
    );
    return;
  }

  delete config.scratchcsrftoken;
  delete config.scratchsessionsid;
  delete config["x-token"];

  await saveConfig(config);

  console.log(
    "Logged out successfully.",
  );
}