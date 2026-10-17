import { lstat, stat, mkdtemp, writeFile, link, rename, rm } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { loadConfig } from "../config.ts";
import { confirmAction } from "../confirmation.ts";
import { fail } from "../errors.ts";
import { confirmAccountAction } from "./management.ts";
import { spawnScratchPython } from "./process.ts";
import { venvDir } from "./index.ts";

const MAX_ARCHIVE = 50 * 1024 * 1024;
const pythonPath = join(venvDir, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const scriptPath = new URL("./project_transfer.py", import.meta.url);

type TransferArguments = { action: "download" | "upload"; id?: number; file?: string; output?: string; title?: string; format?: "sb" | "sb2" | "sb3" | "original" };
type Snapshot = { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number } | null;

export function downloadFilename(title: string | null, id: number, format: "sb" | "sb2" | "sb3" = "sb3"): string {
  const safe = (title ?? "").replace(/[<>:"/\\|?*\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "_").trim().replace(/[. ]+$/g, "");
  let name = "";
  for (const character of safe) {
    if (Buffer.byteLength(name + character, "utf8") > 180) break;
    name += character;
  }
  name = name.replace(/[. ]+$/g, "") || String(id);
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) name = `_${name}`;
  return `${name}.${format}`;
}

async function prepareDestination(path: string, id: number): Promise<{ path: string; before: Snapshot } | undefined> {
  let before: Snapshot;
  try {
    if (!(await stat(dirname(path))).isDirectory()) throw new Error("Missing directory");
    before = await snapshot(path);
  } catch {
    fail("The destination directory must exist; the file must not be a directory or symbolic link."); return;
  }
  if (before && !await confirmAction(`Project: ${id}\nFile: ${path}\nAction: replace this local file with the downloaded sb3. Its current contents will be lost.`)) return;
  return { path, before };
}

async function snapshot(path: string): Promise<Snapshot> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Not a regular file");
    return { dev: info.dev, ino: info.ino, size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function execute(action: "validate" | "download" | "upload", payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const result = spawnScratchPython([pythonPath, scriptPath.pathname, action], {
    stdin: new Blob([JSON.stringify(payload)]),
    timeout: 125_000, maxBuffer: 75 * 1024 * 1024,
  });
  if (!result) return undefined;
  let response: unknown;
  try { response = JSON.parse(new TextDecoder().decode(result.stdout)); } catch { /* Never expose tracebacks. */ }
  if (!response || typeof response !== "object") {
    fail("Received an invalid project transfer response.");
    return undefined;
  }
  const data = response as Record<string, unknown>;
  if (result.exitCode !== 0 || data.error !== undefined) {
    fail(typeof data.error === "string" ? data.error.replace(/[\x00-\x1f\x7f-\x9f]/g, " ") : "Could not transfer the Scratch project.");
    return undefined;
  }
  if (data.action !== action) { fail("Received an invalid project transfer response."); return undefined; }
  return data;
}

// New files use an exclusive hard link; existing files are replaced only after
// consent and a second identity check. A failed write never truncates the target.
async function saveArchive(path: string, bytes: Buffer, before: Snapshot): Promise<void> {
  const temporary = await mkdtemp(join(dirname(path), ".scc-download-"));
  try {
    const staged = join(temporary, "project.sb3");
    await writeFile(staged, bytes, { mode: 0o600, flag: "wx" });
    if (before === null) {
      await link(staged, path);
    } else {
      if (JSON.stringify(await snapshot(path)) !== JSON.stringify(before)) throw new Error("Destination changed");
      await rename(staged, path);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function transferProject(args: TransferArguments, configPath?: string): Promise<void> {
  if (args.action === "upload") {
    let bytes: Buffer;
    let source: string;
    try {
      source = resolve(args.file!);
      const info = await stat(source);
      if (!info.isFile() || info.size < 1 || info.size > MAX_ARCHIVE) throw new Error("Invalid size");
      bytes = Buffer.from(await Bun.file(source).slice(0, MAX_ARCHIVE + 1).arrayBuffer());
      if (bytes.length < 1 || bytes.length > MAX_ARCHIVE) throw new Error("File changed");
    } catch {
      fail("Could not read the sb3 file. Provide a regular file between 1 byte and 50 MiB.");
      return;
    }
    const archive = bytes.toString("base64");
    const validated = execute("validate", { archive });
    if (validated?.valid !== true) {
      if (validated) fail("Received an invalid sb3 validation response.");
      return;
    }
    const account = await confirmAccountAction((account) => [
      `Account: ${account}`, `File: ${source}`,
      args.id === undefined ? `Action: create a new unshared project\nTitle: ${args.title ?? "Default title"}`
        : `Project: ${args.id}\nAction: overwrite this project's code, costumes, and sounds. This cannot be undone by this CLI. Title and sharing settings are not changed.`,
    ].join("\n"), configPath, args.id === undefined ? undefined : () => `overwrite ${args.id}`);
    if (!account) return;
    const config = await loadConfig(configPath);
    if (!config.scratchsessionsid) { fail("No active session. Run `scc login` first."); return; }
    console.log("Uploading project and assets; please wait...");
    const response = execute("upload", { archive, project_id: args.id, title: args.title, session_id: config.scratchsessionsid, expected_account: account });
    if (!response) return;
    if (response.account !== account || !Number.isSafeInteger(response.project_id) || (response.project_id as number) < 1
      || (args.id !== undefined && response.project_id !== args.id)) {
      fail("Could not verify the uploaded project. Check Scratch before retrying.");
      return;
    }
    console.log(`Uploaded project ${response.project_id} as ${account}.`);
    console.log(`URL: https://scratch.mit.edu/projects/${response.project_id}/`);
    return;
  }

  let destination = args.output === undefined ? undefined : await prepareDestination(resolve(args.output), args.id!);
  if (args.output !== undefined && !destination) return;
  const config = await loadConfig(configPath);
  console.log("Downloading project and assets; please wait...");
  const response = execute("download", { project_id: args.id, session_id: config.scratchsessionsid });
  if (!response) return;
  if (response.project_id !== args.id || !["sb", "sb2", "sb3"].includes(response.format as string)
    || (response.title !== null && typeof response.title !== "string") || typeof response.archive !== "string"
    || response.archive.length > Math.ceil(MAX_ARCHIVE / 3) * 4
    || response.archive.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(response.archive)) {
    fail("Received an invalid project download response."); return;
  }
  let bytes = Buffer.from(response.archive, "base64");
  if (bytes.length < 1 || bytes.length > MAX_ARCHIVE) { fail("Received an invalid project archive."); return; }
  const source = response.format as "sb" | "sb2" | "sb3";
  const format = args.format === "original" ? source : args.format ?? "sb3";
  const requestedExtension = args.output === undefined ? "" : extname(args.output).toLowerCase();
  if ([".sb", ".sb2", ".sb3"].includes(requestedExtension) && requestedExtension !== `.${format}`) {
    fail(`The selected format is ${format}. Use --output with a .${format} extension, change --format, or omit --output.`);
    return;
  }
  const validated = execute("validate", { archive: response.archive, format: source });
  if (validated?.valid !== true) {
    if (validated) fail("Received an invalid project archive validation response.");
    return;
  }
  if (source !== format) {
    if (format === "sb" || source === "sb3") { fail(`Conversion from ${source} to ${format} is not supported. Use --format original to keep the source format.`); return; }
    console.log(`Converting ${source} to ${format} offline; please wait...`);
    let converted: { format?: string; archive?: string; error?: string } | undefined;
    try {
      const result = Bun.spawnSync([process.execPath, new URL("../project-conversion.ts", import.meta.url).pathname], {
        stdin: new Blob([JSON.stringify({ archive: response.archive, source, target: format })]),
        stdout: "pipe", stderr: "pipe", timeout: 120_000, maxBuffer: 75 * 1024 * 1024,
      });
      if (!result.signalCode && result.exitCode === 0) converted = JSON.parse(new TextDecoder().decode(result.stdout));
    } catch { /* No third-party stack traces or project contents in errors. */ }
    if (converted?.format !== format || typeof converted.archive !== "string" || converted.archive.length > Math.ceil(MAX_ARCHIVE / 3) * 4) {
      fail("Could not convert the project safely. No file was saved. Use --format original to keep its source format."); return;
    }
    const checked = execute("validate", { archive: converted.archive, format });
    if (checked?.valid !== true) { if (checked) fail("Converted project archive could not be validated."); return; }
    bytes = Buffer.from(converted.archive, "base64");
    if (bytes.length < 1 || bytes.length > MAX_ARCHIVE) { fail("Converted project exceeds the size limit."); return; }
  }
  if (!destination) destination = await prepareDestination(resolve(downloadFilename(response.title as string | null, args.id!, format)), args.id!);
  if (!destination) return;
  try {
    await saveArchive(destination.path, bytes, destination.before);
    console.log(`Downloaded project ${args.id} to ${destination.path.replace(/[\x00-\x1f\x7f-\x9f]/g, " ")}.`);
  } catch {
    fail("Could not save the download safely. Check the directory, permissions, and whether the destination changed.");
  }
}
