import { expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveConfig } from "../config.ts";
import { confirmationIO } from "../confirmation.ts";
import { runDangerousManagement } from "./management.ts";
import { runInteraction } from "./interactions.ts";
import { runForum } from "./forum.ts";

test.each(["management", "interaction", "forum"] as const)("%s requires consent and passes the confirmed identity to the backend", async (kind) => {
  for (const scenario of ["yes", "no", "read-error", "noninteractive", "offline", "changed"] as const) {
    const directory = await mkdtemp(join(tmpdir(), "scc-confirm-flow-"));
    const configPath = join(directory, "config.json");
    const originalCode = process.exitCode;
    const inputs: Blob[] = [];
    const commands: string[][] = [];
    const print = spyOn(confirmationIO, "print").mockImplementation(() => {});
    const prompt = spyOn(confirmationIO, "prompt").mockImplementation(() => {});
    const interactive = spyOn(confirmationIO, "interactive").mockReturnValue(scenario !== "noninteractive");
    const answer = spyOn(confirmationIO, "readAnswer").mockImplementation(async () => {
      if (scenario === "read-error") throw new Error("input closed");
      if (scenario === "changed") await saveConfig({ scratchsessionsid: "switched-session" }, configPath);
      return scenario === "no" ? "no" : "yes";
    });
    const error = spyOn(console, "error").mockImplementation(() => {});
    const log = spyOn(console, "log").mockImplementation(() => {});
    const spawn = spyOn(Bun, "spawnSync").mockImplementation((...parameters: unknown[]) => {
      commands.push(parameters[0] as string[]);
      inputs.push((parameters[1] as { stdin: Blob }).stdin);
      const identity = inputs.length === 1;
      const failed = scenario === "offline" || (!identity && scenario === "changed");
      const response = failed ? { error: identity ? "The network may be unavailable." : "The active Scratch account changed before the action could run." }
        : identity ? { account: "active_user", entity: "account", action: "identify" }
        : kind === "interaction" ? { account: "active_user", entity: "project", action: "comment", target: 123, comment_id: 42 }
        : kind === "forum" ? { account: "active_user", action: "follow", id: 123, page: null }
        : { account: "active_user", entity: "studio", action: "create", studio_id: 456 };
      return { exitCode: failed ? 1 : 0, stdout: Buffer.from(JSON.stringify(response)), stderr: Buffer.from("") } as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      await saveConfig({ scratchsessionsid: "private-session" }, configPath);
      if (kind === "management") await runDangerousManagement(
        { entity: "studio", action: "create" },
        (account) => `Account: ${account}\nAction: create studio`, configPath,
      );
      else if (kind === "forum") await runForum({ action: "follow", id: 123, page: 1, limit: 20 }, configPath);
      else await runInteraction({ entity: "project", action: "comment", target: "123", text: "Public message" }, configPath);

      const executed = ["yes", "changed"].includes(scenario);
      expect(inputs.length).toBe(scenario === "noninteractive" ? 0 : executed ? 2 : 1);
      expect(answer).toHaveBeenCalledTimes(["offline", "noninteractive"].includes(scenario) ? 0 : 1);
      if (!["offline", "noninteractive"].includes(scenario)) {
        expect(print.mock.calls.flat().join(" ")).toContain("Account: active_user");
        if (kind === "interaction") {
          expect(print.mock.calls.flat().join(" ")).toContain("Target: project 123");
          expect(print.mock.calls.flat().join(" ")).toContain("Public comment: Public message");
        }
      }
      if (executed) {
        const payload = JSON.parse(await inputs[1]!.text());
        expect(payload.expected_account).toBe("active_user");
        expect(payload.session_id).toBe(scenario === "changed" ? "switched-session" : "private-session");
      }
      expect(commands.flat().join(" ")).not.toContain("private-session");
      expect(commands.flat().join(" ")).not.toContain("Public message");
      expect(process.exitCode ?? 0).toBe(scenario === "yes" ? 0 : 1);
      if (scenario !== "yes") expect(log.mock.calls.flat().join(" ")).not.toMatch(/Created studio|Posted a comment|Followed forum/);
    } finally {
      for (const mock of [spawn, print, prompt, interactive, answer, error, log]) mock.mockRestore();
      process.exitCode = originalCode ?? 0;
      await rm(directory, { recursive: true, force: true });
    }
  }
});
