import {
  loadConfig,
  saveConfig,
} from "../config";

function getCookie(
  headers: Headers,
  name: string,
): string | undefined {
  for (const cookie of headers.getSetCookie()) {
    const match = cookie.match(
      new RegExp(`${name}=([^;]*)`),
    );

    if (match) {
      return match[1].replace(/^"(.*)"$/, "$1");
    }
  }

  return undefined;
}

async function isLoggedIn(): Promise<boolean> {
  const config = await loadConfig();

  if (!config.scratchsessionsid) {
    return false;
  }

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
      return false;
    }

    const session = await res.json();

    return Boolean(session?.user);
  } catch {
    return false;
  }
}

async function readInput(
  message: string,
): Promise<string> {
  process.stdout.write(message);

  const reader =
    Bun.stdin.stream().getReader();

  try {
    const { value } = await reader.read();

    return new TextDecoder()
      .decode(value)
      .trim();
  } finally {
    reader.releaseLock();
  }
}

async function readHiddenInput(
  message: string,
): Promise<string> {
  process.stdout.write(message);

  Bun.spawnSync([
    "bash",
    "-c",
    "stty -echo",
  ]);

  const reader =
    Bun.stdin.stream().getReader();

  try {
    const { value } = await reader.read();

    return new TextDecoder()
      .decode(value)
      .trim();
  } finally {
    reader.releaseLock();

    Bun.spawnSync([
      "bash",
      "-c",
      "stty echo",
    ]);

    process.stdout.write("\n");
  }
}

export async function login(argv: {
  username?: string;
  password?: string;
} = {}) {
  // すでにログインしているか確認
  if (await isLoggedIn()) {
    console.log("Already logged in.");
    return;
  }

  let username = argv.username;
  let password = argv.password;

  if (!username) {
    username =
      await readInput("Username: ");
  }

  if (!password) {
    password =
      await readHiddenInput("Password: ");
  }

  console.log("Logging in...");

  const csrfRes = await fetch(
    "https://scratch.mit.edu/csrf_token/",
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

  if (!csrfRes.ok) {
    console.error(
      `Failed to get CSRF token: ${csrfRes.status}`,
    );
    return;
  }

  const scratchcsrftoken =
    getCookie(
      csrfRes.headers,
      "scratchcsrftoken",
    );

  if (!scratchcsrftoken) {
    console.error(
      "Failed to get scratchcsrftoken.",
    );
    return;
  }

  const loginRes = await fetch(
    "https://scratch.mit.edu/accounts/login/",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        "X-CSRFToken":
          scratchcsrftoken,

        "X-Requested-With":
          "XMLHttpRequest",

        "Origin":
          "https://scratch.mit.edu",

        "Referer":
          "https://scratch.mit.edu/",

        "Cookie":
          `scratchcsrftoken=${scratchcsrftoken}; scratchlanguage=en`,
      },

      body: JSON.stringify({
        username,
        password,
        useMessages: true,
      }),
    },
  );

  if (!loginRes.ok) {
    let message = "";

    try {
      const body: unknown = await loginRes.json();

      if (Array.isArray(body)) {
        const messages = body
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return undefined;
            }

            const msg = (entry as { msg?: unknown }).msg;
            return typeof msg === "string" ? msg.trim() : undefined;
          })
          .filter((msg): msg is string => Boolean(msg));

        message = [...new Set(messages)].join(" ");
      } else if (body && typeof body === "object") {
        const detail = (body as { detail?: unknown }).detail;
        message = typeof detail === "string" ? detail.trim() : "";
      }
    } catch {
      // Keep the status as the fallback when the response is not JSON.
    }

    console.error(
      message
        ? `Login failed: ${message}`
        : `Login failed: ${loginRes.status}`,
    );
    return;
  }

  const loginResult =
    await loginRes.json();

  const xToken =
    loginResult?.[0]?.token;

  if (!xToken) {
    console.error(
      "Failed to get x-token.",
    );
    return;
  }

  const scratchsessionsid =
    getCookie(
      loginRes.headers,
      "scratchsessionsid",
    );

  if (!scratchsessionsid) {
    console.error(
      "Failed to get scratchsessionsid.",
    );
    return;
  }

  const config =
    await loadConfig();

  config.scratchcsrftoken =
    scratchcsrftoken;

  config.scratchsessionsid =
    scratchsessionsid;

  config["x-token"] =
    xToken;

  await saveConfig(config);

  console.log(
    "Login successful.",
  );
}
