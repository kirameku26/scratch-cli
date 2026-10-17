import { expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, writeFile, rm, symlink, readdir } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveConfig } from "../config.ts";
import { confirmationIO } from "../confirmation.ts";
import { downloadFilename, transferProject } from "./project-transfer.ts";

const archive = Buffer.from("mock sb3 bytes validated by Python");

async function fixture(run: (context: {
  directory: string; configPath: string; calls: Array<{ args: string[]; stdin: Blob; timeout: number; maxBuffer: number }>;
  output: ReturnType<typeof spyOn<typeof console, "log">>;
  error: ReturnType<typeof spyOn<typeof console, "error">>;
  setResponse: (action: string, data: Record<string, unknown>, code?: number) => void;
  onDownload: (handler: () => void) => void;
}) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "scc-transfer-test-"));
  const configPath = join(directory, "config.json");
  await saveConfig({ scratchsessionsid: "private-session" }, configPath);
  const originalIO = { ...confirmationIO }, originalCode = process.exitCode;
  const calls: Array<{ args: string[]; stdin: Blob; timeout: number; maxBuffer: number }> = [];
  const responses = new Map<string, { code: number; data: Record<string, unknown> }>([
    ["identify", { code: 0, data: { entity: "account", action: "identify", account: "active_user" } }],
    ["validate", { code: 0, data: { action: "validate", valid: true } }],
    ["download", { code: 0, data: { action: "download", project_id: 123, format: "sb3", title: "サイトの作品名", archive: archive.toString("base64") } }],
    ["upload", { code: 0, data: { action: "upload", project_id: 123, account: "active_user" } }],
    ["convert", { code: 0, data: { format: "sb3", archive: archive.toString("base64") } }],
  ]);
  let downloadHook = () => {};
  const output = spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  Object.assign(confirmationIO, { interactive: () => true, readAnswer: async () => "yes", print: console.log, prompt: () => {} });
  const spawn = spyOn(Bun, "spawnSync").mockImplementation((...parameters: unknown[]) => {
    const args = parameters[0] as string[];
    const options = parameters[1] as Omit<typeof calls[number], "args">;
    calls.push({ args, ...options });
    const action = args.at(-1)!.endsWith("project-conversion.ts") ? "convert" : args.at(-1)!;
    if (action === "download") downloadHook();
    const response = responses.get(action);
    if (!response) throw new Error("Unexpected process");
    return { exitCode: response.code, stdout: Buffer.from(JSON.stringify(response.data)), stderr: Buffer.from("private traceback") } as ReturnType<typeof Bun.spawnSync>;
  });
  try {
    await run({ directory, configPath, calls, output, error,
      setResponse: (action, data, code = 0) => responses.set(action, { code, data }),
      onDownload: (handler) => { downloadHook = handler; },
    });
  } finally {
    spawn.mockRestore(); output.mockRestore(); error.mockRestore();
    Object.assign(confirmationIO, originalIO);
    process.exitCode = originalCode ?? 0;
    await rm(directory, { recursive: true, force: true });
  }
}

test("download validates the archive and saves all bytes without credentials in arguments", () => fixture(async ({ directory, configPath, calls, output }) => {
  const path = join(directory, "download.sb3");
  await transferProject({ action: "download", id: 123, output: path }, configPath);
  expect(await readFile(path)).toEqual(archive);
  expect(calls.map((call) => call.args.at(-1))).toEqual(["download", "validate"]);
  expect(calls[0]!.args).not.toContain("private-session");
  expect(JSON.parse(await calls[0]!.stdin.text())).toEqual({ project_id: 123, session_id: "private-session" });
  expect(calls[0]!.timeout).toBe(125_000);
  expect(calls[0]!.maxBuffer).toBeGreaterThan(50 * 1024 * 1024 * 4 / 3);
  expect(output.mock.calls.flat().join(" ")).not.toContain("private-session");
  expect((await readdir(directory)).some((name) => name.startsWith(".scc-download-"))).toBe(false);
}));

test.each([
  { title: "日本語の作品 😀", expected: "日本語の作品 😀.sb3" },
  { title: "a/b\\c:d*e?f\"g<h>i|j", expected: "a_b_c_d_e_f_g_h_i_j.sb3" },
  { title: "../escape", expected: ".._escape.sb3" },
  { title: "CON", expected: "_CON.sb3" },
  { title: "nul.txt", expected: "_nul.txt.sb3" },
  { title: "COM¹", expected: "_COM¹.sb3" },
  { title: "title. ", expected: "title.sb3" },
  { title: "...", expected: "123.sb3" },
  { title: "", expected: "123.sb3" },
  { title: null, expected: "123.sb3" },
])("uses safe cross-platform filenames for $title", ({ title, expected }) => {
  expect(downloadFilename(title, 123)).toBe(expected);
});

test("long Unicode titles are shortened without splitting characters", () => {
  const name = downloadFilename("😀".repeat(100), 123);
  expect(Buffer.byteLength(name)).toBeLessThanOrEqual(184);
  expect(name).not.toContain("\ufffd");
  expect(name).toBe(`${"😀".repeat(45)}.sb3`);
});

test("default download name uses the site title without additional API requests", () => fixture(async ({ directory, configPath, calls }) => {
  const cwd = process.cwd();
  process.chdir(directory);
  try {
    await transferProject({ action: "download", id: 123, format: "original" }, configPath);
    expect(await readFile(join(directory, "サイトの作品名.sb3"))).toEqual(archive);
    expect(calls.map((call) => call.args.at(-1))).toEqual(["download", "validate"]);
  } finally { process.chdir(cwd); }
}));

test("same-title files are preserved when overwrite confirmation is cancelled", () => fixture(async ({ directory, configPath }) => {
  const cwd = process.cwd();
  process.chdir(directory);
  const path = join(directory, "サイトの作品名.sb3");
  await writeFile(path, "original");
  confirmationIO.readAnswer = async () => "no";
  try {
    await transferProject({ action: "download", id: 123 }, configPath);
    expect(await readFile(path, "utf8")).toBe("original");
    expect(process.exitCode).toBe(1);
  } finally { process.chdir(cwd); }
}));

test("an unavailable site title falls back to the project ID", () => fixture(async ({ directory, configPath, setResponse }) => {
  const cwd = process.cwd();
  process.chdir(directory);
  setResponse("download", { action: "download", project_id: 123, format: "sb3", title: null, archive: archive.toString("base64") });
  try {
    await transferProject({ action: "download", id: 123 }, configPath);
    expect(await readFile(join(directory, "123.sb3"))).toEqual(archive);
  } finally { process.chdir(cwd); }
}));

test.each(["sb", "sb2"] as const)("old projects use the original title with the %s extension", (format) => fixture(async ({ directory, configPath, calls, setResponse }) => {
  const cwd = process.cwd();
  process.chdir(directory);
  setResponse("download", { action: "download", project_id: 123, format, title: "昔の作品", archive: archive.toString("base64") });
  try {
    await transferProject({ action: "download", id: 123, format: "original" }, configPath);
    expect(await readFile(join(directory, `昔の作品.${format}`))).toEqual(archive);
    expect(JSON.parse(await calls[1]!.stdin.text()).format).toBe(format);
  } finally { process.chdir(cwd); }
}));

test("Scratch 2 downloads do not overwrite an explicitly named sb3 file", () => fixture(async ({ directory, configPath, setResponse, error }) => {
  const path = join(directory, "existing.sb3");
  await writeFile(path, "original");
  setResponse("download", { action: "download", project_id: 123, format: "sb2", title: "Old project", archive: archive.toString("base64") });
  await transferProject({ action: "download", id: 123, output: path, format: "original" }, configPath);
  expect(await readFile(path, "utf8")).toBe("original");
  expect(error.mock.calls.flat().join(" ")).toContain(".sb2 extension");
  expect(process.exitCode).toBe(1);
}));

test("old formats default to offline sb3 conversion and are revalidated before saving", () => fixture(async ({ directory, configPath, calls, setResponse }) => {
  const path = join(directory, "converted.sb3");
  setResponse("download", { action: "download", project_id: 123, format: "sb2", title: "Old project", archive: archive.toString("base64") });
  await transferProject({ action: "download", id: 123, output: path }, configPath);
  expect(await readFile(path)).toEqual(archive);
  expect(calls).toHaveLength(4);
  expect(JSON.parse(await calls[1]!.stdin.text()).format).toBe("sb2");
  expect(JSON.parse(await calls[2]!.stdin.text())).toMatchObject({ source: "sb2", target: "sb3" });
  expect(JSON.parse(await calls[3]!.stdin.text()).format).toBe("sb3");
}));

test("failed conversion preserves the destination and hides third-party errors", () => fixture(async ({ directory, configPath, setResponse, error }) => {
  const path = join(directory, "converted.sb3");
  await writeFile(path, "original");
  setResponse("download", { action: "download", project_id: 123, format: "sb", title: "Old project", archive: archive.toString("base64") });
  setResponse("convert", { error: "private traceback" }, 1);
  await transferProject({ action: "download", id: 123, output: path }, configPath);
  expect(await readFile(path, "utf8")).toBe("original");
  expect(error.mock.calls.flat().join(" ")).not.toContain("private");
  expect(process.exitCode).toBe(1);
}));

test("public downloads work without a saved login", () => fixture(async ({ directory, calls }) => {
  const path = join(directory, "public.sb3");
  await transferProject({ action: "download", id: 123, output: path }, join(directory, "missing.json"));
  expect(await readFile(path)).toEqual(archive);
  expect(JSON.parse(await calls[0]!.stdin.text())).toEqual({ project_id: 123 });
}));

test("a missing destination directory stops before downloading", () => fixture(async ({ directory, configPath, calls }) => {
  await transferProject({ action: "download", id: 123, output: join(directory, "missing", "project.sb3") }, configPath);
  expect(calls).toHaveLength(0);
  expect(process.exitCode).toBe(1);
}));

test.each(["cancel", "noninteractive"])("%s preserves an existing file without downloading", (mode) => fixture(async ({ directory, configPath, calls }) => {
  const path = join(directory, "existing.sb3");
  await writeFile(path, "original");
  Object.assign(confirmationIO, { interactive: () => mode !== "noninteractive", readAnswer: async () => "no" });
  await transferProject({ action: "download", id: 123, output: path }, configPath);
  expect(await readFile(path, "utf8")).toBe("original");
  expect(calls).toHaveLength(0);
  expect(process.exitCode).toBe(1);
}));

test("confirmed download replacement is staged and shows the exact file", () => fixture(async ({ directory, configPath, output }) => {
  const path = join(directory, "existing.sb3");
  await writeFile(path, "original");
  await transferProject({ action: "download", id: 123, output: path }, configPath);
  expect(await readFile(path)).toEqual(archive);
  expect(output.mock.calls.flat().join(" ")).toContain(`File: ${path}`);
}));

test.each([true, false])("a destination changed or created during download is not overwritten (existing: %s)", (existing) => fixture(async ({ directory, configPath, onDownload }) => {
  const path = join(directory, "raced.sb3");
  if (existing) await writeFile(path, "original");
  onDownload(() => writeFileSync(path, "new contents from another process"));
  await transferProject({ action: "download", id: 123, output: path }, configPath);
  expect(await readFile(path, "utf8")).toBe("new contents from another process");
  expect(process.exitCode).toBe(1);
  expect((await readdir(directory)).some((name) => name.startsWith(".scc-download-"))).toBe(false);
}));

test.skipIf(process.platform === "win32")("download refuses symbolic links without touching their targets", () => fixture(async ({ directory, configPath, calls }) => {
  const target = join(directory, "target.sb3"), path = join(directory, "link.sb3");
  await writeFile(target, "original");
  await symlink(target, path);
  await transferProject({ action: "download", id: 123, output: path }, configPath);
  expect(await readFile(target, "utf8")).toBe("original");
  expect(calls).toHaveLength(0);
  expect(process.exitCode).toBe(1);
}));

test.each([
  { action: "download", data: { action: "download", project_id: 999, archive: "YWJj" } },
  { action: "download", data: { action: "download", project_id: 123, archive: "invalid!" } },
  { action: "validate", data: { action: "validate", valid: false } },
])("bad $action responses preserve the original destination", ({ action, data }) => fixture(async ({ directory, configPath, setResponse }) => {
  const path = join(directory, "original.sb3");
  await writeFile(path, "original");
  setResponse(action, data);
  await transferProject({ action: "download", id: 123, output: path }, configPath);
  expect(await readFile(path, "utf8")).toBe("original");
  expect(process.exitCode).toBe(1);
}));

test("upload validates before consent and binds the confirmed account to an immutable file snapshot", () => fixture(async ({ directory, configPath, calls, output }) => {
  const path = join(directory, "source.sb3");
  await writeFile(path, archive);
  confirmationIO.readAnswer = async () => { await writeFile(path, "modified after validation"); return "yes"; };
  await transferProject({ action: "upload", file: path, title: "New project" }, configPath);
  expect(calls.map((call) => call.args.at(-1))).toEqual(["validate", "identify", "upload"]);
  const payload = JSON.parse(await calls[2]!.stdin.text());
  expect(payload).toEqual({ archive: archive.toString("base64"), title: "New project", session_id: "private-session", expected_account: "active_user" });
  expect(calls[2]!.args.join(" ")).not.toContain("private-session");
  expect(output.mock.calls.flat().join(" ")).toContain("Account: active_user");
  expect(output.mock.calls.flat().join(" ")).toContain(`File: ${path}`);
}));

test.each(["yes", "overwrite 123"])("overwrite requires the exact target phrase (%s)", (answer) => fixture(async ({ directory, configPath, calls }) => {
  const path = join(directory, "source.sb3");
  await writeFile(path, archive);
  confirmationIO.readAnswer = async () => answer;
  await transferProject({ action: "upload", id: 123, file: path }, configPath);
  expect(calls.some((call) => call.args.at(-1) === "upload")).toBe(answer === "overwrite 123");
}));

test("noninteractive upload cannot mutate Scratch", () => fixture(async ({ directory, configPath, calls }) => {
  const path = join(directory, "source.sb3");
  await writeFile(path, archive);
  confirmationIO.interactive = () => false;
  await transferProject({ action: "upload", file: path }, configPath);
  expect(calls.map((call) => call.args.at(-1))).toEqual(["validate"]);
  expect(process.exitCode).toBe(1);
}));

test("missing files and invalid archives stop before account lookup", () => fixture(async ({ directory, configPath, calls, setResponse }) => {
  await transferProject({ action: "upload", file: join(directory, "missing.sb3") }, configPath);
  expect(calls).toHaveLength(0);
  const path = join(directory, "bad.sb3");
  await writeFile(path, archive);
  setResponse("validate", { error: "Invalid project.json." }, 1);
  await transferProject({ action: "upload", file: path }, configPath);
  expect(calls.map((call) => call.args.at(-1))).toEqual(["validate"]);
}));

test("failed transfer does not print a traceback, retry, or claim success", () => fixture(async ({ directory, configPath, calls, output, error, setResponse }) => {
  const path = join(directory, "source.sb3");
  await writeFile(path, archive);
  setResponse("upload", { error: "Upload failed; check Scratch before retrying." }, 1);
  await transferProject({ action: "upload", file: path }, configPath);
  expect(calls.filter((call) => call.args.at(-1) === "upload")).toHaveLength(1);
  expect(output.mock.calls.flat().join(" ")).not.toContain("Uploaded project");
  expect(error.mock.calls.flat().join(" ")).not.toContain("private");
  expect(await readFile(configPath, "utf8")).toContain("private-session");
}));
