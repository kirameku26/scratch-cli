import { loadConfig } from "../config";

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
    console.error(
      `Failed to check status: ${res.status}`,
    );
    return;
  }

  const result =
    await res.json();

  if (result?.user) {
    console.log("Logged in.");
    console.log(
      `Username: ${result.user.username}`,
    );
  } else {
    console.log(
      "Not logged in.",
    );
  }
}