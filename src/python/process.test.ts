import { expect, spyOn, test } from "bun:test";
import { PYTHON_PROCESS_TIMEOUT_MS, spawnScratchPython } from "./process.ts";

test("Python API processes have a bounded wait and receive secrets only through stdin", () => {
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({ exitCode: 0, stdout: Buffer.from("{}"), stderr: Buffer.from("") }) as ReturnType<typeof Bun.spawnSync>);
  try {
    const stdin = new Blob(['{"session_id":"private"}']);
    expect(spawnScratchPython(["python", "script.py"], { stdin })).toBeDefined();
    expect(spawn).toHaveBeenCalledWith(["python", "script.py"], {
      stdin, stdout: "pipe", stderr: "pipe", timeout: PYTHON_PROCESS_TIMEOUT_MS, killSignal: "SIGKILL",
    });
  } finally { spawn.mockRestore(); }
});

test.each(["signal", "timeout", "missing"])("Python %s errors fail safely without retries", (kind) => {
  const originalCode = process.exitCode;
  const error = spyOn(console, "error").mockImplementation(() => {});
  const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => {
    if (kind === "signal") return { signalCode: "SIGKILL" } as ReturnType<typeof Bun.spawnSync>;
    throw Object.assign(new Error("private-session"), { code: kind === "timeout" ? "ETIMEDOUT" : "ENOENT" });
  });
  try {
    expect(spawnScratchPython(["python", "script.py"])).toBeUndefined();
    expect(process.exitCode).toBe(1);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.flat().join(" ")).not.toContain("private-session");
    expect(error.mock.calls.flat().join(" ")).toContain(kind === "missing" ? "scc python" : "timed out");
  } finally {
    spawn.mockRestore(); error.mockRestore(); process.exitCode = originalCode ?? 0;
  }
});
