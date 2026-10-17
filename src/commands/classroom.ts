import { fail } from "../errors.ts";
import { runDangerousManagement, runManagement } from "../python/management.ts";

export const CLASS_ACTIONS = [
  "list", "details", "create", "edit", "students", "studios", "create-studio",
] as const;

export type ClassArguments = {
  action: string;
  id?: number;
  title?: string;
  description?: string;
  status?: string;
  open?: "on" | "off";
  type?: "all" | "closed";
  page?: number;
};

export async function classroom(argv: ClassArguments): Promise<void> {
  if (!CLASS_ACTIONS.includes(argv.action as typeof CLASS_ACTIONS[number])) {
    fail(`Class action must be one of: ${CLASS_ACTIONS.join(", ")}.`);
    return;
  }
  const action = argv.action;
  const title = argv.title?.trim();
  if (argv.title !== undefined && (!title || title.length > 100)) {
    fail("Class or studio title must contain 1–100 characters.");
    return;
  }
  if ((argv.description !== undefined && argv.description.length > 5000)
    || (argv.status !== undefined && argv.status.length > 5000)) {
    fail("Description and status must be 5000 characters or fewer.");
    return;
  }
  if (action !== "list" && argv.type !== undefined) {
    fail("--type is available only for class list.");
    return;
  }
  if (argv.type !== undefined && argv.type !== "all" && argv.type !== "closed") {
    fail("Class list type must be all or closed.");
    return;
  }
  if (argv.open !== undefined && argv.open !== "on" && argv.open !== "off") {
    fail("--open must be on or off.");
    return;
  }
  if (action !== "list" && action !== "students" && action !== "studios"
    && argv.page !== undefined) {
    fail("--page is available only for class lists.");
    return;
  }
  if (argv.page !== undefined && (!Number.isSafeInteger(argv.page) || argv.page < 1)) {
    fail("Page must be a positive integer.");
    return;
  }
  if (!["create", "edit", "create-studio"].includes(action)
    && (argv.title !== undefined || argv.description !== undefined
      || argv.status !== undefined || argv.open !== undefined)) {
    fail("This class action does not accept edit options.");
    return;
  }
  if (["list", "create"].includes(action)) {
    if (argv.id !== undefined) {
      fail(`Class ${action} does not accept an ID.`);
      return;
    }
  } else if (!Number.isSafeInteger(argv.id) || argv.id! < 1) {
    fail("Class ID must be a positive integer.");
    return;
  }

  if (action === "list") {
    await runManagement({
      entity: "class", action: "list",
      payload: { type: argv.type ?? "all", page: argv.page ?? 1 },
    });
  } else if (action === "details") {
    await runManagement({ entity: "class", action: "details", payload: { class_id: argv.id } });
  } else if (action === "students" || action === "studios") {
    await runManagement({
      entity: "class", action,
      payload: { class_id: argv.id, page: argv.page ?? 1 },
    });
  } else if (action === "create") {
    if (!title || argv.open !== undefined) {
      fail("Class creation requires --title and does not accept --open.");
      return;
    }
    await runDangerousManagement({
      entity: "class", action: "create",
      payload: { title, description: argv.description, status: argv.status },
    }, (account) => `Account: ${account}\nAction: create class "${title}"`);
  } else if (action === "create-studio") {
    if (!title || argv.status !== undefined || argv.open !== undefined) {
      fail("Class studio creation requires --title and accepts only --description.");
      return;
    }
    await runDangerousManagement({
      entity: "class", action: "create-studio",
      payload: { class_id: argv.id, title, description: argv.description },
    }, (account) => `Account: ${account}\nClass: ${argv.id}\nAction: create class studio "${title}"`);
  } else {
    if (title === undefined && argv.description === undefined
      && argv.status === undefined && argv.open === undefined) {
      fail("Provide --title, --description, --status, or --open.");
      return;
    }
    await runDangerousManagement({
      entity: "class", action: "edit",
      payload: {
        class_id: argv.id, title, description: argv.description,
        status: argv.status, open: argv.open === undefined ? undefined : argv.open === "on",
      },
    }, (account) => [
      `Account: ${account}`,
      `Class: ${argv.id}`,
      `Action: edit class${argv.open === "off" ? " and close it" : ""}`,
      title === undefined ? undefined : `Title: ${title}`,
      argv.description === undefined ? undefined : `Description: ${argv.description}`,
      argv.status === undefined ? undefined : `Status: ${argv.status}`,
    ].filter(Boolean).join("\n"), undefined, {
      expectedAnswer: argv.open === "off" ? () => `close class ${argv.id}` : undefined,
    });
  }
}
