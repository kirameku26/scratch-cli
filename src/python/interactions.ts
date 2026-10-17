import { loadConfig } from "../config.ts";
import { fail } from "../errors.ts";
import { venvDir } from "./index.ts";
import { spawnScratchPython } from "./process.ts";
import { confirmAccountAction } from "./management.ts";

const pythonPath = `${venvDir}/bin/python`;
const scriptPath = new URL("./interactions.py", import.meta.url);

export type ProjectInteraction =
  | "love" | "unlove" | "favorite" | "unfavorite" | "comment" | "reply";
export type UserInteraction = "follow" | "unfollow" | "comment" | "reply";
export type StudioInteraction = "follow" | "unfollow" | "comment" | "reply";

type InteractionArguments = {
  entity: "project" | "user" | "studio";
  action: ProjectInteraction | UserInteraction | StudioInteraction;
  target: string;
  text?: string;
  commentId?: number;
};

type InteractionResponse = {
  account: string;
  entity: "project" | "user" | "studio";
  action: string;
  target: string | number;
  changed?: boolean;
  comment_id?: number;
};

export function buildInteractionProcess(
  sessionId: string,
  { entity, action, target, text, commentId }: InteractionArguments,
  expectedAccount?: string,
) {
  return {
    args: [pythonPath, scriptPath.pathname, entity, action, target],
    stdin: new Blob([JSON.stringify({ session_id: sessionId, text, comment_id: commentId, expected_account: expectedAccount })]),
  };
}

function isInteractionResponse(
  value: unknown,
  expected: InteractionArguments,
): value is InteractionResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<InteractionResponse>;
  const validTarget = expected.entity === "project" || expected.entity === "studio"
    ? response.target === Number(expected.target)
    : response.target === expected.target;
  const reaction = expected.entity === "project"
    && !["comment", "reply"].includes(expected.action);
  const comment = ["comment", "reply"].includes(expected.action);
  return typeof response.account === "string"
    && response.account.length > 0
    && response.entity === expected.entity
    && response.action === expected.action
    && validTarget
    && (reaction ? typeof response.changed === "boolean" : response.changed === undefined)
    && (comment ? Number.isSafeInteger(response.comment_id) : response.comment_id === undefined);
}

export async function runInteraction(
  args: InteractionArguments,
  configPath?: string,
): Promise<void> {
  const account = await confirmAccountAction((account) => [
    `Account: ${account}`, `Target: ${args.entity} ${args.target}`, `Action: ${args.action}`,
    args.commentId === undefined ? undefined : `Comment: ${args.commentId}`,
    args.text === undefined ? undefined : `Public comment: ${args.text}`,
  ].filter(Boolean).join("\n"), configPath);
  if (!account) return;
  const config = await loadConfig(configPath);
  if (!config.scratchsessionsid) {
    fail("No active session. Run `scc login` first.");
    return;
  }

  const processInput = buildInteractionProcess(config.scratchsessionsid, args, account);
  const result = spawnScratchPython(processInput.args, { stdin: processInput.stdin });
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
    fail("Scratch could not complete the requested action.");
    return;
  }

  let response: unknown;
  try {
    response = JSON.parse(stdout);
  } catch {
    fail("Failed to parse the Scratch action response.");
    return;
  }
  if (!isInteractionResponse(response, args)) {
    fail("Received an invalid Scratch action response.");
    return;
  }

  const targetLabel = args.entity === "project" || args.entity === "studio"
    ? `${args.entity} ${args.target}`
    : `user ${args.target}`;
  const actionLabels: Record<string, string> = {
    love: "Loved",
    unlove: "Removed love from",
    favorite: "Favorited",
    unfavorite: "Removed favorite from",
    follow: "Followed",
    unfollow: "Unfollowed",
    comment: "Posted a comment on",
    reply: "Posted a reply on",
  };
  if (response.changed === false) {
    console.log(`No change to ${targetLabel} for ${response.account}.`);
    return;
  }
  console.log(`${actionLabels[args.action]} ${targetLabel} as ${response.account}.`);
  if (["comment", "reply"].includes(args.action) && response.comment_id !== undefined) {
    console.log(`Comment ID: ${response.comment_id}`);
  }
}
