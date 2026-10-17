import { fail } from "../errors.ts";

export const PYTHON_PROCESS_TIMEOUT_MS = 35_000;

export function spawnScratchPython(args: string[], options: { stdin?: Blob; timeout?: number; maxBuffer?: number } = {}): ReturnType<typeof Bun.spawnSync> | undefined {
  try {
    const result = Bun.spawnSync(args, {
      ...options, stdout: "pipe", stderr: "pipe", timeout: options.timeout ?? PYTHON_PROCESS_TIMEOUT_MS, killSignal: "SIGKILL",
    });
    if (result.signalCode) {
      fail("Scratch operation was interrupted or timed out. Check its result before retrying a change.");
      return undefined;
    }
    return result;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ETIMEDOUT") {
      fail("Scratch operation timed out. Check its result before retrying a change.");
    } else {
      fail("Python environment is not ready. Run `scc python` first.");
    }
    return undefined;
  }
}
