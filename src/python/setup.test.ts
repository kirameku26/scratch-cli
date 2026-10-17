import { expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { confirmationIO } from "../confirmation.ts";
import { findPython } from "./index.ts";
import { installScapi, updateScapi } from "./scapi.ts";

test("Python discovery tries the next candidate when the first executable is missing", () => {
  const spawn = spyOn(Bun, "spawnSync").mockImplementationOnce(() => { throw new Error("ENOENT"); })
    .mockImplementationOnce(() => ({ exitCode: 0 }) as ReturnType<typeof Bun.spawnSync>);
  try {
    expect(findPython()).toBe("python");
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenLastCalledWith(["python", "--version"], { timeout: 15_000 });
  } finally { spawn.mockRestore(); }
});

test.each(["install", "upgrade"])("Scapi %s runs pip only after confirmation", async (action) => {
  for (const scenario of ["noninteractive", "no", "yes"]) {
    const interactive = spyOn(confirmationIO, "interactive").mockReturnValue(scenario !== "noninteractive");
    const read = spyOn(confirmationIO, "readAnswer").mockResolvedValue(scenario);
    const print = spyOn(confirmationIO, "print").mockImplementation(() => {});
    const prompt = spyOn(confirmationIO, "prompt").mockImplementation(() => {});
    const fail = spyOn(confirmationIO, "fail").mockImplementation(() => {});
    const log = spyOn(console, "log").mockImplementation(() => {});
    const spawn = spyOn(Bun, "spawnSync").mockImplementation(() => ({ exitCode: 0 }) as ReturnType<typeof Bun.spawnSync>);
    try {
      expect(await (action === "install" ? installScapi() : updateScapi())).toBe(scenario === "yes");
      expect(spawn).toHaveBeenCalledTimes(scenario === "yes" ? 1 : 0);
      if (scenario !== "noninteractive") {
        expect(print.mock.calls.flat().join(" ")).toContain("Python environment:");
        expect(print.mock.calls.flat().join(" ")).toContain(`Action: ${action}`);
      }
    } finally {
      for (const mock of [interactive, read, print, prompt, fail, log, spawn]) mock.mockRestore();
    }
  }
});

test("noninteractive Python setup cannot create an environment, even with yes piped in", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scc-setup-confirm-"));
  try {
    const script = new URL("./venv.ts", import.meta.url).pathname;
    const result = Bun.spawnSync([process.execPath, "-e", `const {ensureVenv}=await import(${JSON.stringify(script)}); await ensureVenv();`], {
      env: { ...process.env, HOME: directory, USERPROFILE: directory }, stdin: new Blob(["yes\n"]),
    });
    expect(result.exitCode).toBe(1);
    expect(new TextDecoder().decode(result.stderr)).toContain("requires confirmation in an interactive terminal");
    expect(await stat(join(directory, ".config", "scc", "python")).catch(() => null)).toBeNull();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test.each([false, true])("existing environment is not recreated (usable executable: %s)", async (complete) => {
  const directory = await mkdtemp(join(tmpdir(), "scc-existing-env-"));
  const environment = join(directory, ".config", "scc", "python", ".venv");
  const executable = process.platform === "win32" ? join(environment, "Scripts", "python.exe") : join(environment, "bin", "python");
  const marker = join(environment, "keep.txt");
  try {
    await mkdir(join(executable, ".."), { recursive: true });
    await writeFile(marker, "must be preserved");
    if (complete) await writeFile(executable, "existing executable");
    const script = new URL("./venv.ts", import.meta.url).pathname;
    const result = Bun.spawnSync([process.execPath, "-e", `const {ensureVenv}=await import(${JSON.stringify(script)}); if(!await ensureVenv()) process.exitCode=1;`], {
      env: { ...process.env, HOME: directory, USERPROFILE: directory }, stdin: new Blob(["yes\n"]),
    });
    expect(result.exitCode).toBe(complete ? 0 : 1);
    expect(await readFile(marker, "utf8")).toBe("must be preserved");
    if (complete) expect(await readFile(executable, "utf8")).toBe("existing executable");
    else expect(new TextDecoder().decode(result.stderr)).toContain("environment is incomplete. No files were changed");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
