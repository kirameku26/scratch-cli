import { loadConfig } from "../config.ts";
import { fail } from "../errors.ts";
import { venvDir } from "./index.ts";
import { spawnScratchPython } from "./process.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("./home.py", import.meta.url);

export type HomeSection =
  | "whats-happening"
  | "news"
  | "featured-projects"
  | "featured-studios"
  | "design-studio"
  | "following-loves"
  | "most-loved"
  | "most-remixed"
  | "newest-projects"
  | "following-projects"
  | "following-studio-projects"
  | "viewed-projects";

type HomeArguments = {
  section: HomeSection;
  limit: number;
  offset: number;
};

type HomeItem = Record<string, unknown>;

type HomeResponse = {
  section: HomeSection;
  username?: string;
  studio?: HomeItem | null;
  items: HomeItem[];
};

const privateSections: readonly HomeSection[] = [
  "whats-happening",
  "following-loves",
  "following-projects",
  "following-studio-projects",
  "viewed-projects",
];

function cleanText(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
}

function nullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isItem(value: unknown): value is HomeItem {
  return value !== null && typeof value === "object";
}

function isProject(item: HomeItem): boolean {
  return Number.isSafeInteger(item.id)
    && nullableString(item.title)
    && nullableString(item.author)
    && (Number.isSafeInteger(item.love_count) || item.love_count === null)
    && typeof item.url === "string";
}

function isStudio(item: HomeItem): boolean {
  return Number.isSafeInteger(item.id)
    && nullableString(item.title)
    && typeof item.url === "string";
}

function isNews(item: HomeItem): boolean {
  return (typeof item.id === "string" || item.id === null)
    && nullableString(item.headline)
    && nullableString(item.copy)
    && nullableString(item.url)
    && nullableString(item.image)
    && nullableString(item.created_at);
}

function isActivity(item: HomeItem): boolean {
  return typeof item.action === "string"
    && nullableString(item.actor)
    && nullableString(item.target_title)
    && nullableString(item.target_url)
    && nullableString(item.created_at);
}

function isHomeResponse(value: unknown, section: HomeSection): value is HomeResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<HomeResponse>;
  if (response.section !== section) {
    return false;
  }

  if (!Array.isArray(response.items) || !response.items.every(isItem)) {
    return false;
  }

  const validItems = response.items.every((item) => {
    if (section === "news") return isNews(item);
    if (section === "featured-studios") return isStudio(item);
    if (section === "whats-happening") return isActivity(item);
    return isProject(item);
  });
  const privateSection = privateSections.includes(section);
  const validUsername = privateSection
    ? typeof response.username === "string" && response.username.length > 0
    : response.username === undefined;
  const validStudio = section === "design-studio"
    ? response.studio === null || (isItem(response.studio) && isStudio(response.studio))
    : response.studio === undefined;

  return validItems && validUsername && validStudio;
}

function value(item: HomeItem, key: string): string | null {
  const field = item[key];
  return typeof field === "string" && field ? cleanText(field) : null;
}

function numberValue(item: HomeItem, key: string): number | null {
  const field = item[key];
  return Number.isSafeInteger(field) ? field as number : null;
}

function printProject(item: HomeItem, number: number): void {
  console.log(`${number}. ${value(item, "title") ?? "Untitled"}`);
  const id = numberValue(item, "id");
  if (id !== null) console.log(`   ID: ${id}`);
  const author = value(item, "author");
  if (author) console.log(`   Author: ${author}`);
  const loves = numberValue(item, "love_count");
  if (loves !== null) console.log(`   Loves: ${loves}`);
  const url = value(item, "url");
  if (url) console.log(`   URL: ${url}`);
}

function printItems(response: HomeResponse, offset: number): void {
  for (const [index, item] of response.items.entries()) {
    if (index > 0) console.log("");
    const number = offset + index + 1;

    if (response.section === "news") {
      console.log(`${number}. ${value(item, "headline") ?? "Untitled"}`);
      const copy = value(item, "copy");
      if (copy) console.log(`   ${copy}`);
      const createdAt = value(item, "created_at");
      if (createdAt) console.log(`   When: ${createdAt}`);
      const url = value(item, "url");
      if (url) console.log(`   URL: ${url}`);
    } else if (response.section === "featured-studios") {
      console.log(`${number}. ${value(item, "title") ?? "Untitled"}`);
      const id = numberValue(item, "id");
      if (id !== null) console.log(`   ID: ${id}`);
      const url = value(item, "url");
      if (url) console.log(`   URL: ${url}`);
    } else if (response.section === "whats-happening") {
      const actor = value(item, "actor") ?? "Unknown";
      const action = value(item, "action")?.replace(/_/g, " ") ?? "activity";
      console.log(`${number}. ${actor} ${action}`);
      const title = value(item, "target_title");
      if (title) console.log(`   About: ${title}`);
      const createdAt = value(item, "created_at");
      if (createdAt) console.log(`   When: ${createdAt}`);
      const url = value(item, "target_url");
      if (url) console.log(`   URL: ${url}`);
    } else {
      printProject(item, number);
    }
  }
}

export async function getHomeSection(
  { section, limit, offset }: HomeArguments,
  configPath?: string,
): Promise<void> {
  let sessionId: string | undefined;

  if (privateSections.includes(section)) {
    const config = await loadConfig(configPath);
    sessionId = config.scratchsessionsid;
    if (!sessionId) {
      fail("No active session. Run `scc login` first.");
      return;
    }
  }

  const result = spawnScratchPython([
      pythonPath,
      scriptPath.pathname,
      section,
      String(limit),
      String(offset),
    ], { stdin: new Blob([JSON.stringify({ session_id: sessionId })]) });
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
      // Use the generic message below.
    }
    fail("Could not load the Scratch home section.");
    return;
  }

  let response: unknown;
  try {
    response = JSON.parse(stdout);
  } catch {
    fail("Failed to parse the Scratch home response.");
    return;
  }

  if (!isHomeResponse(response, section)) {
    fail("Received an invalid Scratch home response.");
    return;
  }

  const labels: Record<HomeSection, string> = {
    "whats-happening": "What's Happening?",
    news: "Scratch News",
    "featured-projects": "Featured Projects",
    "featured-studios": "Featured Studios",
    "design-studio": "Scratch Design Studio",
    "following-loves": "Projects Loved by Scratchers I'm Following",
    "most-loved": "Most Loved Projects",
    "most-remixed": "Most Remixed Projects",
    "newest-projects": "Newest Projects",
    "following-projects": "Projects by Scratchers I'm Following",
    "following-studio-projects": "Projects in Studios I'm Following",
    "viewed-projects": "Recently Viewed Projects",
  };
  let heading = labels[section];
  if (section === "design-studio" && response.studio) {
    const title = value(response.studio, "title");
    if (title) heading += ` - ${title}`;
  }
  if (response.username) heading += ` for ${cleanText(response.username)}`;
  console.log(heading);

  if (response.items.length === 0) {
    console.log("No items found.");
    return;
  }
  console.log("");
  printItems(response, offset);
}
