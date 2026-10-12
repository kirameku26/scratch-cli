import { fail } from "../errors.ts";
import { venvDir } from "./index.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("./profile.py", import.meta.url);

export type ProfileSection =
  | "about" | "projects" | "favorites" | "studios" | "followed-studios"
  | "following" | "followers" | "comments";

type ProfileArguments = {
  username?: string;
  sessionId?: string;
  section: ProfileSection;
  limit: number;
  offset: number;
  page: number;
};

type ProfileResponse = {
  username: string;
  section: ProfileSection;
  items?: Record<string, unknown>[];
  about?: Record<string, unknown>;
};

const sectionLabels: Record<ProfileSection, string> = {
  about: "Profile",
  projects: "Shared projects",
  favorites: "Favorite projects",
  studios: "Studios curated",
  "followed-studios": "Studios followed",
  following: "Following",
  followers: "Followers",
  comments: "Profile comments",
};

function cleanText(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value: string): string {
  return value.replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, " ")
    .trim();
}

function optionalText(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function validFeaturedProject(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  const project = value as Record<string, unknown>;
  return Number.isSafeInteger(project.id)
    && optionalText(project.title)
    && typeof project.url === "string"
    && typeof project.label === "string";
}

function validActivity(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const activity = value as Record<string, unknown>;
  return typeof activity.action === "string"
    && optionalText(activity.actor)
    && optionalText(activity.target_title)
    && optionalText(activity.target_url)
    && optionalText(activity.when);
}

function validAbout(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const about = value as Record<string, unknown>;
  return (Number.isSafeInteger(about.id) || about.id === null)
    && typeof about.username === "string"
    && optionalText(about.role)
    && optionalText(about.country)
    && optionalText(about.joined_at)
    && optionalText(about.bio)
    && optionalText(about.status)
    && optionalText(about.icon_url)
    && typeof about.url === "string"
    && validFeaturedProject(about.featured_project)
    && Array.isArray(about.activities)
    && about.activities.every(validActivity);
}

function validComment(value: Record<string, unknown>): boolean {
  return Number.isSafeInteger(value.id)
    && optionalText(value.author)
    && optionalText(value.content)
    && optionalText(value.created_at);
}

function validItem(item: unknown, section: ProfileSection): item is Record<string, unknown> {
  if (!item || typeof item !== "object") {
    return false;
  }

  const value = item as Record<string, unknown>;

  if (section === "following" || section === "followers") {
    return typeof value.username === "string" && optionalText(value.url);
  }

  if (!Number.isSafeInteger(value.id)) {
    return false;
  }

  if (section === "comments") {
    return validComment(value)
      && Array.isArray(value.replies)
      && value.replies.every((reply: unknown) =>
        !!reply && typeof reply === "object"
          && validComment(reply as Record<string, unknown>));
  }

  return optionalText(value.title)
    && optionalText(value.url)
    && (section !== "projects" && section !== "favorites"
      || optionalText(value.author));
}

function isProfileResponse(value: unknown, section: ProfileSection): value is ProfileResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<ProfileResponse>;
  const shared = typeof response.username === "string"
    && response.username.length > 0
    && response.section === section;
  return shared && (section === "about"
    ? validAbout(response.about)
    : Array.isArray(response.items)
      && response.items.every((item: unknown) => validItem(item, section)));
}

function displayAbout(about: Record<string, unknown>): void {
  const line = (label: string, value: unknown) =>
    console.log(`${label}: ${typeof value === "string" ? cleanText(value) || "None" : value ?? "None"}`);

  line("Username", about.username);
  line("Role", about.role);
  line("ID", about.id);
  line("Country", about.country);
  line("Joined", about.joined_at);
  line("Icon URL", about.icon_url);
  line("URL", about.url);
  console.log("");
  console.log("About me:");
  console.log(typeof about.bio === "string" ? cleanMultiline(about.bio) || "None" : "None");
  console.log("");
  console.log("What I'm working on:");
  console.log(typeof about.status === "string" ? cleanMultiline(about.status) || "None" : "None");

  console.log("");
  const featured = about.featured_project as Record<string, unknown> | null;
  console.log(`${featured ? cleanText(featured.label as string) || "Featured Project" : "Featured Project"}:`);
  if (featured) {
    console.log(typeof featured.title === "string" ? cleanText(featured.title) : `Project #${featured.id}`);
    console.log(`URL: ${cleanText(featured.url as string)}`);
  } else {
    console.log("None");
  }

  console.log("");
  console.log("Recent activity:");
  const activities = about.activities as Record<string, unknown>[];
  if (activities.length === 0) {
    console.log("No recent activity found.");
    return;
  }
  const actionLabels: Record<string, string> = {
    project: "shared a project",
    love: "loved a project",
    favorite: "favorited a project",
    remix: "remixed a project",
    studio: "was active in a studio",
    follow: "followed a user",
    comment: "commented",
  };
  for (const [index, activity] of activities.entries()) {
    const actor = typeof activity.actor === "string"
      ? cleanText(activity.actor)
      : cleanText(about.username as string);
    const action = actionLabels[activity.action as string] ?? "was active";
    const target = typeof activity.target_title === "string"
      ? `: ${cleanText(activity.target_title)}` : "";
    console.log(`${index + 1}. ${actor} ${action}${target}`);
    if (typeof activity.when === "string") {
      console.log(`   When: ${cleanText(activity.when)}`);
    }
    if (typeof activity.target_url === "string") {
      console.log(`   URL: ${cleanText(activity.target_url)}`);
    }
  }
}

function displayItem(
  item: Record<string, unknown>,
  section: ProfileSection,
  number: number,
): void {
  if (section === "following" || section === "followers") {
    console.log(`${number}. ${cleanText(item.username as string)}`);
    if (typeof item.url === "string") {
      console.log(`   URL: ${cleanText(item.url)}`);
    }
    return;
  }

  if (section === "comments") {
    console.log(`${number}. ${item.author ? cleanText(item.author as string) : "Unknown"}: ${item.content ? cleanText(item.content as string) : ""}`);
    console.log(`   ID: ${item.id}`);
    if (typeof item.created_at === "string") {
      console.log(`   When: ${cleanText(item.created_at)}`);
    }
    for (const reply of item.replies as Record<string, unknown>[]) {
      console.log(`   Reply — ${reply.author ? cleanText(reply.author as string) : "Unknown"}: ${reply.content ? cleanText(reply.content as string) : ""}`);
      console.log(`      ID: ${reply.id}`);
    }
    return;
  }

  console.log(`${number}. ${item.title ? cleanText(item.title as string) : "Untitled"}`);
  console.log(`   ID: ${item.id}`);
  if ((section === "projects" || section === "favorites")
    && typeof item.author === "string") {
    console.log(`   Author: ${cleanText(item.author)}`);
  }
  if (typeof item.url === "string") {
    console.log(`   URL: ${cleanText(item.url)}`);
  }
}

export async function getProfileSection({
  username, sessionId, section, limit, offset, page,
}: ProfileArguments): Promise<void> {
  if (!username && !sessionId) {
    fail("No active session. Run `scc login` first or specify --user.");
    return;
  }

  let result: ReturnType<typeof Bun.spawnSync>;

  try {
    result = Bun.spawnSync([
      pythonPath, scriptPath.pathname, username ?? "", section,
      String(limit), String(offset), String(page),
    ], {
      stdin: new Blob([JSON.stringify({ session_id: sessionId ?? null })]),
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    fail("Python environment is not ready. Run `scc python` first.");
    return;
  }

  const stdout = new TextDecoder().decode(result.stdout).trim();
  let response: unknown;

  try {
    response = JSON.parse(stdout);
  } catch {
    fail("Could not load Scratch profile data.");
    return;
  }

  if (result.exitCode !== 0) {
    if (response && typeof response === "object" && "error" in response
      && typeof response.error === "string") {
      fail(response.error);
    } else {
      fail("Could not load Scratch profile data.");
    }
    return;
  }

  if (!isProfileResponse(response, section)) {
    fail("Received an invalid Scratch profile response.");
    return;
  }

  const heading = `${sectionLabels[section]} for ${cleanText(response.username)}`;
  console.log(heading);

  if (section === "about") {
    displayAbout(response.about!);
    return;
  }

  const items = response.items!;
  if (items.length === 0) {
    console.log("No results found.");
    return;
  }

  for (const [index, item] of items.entries()) {
    console.log("");
    const number = section === "comments" ? index + 1 : offset + index + 1;
    displayItem(item, section, number);
  }
}
