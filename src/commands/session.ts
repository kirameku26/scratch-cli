import { loadConfig } from "../config";
import { fail } from "../errors.ts";
import { checkSession, type ScratchFetch } from "../scratch-session.ts";

export async function session() {
  await sessionWithDependencies({ loadConfig, fetch, fail });
}

export async function sessionWithDependencies(dependencies: {
  loadConfig: typeof loadConfig; fetch: ScratchFetch; fail: typeof fail;
}) {
  const config = await dependencies.loadConfig();

  if (!config.scratchsessionsid) {
    console.log(
      "Not logged in.",
    );
    return;
  }

  console.log(
    "Checking authentication...",
  );

  const status = await checkSession(config, dependencies.fetch);
  if (status.state === "error") dependencies.fail(status.message);
  else if (status.state === "authenticated") {
    console.log("Logged in.");
    console.log(`Username: ${status.username}`);
  } else console.log("Not logged in.");
}
