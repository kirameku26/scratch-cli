import { loadConfig } from "../config.ts";
import { fail } from "../errors.ts";
import { venvDir } from "./index.ts";
import { spawnScratchPython } from "./process.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("./notifications.py", import.meta.url);

type Notification = {
  id: number;
  action: string;
  actor: string | null;
  created_at: string | null;
  title: string | null;
  url: string | null;
  content: string | null;
};

type NotificationsResponse = {
  username: string;
  action: "list" | "count";
  unread_count: number;
  notifications: Notification[];
};

type Pagination = {
  action: "list" | "count";
  limit?: number;
  offset: number;
  page?: number;
};

const actionLabels: Record<string, string> = {
  comment: "commented",
  forum_post: "posted in a forum topic",
  project_love: "reacted to your project",
  project_favorite: "favorited your project",
  project_remix: "remixed your project",
  studio_activity: "updated a studio",
  studio_become_manager: "made you a studio manager",
  studio_invite_curetor: "invited you to curate a studio",
  user_follow: "started following you",
  user_join: "joined Scratch",
};

function cleanText(value: string): string {
  return value
    .replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNotificationsResponse(value: unknown): value is NotificationsResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<NotificationsResponse>;

  return typeof response.username === "string"
    && response.username.length > 0
    && (response.action === "list" || response.action === "count")
    && typeof response.unread_count === "number"
    && Number.isSafeInteger(response.unread_count)
    && response.unread_count >= 0
    && Array.isArray(response.notifications)
    && response.notifications.every((item: unknown) => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const notification = item as Partial<Notification>;
      const optionalString = (field: unknown) =>
        typeof field === "string" || field === null;

      return Number.isSafeInteger(notification.id)
        && typeof notification.action === "string"
        && optionalString(notification.actor)
        && optionalString(notification.created_at)
        && optionalString(notification.title)
        && optionalString(notification.url)
        && optionalString(notification.content);
    });
}

export async function getNotifications(
  { action, limit, offset, page }: Pagination,
  configPath?: string,
): Promise<void> {
  const config = await loadConfig(configPath);

  if (!config.scratchsessionsid) {
    fail("No active session. Run `scc login` first.");
    return;
  }

  const result = spawnScratchPython([
      pythonPath,
      scriptPath.pathname,
      action,
      limit === undefined ? "" : String(limit),
      String(offset),
    ], { stdin: new Blob([JSON.stringify({ session_id: config.scratchsessionsid, page })]) });
  if (!result) return;

  const stdout = new TextDecoder().decode(result.stdout).trim();

  if (result.exitCode !== 0) {
    try {
      const error: unknown = JSON.parse(stdout);

      if (error && typeof error === "object" && "error" in error
        && typeof error.error === "string") {
        fail(error.error);
        return;
      }
    } catch {
      // Use a generic message when Python did not return an error payload.
    }

    fail("Could not load notifications. Check the Python setup with `scc python`.");
    return;
  }

  let response: unknown;

  try {
    response = JSON.parse(stdout);
  } catch {
    fail("Failed to parse Scratch notifications response.");
    return;
  }

  if (!isNotificationsResponse(response)) {
    fail("Received an invalid Scratch notifications response.");
    return;
  }

  const username = cleanText(response.username);

  console.log(`Unread messages for ${username}: ${response.unread_count}`);
  if (response.action === "count") return;

  if (response.notifications.length === 0) {
    console.log(`No notifications found for ${username}.`);
    return;
  }

  console.log(`Notifications for ${username}`);

  for (const [index, notification] of response.notifications.entries()) {
    const actor = notification.actor ? `${cleanText(notification.actor)} ` : "";
    const action = actionLabels[notification.action]
      ?? cleanText(notification.action.replace(/_/g, " "));

    console.log("");
    console.log(`${offset + index + 1}. ${actor}${action}`);

    if (notification.title) {
      console.log(`   About: ${cleanText(notification.title)}`);
    }

    if (notification.content) {
      console.log(`   Comment: ${cleanText(notification.content)}`);
    }

    if (notification.created_at) {
      console.log(`   When: ${cleanText(notification.created_at)}`);
    }

    if (notification.url) {
      console.log(`   URL: ${cleanText(notification.url)}`);
    }
  }
}
