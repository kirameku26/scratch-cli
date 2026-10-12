import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const entrypoint = new URL("../../index.ts", import.meta.url).pathname;
const notificationsModule = new URL("../python/notifications.ts", import.meta.url).href;

describe("notifications command", () => {
  test.each([
    { args: ["notifications", "--limit", "0"], message: "Limit must be an integer between 1 and 40." },
    { args: ["messages", "--limit", "41"], message: "Limit must be an integer between 1 and 40." },
    { args: ["notifications", "--offset", "-1"], message: "Offset must be a non-negative integer." },
  ])("rejects invalid pagination before reading the session", ({ args, message }) => {
    const result = Bun.spawnSync([process.execPath, entrypoint, ...args]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(message);
  });

  test("reports a missing session without starting Python", () => {
    const configPath = join(tmpdir(), `scc-notifications-test-${crypto.randomUUID()}.json`);
    const script = `import { getNotifications } from ${JSON.stringify(notificationsModule)}; await getNotifications({ limit: 10, offset: 0 }, ${JSON.stringify(configPath)});`;
    const result = Bun.spawnSync([process.execPath, "-e", script]);

    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain(
      "No active session. Run `scc login` first.",
    );
  });
});
