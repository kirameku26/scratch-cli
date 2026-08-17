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

function getArgument(
  args: string[],
  name: string,
): string | undefined {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
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

export async function login(
  args: string[] = [],
) {
  // すでにログインしているか確認
  if (await isLoggedIn()) {
    console.log("Already logged in.");
    return;
  }

  let username =
    getArgument(args, "--username");

  let password =
    getArgument(args, "--password");

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

        "Referer":
          "https://scratch.mit.edu/",

        "Cookie":
          `scratchcsrftoken=${scratchcsrftoken}`,
      },

      body: JSON.stringify({
        username,
        password,
      }),
    },
  );

  if (!loginRes.ok) {
    console.error(
      `Login failed: ${loginRes.status}`,
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