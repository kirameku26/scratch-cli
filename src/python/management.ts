import { loadConfig } from "../config.ts";
import { fail } from "../errors.ts";
import { venvDir } from "./index.ts";
import { spawnScratchPython } from "./process.ts";
import { confirmAction, requireInteractiveConfirmation } from "../confirmation.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("./management.py", import.meta.url);

export type ManagementArguments = {
  entity: "project" | "studio" | "account" | "user" | "class";
  action: "list" | "create" | "accept-invite" | "remix" | "share" | "unshare" | "trash"
    | "restore" | "edit" | "thumbnail" | "report" | "report-comment" | "add-project"
    | "delete-comment" | "remove-project" | "follow" | "unfollow" | "leave"
    | "invite" | "remove-curator" | "comments" | "managers" | "curators"
    | "search"
    | "promote" | "delete" | "identify" | "edit-profile" | "settings"
    | "clear-messages" | "become-scratcher" | "scratcher-status"
    | "change-email" | "delete-account" | "change-password" | "transfer"
    | "details" | "students" | "studios" | "create-studio" | "reactions" | "role";
  payload?: Record<string, unknown>;
};

export function buildManagementProcess(
  sessionId: string,
  args: ManagementArguments,
) {
  return {
    args: [pythonPath, scriptPath.pathname, args.entity, args.action],
    stdin: new Blob([JSON.stringify({
      session_id: sessionId,
      ...args.payload,
    })]),
  };
}

type ProjectItem = {
  id: number;
  title: string | null;
  shared: boolean | null;
  trashed: boolean | null;
  url: string;
};

type ClassroomItem = {
  id: number;
  title: string | null;
  description: string | null;
  status: string | null;
  closed: boolean | null;
  student_count: number | null;
  studio_count: number | null;
  url: string;
};

type ManagementResponse = {
  loved?: boolean;
  favorited?: boolean;
  comments?: boolean;
  open_to_all?: boolean;
  changed?: boolean;
  role?: Record<"manager" | "curator" | "invited" | "following", boolean>;
  account: string;
  entity: "project" | "studio" | "account" | "user" | "class";
  action: string;
  visibility?: string;
  page?: number;
  projects?: ProjectItem[];
  project?: ProjectItem;
  studio_id?: number;
  project_id?: number;
  source_project_id?: number;
  username?: string;
  moderation_status?: string;
  invite_status?: unknown;
  target?: string;
  comment_id?: number;
  report_type?: string;
  type?: string;
  studios?: Array<{ id: number; title: string | null; url: string | null }>;
  items?: Array<Record<string, unknown>>;
  class_id?: number;
  classroom?: ClassroomItem;
  classrooms?: ClassroomItem[];
  studio?: { id: number; title: string | null; url: string | null };
};

function isProject(value: unknown): value is ProjectItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ProjectItem>;
  return Number.isSafeInteger(item.id)
    && (typeof item.title === "string" || item.title === null)
    && (typeof item.shared === "boolean" || item.shared === null)
    && (typeof item.trashed === "boolean" || item.trashed === null)
    && typeof item.url === "string";
}

function isClassroom(value: unknown): value is ClassroomItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ClassroomItem>;
  return Number.isSafeInteger(item.id) && item.id! > 0
    && (typeof item.title === "string" || item.title === null)
    && (typeof item.description === "string" || item.description === null)
    && (typeof item.status === "string" || item.status === null)
    && (typeof item.closed === "boolean" || item.closed === null)
    && (Number.isSafeInteger(item.student_count) || item.student_count === null)
    && (Number.isSafeInteger(item.studio_count) || item.studio_count === null)
    && typeof item.url === "string";
}

function isResponse(value: unknown, args: ManagementArguments): value is ManagementResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<ManagementResponse>;
  if (typeof response.account !== "string" || !/^[A-Za-z0-9_-]+$/.test(response.account)
    || response.entity !== args.entity || response.action !== args.action) return false;
  if (args.payload?.expected_account !== undefined && response.account !== args.payload.expected_account) return false;
  if (args.entity === "project" && args.action === "reactions") {
    return response.project_id === args.payload?.project_id && typeof response.loved === "boolean" && typeof response.favorited === "boolean";
  }
  if (args.entity === "studio" && args.action === "role") {
    return response.studio_id === args.payload?.studio_id && !!response.role
      && ["manager", "curator", "invited", "following"].every((field) => typeof response.role?.[field as keyof typeof response.role] === "boolean");
  }
  if (args.action === "settings" && (args.payload?.comments !== undefined || args.payload?.open_to_all !== undefined)) {
    const field = args.payload.comments !== undefined ? "comments" : "open_to_all";
    return typeof response[field] === "boolean" && response[field] === args.payload[field]
      && (args.entity === "project" ? response.project_id === args.payload.project_id
        : typeof response.changed === "boolean" && (args.entity !== "studio" || response.studio_id === args.payload.studio_id));
  }
  if (args.entity === "class") {
    if (args.action === "list") {
      return (response.type === "all" || response.type === "closed")
        && Number.isSafeInteger(response.page)
        && Array.isArray(response.classrooms)
        && response.classrooms.every(isClassroom);
    }
    if (args.action === "create" || args.action === "details" || args.action === "edit") {
      return isClassroom(response.classroom);
    }
    if (!Number.isSafeInteger(response.class_id)) return false;
    if (args.action === "create-studio") {
      return !!response.studio && Number.isSafeInteger(response.studio.id)
        && (typeof response.studio.title === "string" || response.studio.title === null)
        && typeof response.studio.url === "string";
    }
    if (args.action === "students") {
      return Number.isSafeInteger(response.page) && Array.isArray(response.items)
        && response.items.every((item) => typeof item.username === "string");
    }
    if (args.action === "studios") {
      return Number.isSafeInteger(response.page) && Array.isArray(response.items)
        && response.items.every((item) => Number.isSafeInteger(item.id)
          && (typeof item.title === "string" || item.title === null));
    }
    return false;
  }
  if (args.entity === "project" && args.action === "list") {
    return typeof response.visibility === "string"
      && Number.isSafeInteger(response.page)
      && Array.isArray(response.projects)
      && response.projects.every(isProject);
  }
  if (args.entity === "studio" && args.action === "list") {
    return typeof response.type === "string"
      && Number.isSafeInteger(response.page)
      && Array.isArray(response.studios)
      && response.studios.every((item) => !!item && Number.isSafeInteger(item.id)
        && (typeof item.title === "string" || item.title === null)
        && (typeof item.url === "string" || item.url === null));
  }
  if (args.entity === "studio" && ["comments", "managers", "curators"].includes(args.action)) {
    return Number.isSafeInteger(response.studio_id) && Array.isArray(response.items);
  }
  if (args.entity === "project" && ["create", "remix"].includes(args.action)) {
    return isProject(response.project);
  }
  if (args.entity === "project") return Number.isSafeInteger(response.project_id);
  if (args.entity === "studio") {
    if (!["create", "accept-invite", "delete", "promote", "edit", "thumbnail", "add-project",
      "remove-project", "follow", "unfollow", "leave", "invite", "remove-curator", "report",
      "report-comment", "delete-comment", "transfer"].includes(args.action)) {
      return false;
    }
    if (args.action === "create") return Number.isSafeInteger(response.studio_id);
    if (args.action === "follow" || args.action === "unfollow" || args.action === "leave"
      || args.action === "invite" || args.action === "remove-curator" || args.action === "report") {
      return Number.isSafeInteger(response.studio_id);
    }
    if (!Number.isSafeInteger(response.studio_id)) return false;
    if (args.action === "promote" || args.action === "transfer") return typeof response.username === "string";
    if (args.action === "add-project") return Number.isSafeInteger(response.project_id);
    return true;
  }
  if (args.entity === "user") {
    return typeof response.target === "string"
      && (args.action === "report" || Number.isSafeInteger(response.comment_id));
  }
  return true;
}

async function executeManagement(
  args: ManagementArguments,
  configPath?: string,
): Promise<ManagementResponse | undefined> {
  const config = await loadConfig(configPath);
  if (!config.scratchsessionsid) {
    fail("No active session. Run `scc login` first.");
    return undefined;
  }
  const processInput = buildManagementProcess(config.scratchsessionsid, args);
  const result = spawnScratchPython(processInput.args, { stdin: processInput.stdin });
  if (!result) return undefined;
  const stdout = new TextDecoder().decode(result.stdout).trim();
  if (result.exitCode !== 0) {
    try {
      const error: unknown = JSON.parse(stdout);
      if (error && typeof error === "object" && "error" in error
        && typeof error.error === "string") {
        fail(error.error);
        return undefined;
      }
    } catch {
      // Use the generic message below.
    }
    fail("Scratch could not complete the requested action.");
    return undefined;
  }
  let response: unknown;
  try {
    response = JSON.parse(stdout);
  } catch {
    fail("Failed to parse the Scratch management response.");
    return undefined;
  }
  if (!isResponse(response, args)) {
    fail("Received an invalid Scratch management response.");
    return undefined;
  }
  return response;
}

export async function confirmAccountAction(
  description: (account: string) => string,
  configPath?: string,
  expectedAnswer?: (account: string) => string,
): Promise<string | undefined> {
  if (!requireInteractiveConfirmation()) return undefined;
  const identity = await executeManagement({ entity: "account", action: "identify" }, configPath);
  if (!identity) return undefined;
  return await confirmAction(description(identity.account), expectedAnswer?.(identity.account) ?? "yes")
    ? identity.account : undefined;
}

export async function runDangerousManagement(
  args: ManagementArguments,
  description: (account: string) => string,
  configPath?: string,
  options: {
    expectedAnswer?: (account: string) => string;
    extraPayload?: () => Promise<Record<string, unknown> | undefined>;
  } = {},
): Promise<boolean> {
  const account = await confirmAccountAction(description, configPath, options.expectedAnswer);
  if (!account) return false;
  const extraPayload = options.extraPayload ? await options.extraPayload() : {};
  if (extraPayload === undefined) return false;
  const response = await executeManagement({
    ...args,
    payload: { ...args.payload, ...extraPayload, expected_account: account },
  }, configPath);
  if (response) renderManagement(response, args);
  return response !== undefined;
}

function renderManagement(response: ManagementResponse, args: ManagementArguments): void {
  if (args.action === "reactions") {
    console.log(`Project ${response.project_id} reactions for ${response.account}`);
    console.log(`Loved: ${response.loved ? "Yes" : "No"}`);
    console.log(`Favorited: ${response.favorited ? "Yes" : "No"}`);
    return;
  }
  if (args.action === "role") {
    console.log(`Studio ${response.studio_id} role for ${response.account}`);
    for (const [field, enabled] of Object.entries(response.role!)) console.log(`${field}: ${enabled ? "Yes" : "No"}`);
    return;
  }
  if (args.action === "settings" && (response.comments !== undefined || response.open_to_all !== undefined)) {
    console.log(`${response.changed === false ? "No setting change needed" : "Updated settings"} for ${args.entity}${args.entity === "account" ? "" : ` ${response.project_id ?? response.studio_id}`} as ${response.account}.`);
    if (response.comments !== undefined) console.log(`Comments: ${response.comments ? "On" : "Off"}`);
    if (response.open_to_all !== undefined) console.log(`Open to all: ${response.open_to_all ? "On" : "Off"}`);
    return;
  }

  if (args.entity === "class") {
    if (args.action === "list") {
      console.log(`${response.type} classes for ${response.account} (page ${response.page})`);
      for (const [index, item] of (response.classrooms ?? []).entries()) {
        console.log(`${index + 1}. ${item.title ?? "Untitled"} (ID ${item.id}, ${item.closed ? "closed" : "open or unknown"})`);
        console.log(`   ${item.url}`);
      }
    } else if (args.action === "students" || args.action === "studios") {
      console.log(`Class ${response.class_id} ${args.action} (page ${response.page})`);
      for (const [index, item] of (response.items ?? []).entries()) {
        console.log(`${index + 1}. ${String(item.username ?? item.title ?? "Unknown")} (ID ${item.id ?? "Unknown"})`);
      }
    } else if (args.action === "create-studio") {
      console.log(`Created class studio ${response.studio?.id} for class ${response.class_id} as ${response.account}.`);
    } else if (response.classroom) {
      const item = response.classroom;
      if (args.action === "create") console.log(`Created class ${item.id} as ${response.account}.`);
      else if (args.action === "edit") console.log(`Updated class ${item.id} as ${response.account}.`);
      else console.log(`Class ${item.id} for ${response.account}`);
      console.log(`Title: ${item.title ?? "None"}`);
      console.log(`Description: ${item.description ?? "None"}`);
      console.log(`Status: ${item.status ?? "None"}`);
      console.log(`Closed: ${item.closed === null ? "Unknown" : item.closed ? "Yes" : "No"}`);
      console.log(`Students: ${item.student_count ?? "Unknown"}`);
      console.log(`Studios: ${item.studio_count ?? "Unknown"}`);
      console.log(`URL: ${item.url}`);
    }
  } else if (args.entity === "project" && args.action === "list") {
    console.log(`${response.visibility} projects for ${response.account} (page ${response.page})`);
    if (!response.projects?.length) {
      console.log("No projects found.");
      return;
    }
    for (const [index, project] of response.projects.entries()) {
      console.log("");
      console.log(`${index + 1}. ${project.title ?? "Untitled"}`);
      console.log(`   ID: ${project.id}`);
      console.log(`   Shared: ${project.shared === null ? "Unknown" : project.shared ? "Yes" : "No"}`);
      console.log(`   URL: ${project.url}`);
    }
  } else if (args.entity === "project" && response.project) {
    const verb = args.action === "remix" ? "Remixed" : "Created";
    console.log(`${verb} project ${response.project.id} as ${response.account}.`);
    console.log(`URL: ${response.project.url}`);
  } else if (args.entity === "project") {
    const verbs: Record<string, string> = {
      share: "Shared", unshare: "Unshared", trash: "Moved to trash", restore: "Restored",
      edit: "Updated", thumbnail: "Updated the thumbnail for", report: "Reported",
      "delete-comment": "Deleted comment from",
    };
    console.log(`${verbs[args.action] ?? "Updated"} project ${response.project_id} as ${response.account}.`);
    if (args.action === "report" && response.moderation_status) {
      console.log(`Moderation status: ${response.moderation_status}`);
    }
    if (args.action === "report-comment") {
      console.log(`Reported comment ${response.comment_id}.`);
    }
  } else if (args.entity === "user") {
    if (args.action === "report") {
      console.log(`Reported ${response.report_type} on user ${response.target} as ${response.account}.`);
    } else if (args.action === "delete-comment") {
      console.log(`Deleted comment ${response.comment_id} on user ${response.target} as ${response.account}.`);
    } else {
      console.log(`Reported comment ${response.comment_id} on user ${response.target} as ${response.account}.`);
    }
  } else if (args.entity === "studio" && args.action === "list") {
    console.log(`${response.type} studios for ${response.account} (page ${response.page})`);
    for (const [index, studio] of (response.studios ?? []).entries()) {
      console.log(`\n${index + 1}. ${studio.title ?? "Untitled"}`);
      console.log(`   ID: ${studio.id}`);
      if (studio.url) console.log(`   URL: ${studio.url}`);
    }
  } else if (args.entity === "studio" && ["comments", "managers", "curators"].includes(args.action)) {
    console.log(`Studio ${args.action} for ${response.studio_id}`);
    for (const [index, item] of (response.items ?? []).entries()) {
      console.log(`\n${index + 1}. ${String(item.username ?? item.author ?? "Unknown")}`);
      if (typeof item.content === "string") console.log(`   ${item.content}`);
      if (Number.isSafeInteger(item.id)) console.log(`   ID: ${item.id}`);
    }
  } else if (args.entity === "studio" && args.action === "create") {
    console.log(`Created studio ${response.studio_id} as ${response.account}.`);
    console.log(`URL: https://scratch.mit.edu/studios/${response.studio_id}/`);
  } else if (args.action === "accept-invite") {
    console.log(`Accepted the invitation to studio ${response.studio_id} as ${response.account}.`);
  } else if (args.action === "promote") {
    console.log(`Promoted ${response.username} in studio ${response.studio_id} as ${response.account}.`);
  } else if (args.action === "transfer") {
    console.log(`Transferred studio ${response.studio_id} to ${response.username} as ${response.account}.`);
  } else if (args.action === "delete") {
    console.log(`Deleted studio ${response.studio_id} as ${response.account}.`);
  } else if (args.action === "edit") {
    console.log(`Updated studio ${response.studio_id} as ${response.account}.`);
  } else if (args.action === "thumbnail") {
    console.log(`Updated the thumbnail for studio ${response.studio_id} as ${response.account}.`);
  } else if (args.action === "add-project") {
    console.log(`Added project ${response.project_id} to studio ${response.studio_id} as ${response.account}.`);
  } else if (args.action === "remove-project") {
    console.log(`Removed project ${response.project_id} from studio ${response.studio_id} as ${response.account}.`);
  } else if (args.action === "delete-comment") {
    if (args.entity === "studio") {
      console.log(`Deleted comment ${response.comment_id} from studio ${response.studio_id} as ${response.account}.`);
    } else {
      console.log(`Deleted comment ${response.comment_id} from project ${response.project_id} as ${response.account}.`);
    }
  } else if (args.action === "report-comment") {
    console.log(`Reported comment ${response.comment_id} on studio ${response.studio_id} as ${response.account}.`);
  } else if (args.action === "report") {
    console.log(`Reported studio ${response.studio_id} as ${response.account}.`);
  } else if (args.action === "follow" || args.action === "unfollow") {
    console.log(`${args.action === "follow" ? "Followed" : "Unfollowed"} studio ${response.studio_id} as ${response.account}.`);
  } else if (args.action === "leave") {
    console.log(`Left studio ${response.studio_id} as ${response.account}.`);
  } else if (args.action === "invite" || args.action === "remove-curator") {
    console.log(`${args.action === "invite" ? "Invited" : "Removed"} ${response.username} ${args.action === "invite" ? "to" : "from"} studio ${response.studio_id} as ${response.account}.`);
  } else if (args.action === "edit-profile") {
    console.log(`Updated the profile for ${response.account}.`);
  } else if (args.action === "settings") {
    console.log(`Updated account settings for ${response.account}.`);
  } else if (args.action === "clear-messages") {
    console.log(`Marked all messages as read for ${response.account}.`);
  } else if (args.action === "become-scratcher") {
    console.log(`Accepted the Scratcher invitation for ${response.account}.`);
  } else if (args.action === "scratcher-status") {
    console.log(`Scratcher invitation for ${response.account}: ${response.invite_status ? "Available" : "Not available"}`);
    if (response.invite_status) console.log(JSON.stringify(response.invite_status, null, 2));
  } else if (args.action === "change-email") {
    console.log(`Requested an email address change for ${response.account}.`);
  } else if (args.action === "change-password") {
    console.log(`Changed the password for ${response.account}. Sign in again to continue.`);
  } else if (args.action === "delete-account") {
    console.log(`Requested account deletion for ${response.account}.`);
  }
}

export async function runManagement(
  args: ManagementArguments,
  configPath?: string,
): Promise<void> {
  const response = await executeManagement(args, configPath);
  if (response) renderManagement(response, args);
}
