import { fail } from "../errors.ts";
import { runDangerousManagement, runManagement } from "../python/management.ts";
import { saveConfig } from "../config.ts";
import { readHiddenInput } from "./login.ts";

export const ACCOUNT_ACTIONS = [
  "edit-profile", "settings", "scratcher-status", "become-scratcher",
  "change-email", "delete-account", "change-password",
] as const;

export type AccountArguments = {
  action?: string;
  about?: string;
  workingOn?: string;
  featuredProject?: number;
  country?: string;
  state?: string;
  catEars?: "on" | "off";
  email?: string;
  deleteProjects?: boolean;
  comments?: "on" | "off";
};

async function passwordPayload(): Promise<Record<string, unknown> | undefined> {
  try {
    const password = await readHiddenInput("Scratch password: ");
    if (!password) {
      fail("Password must not be empty.");
      return undefined;
    }
    return { password };
  } catch {
    fail("Could not read the password securely.");
    return undefined;
  }
}

async function passwordChangePayload(): Promise<Record<string, unknown> | undefined> {
  try {
    const oldPassword = await readHiddenInput("Current Scratch password: ");
    const newPassword = await readHiddenInput("New Scratch password: ");
    const confirmation = await readHiddenInput("Repeat new password: ");
    if (!oldPassword || newPassword.length < 6 || newPassword.length > 128
      || newPassword !== confirmation || newPassword === oldPassword) {
      fail("Provide the current password and a matching new password (6–128 characters, different from the current one).");
      return undefined;
    }
    return { old_password: oldPassword, new_password: newPassword };
  } catch {
    fail("Could not read the passwords securely.");
    return undefined;
  }
}

export async function account(argv: AccountArguments): Promise<void> {
  if (argv.comments !== undefined && argv.action !== "settings") {
    fail("--comments is available only for account settings.");
    return;
  }
  if (!argv.action) {
    fail("An account action is required. Use `scc user` to view the active user.");
    return;
  }
  if (!ACCOUNT_ACTIONS.includes(argv.action as typeof ACCOUNT_ACTIONS[number])) {
    fail(`Account action must be one of: ${ACCOUNT_ACTIONS.join(", ")}.`);
    return;
  }

  if (argv.action === "edit-profile") {
    if (argv.country !== undefined || argv.state !== undefined || argv.catEars !== undefined
      || argv.email !== undefined || argv.deleteProjects !== undefined) {
      fail("Account setting options cannot be used with edit-profile.");
      return;
    }
    if (argv.featuredProject !== undefined
      && (!Number.isSafeInteger(argv.featuredProject) || argv.featuredProject < 1)) {
      fail("Featured project ID must be a positive integer.");
      return;
    }
    if (argv.about === undefined && argv.workingOn === undefined
      && argv.featuredProject === undefined) {
      fail("Provide --about, --working-on, or --featured-project.");
      return;
    }
    const changes = [
      argv.about !== undefined ? `About me: ${argv.about}` : undefined,
      argv.workingOn !== undefined ? `What I'm working on: ${argv.workingOn}` : undefined,
      argv.featuredProject !== undefined
        ? `Featured project: ${argv.featuredProject}` : undefined,
    ].filter((value): value is string => value !== undefined);
    await runDangerousManagement({
      entity: "account",
      action: "edit-profile",
      payload: {
        bio: argv.about,
        status: argv.workingOn,
        featured_project_id: argv.featuredProject,
      },
    }, (activeAccount) => [
      `Account: ${activeAccount}`,
      ...changes,
      "This changes your public Scratch profile.",
    ].join("\n"));
    return;
  }

  if (argv.action === "settings") {
    if (argv.about !== undefined || argv.workingOn !== undefined
      || argv.featuredProject !== undefined || argv.email !== undefined
      || argv.deleteProjects !== undefined) {
      fail("Only account setting options can be used with settings.");
      return;
    }
    const country = argv.country?.trim();
    const state = argv.state?.trim();
    if (argv.country !== undefined && !country) {
      fail("Country must not be empty.");
      return;
    }
    if (argv.state !== undefined && !state) {
      fail("State must not be empty.");
      return;
    }
    if (country === undefined && state === undefined && argv.catEars === undefined && argv.comments === undefined) {
      fail("Provide --country, --state, --cat-ears, or --comments.");
      return;
    }
    if (argv.comments !== undefined && (!["on", "off"].includes(argv.comments)
      || country !== undefined || state !== undefined || argv.catEars !== undefined)) {
      fail("Use --comments on|off without other account settings.");
      return;
    }
    const changes = [
      country !== undefined ? `Country: ${country}` : undefined,
      state !== undefined ? `State: ${state}` : undefined,
      argv.catEars !== undefined ? `Cat ears: ${argv.catEars}` : undefined,
      argv.comments !== undefined ? `Profile comments: ${argv.comments}` : undefined,
    ].filter((value): value is string => value !== undefined);
    await runDangerousManagement({
      entity: "account",
      action: "settings",
      payload: {
        country,
        state,
        cat_ears: argv.catEars === undefined ? undefined : argv.catEars === "on",
        comments: argv.comments === undefined ? undefined : argv.comments === "on",
      },
    }, (activeAccount) => [
      `Account: ${activeAccount}`,
      ...changes,
      "This changes your Scratch account settings.",
    ].join("\n"));
    return;
  }

  const hasUnrelatedOptions = argv.about !== undefined || argv.workingOn !== undefined
    || argv.featuredProject !== undefined || argv.country !== undefined
    || argv.state !== undefined || argv.catEars !== undefined;
  if (hasUnrelatedOptions) {
    fail("These options are not available for this account action.");
    return;
  }
  if (argv.action === "scratcher-status") {
    if (argv.email !== undefined || argv.deleteProjects !== undefined) {
      fail("Scratcher status does not accept options.");
      return;
    }
    await runManagement({ entity: "account", action: "scratcher-status" });
    return;
  }
  if (argv.action === "become-scratcher") {
    if (argv.email !== undefined || argv.deleteProjects !== undefined) {
      fail("Scratcher promotion does not accept options.");
      return;
    }
    await runDangerousManagement(
      { entity: "account", action: "become-scratcher" },
      (activeAccount) => `Account: ${activeAccount}\nAction: accept the Scratcher invitation`,
    );
    return;
  }
  if (argv.action === "change-email") {
    const email = argv.email?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || argv.deleteProjects !== undefined) {
      fail("Provide a valid email address with --email.");
      return;
    }
    await runDangerousManagement(
      { entity: "account", action: "change-email", payload: { email } },
      (activeAccount) => `Account: ${activeAccount}\nNew email address: ${email}`,
      undefined,
      { extraPayload: passwordPayload },
    );
    return;
  }
  if (argv.action === "change-password") {
    if (argv.email !== undefined || argv.deleteProjects !== undefined) {
      fail("Password change does not accept options.");
      return;
    }
    const changed = await runDangerousManagement(
      { entity: "account", action: "change-password" },
      (activeAccount) => `Account: ${activeAccount}\nAction: change the Scratch password; local login will be cleared`,
      undefined,
      {
        expectedAnswer: (activeAccount) => `change-password ${activeAccount}`,
        extraPayload: passwordChangePayload,
      },
    );
    if (changed) await saveConfig({});
    return;
  }
  if (argv.email !== undefined) {
    fail("--email is available only for change-email.");
    return;
  }
  const deleted = await runDangerousManagement(
    {
      entity: "account",
      action: "delete-account",
      payload: { delete_projects: argv.deleteProjects ?? false },
    },
    (activeAccount) => [
      `Account: ${activeAccount}`,
      `Delete projects: ${argv.deleteProjects ? "Yes" : "No"}`,
      "Action: request account deletion",
    ].join("\n"),
    undefined,
    {
      expectedAnswer: (activeAccount) => `delete ${activeAccount}`,
      extraPayload: passwordPayload,
    },
  );
  if (deleted) await saveConfig({});
}
