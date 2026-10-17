import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const require = createRequire(import.meta.url);
const MAX_ARCHIVE = 50 * 1024 * 1024;
const MAX_CONTENTS = 100 * 1024 * 1024;

function digest(bytes: Uint8Array): string { return createHash("md5").update(bytes).digest("hex"); }

export async function completeSb1Archive(data: any, zip: JSZip): Promise<void> {
  // The upstream converter supplies a placeholder penLayerID/hash, not a ZIP
  // member. Give the empty pen layer its own file instead of colliding with a
  // costume numbered 0. Use hashes of the encoded bytes for all local assets.
  for (const target of [data, ...(data.children ?? [])]) {
    for (const [items, idKey, hashKey] of [[target.costumes ?? [], "baseLayerID", "baseLayerMD5"], [target.sounds ?? [], "soundID", "md5"]] as const) {
      for (const item of items) {
        const extension = item[hashKey].split(".").at(-1);
        const file = zip.file(`${item[idKey]}.${extension}`);
        if (!file) throw new Error("Missing converted asset");
        item[hashKey] = `${digest(await file.async("nodebuffer"))}.${extension}`;
      }
    }
  }
  const penId = Math.max(0, ...Object.keys(zip.files).map((name) => Number.parseInt(name, 10)).filter(Number.isFinite)) + 1;
  const pen = await createCanvas(480, 360).encode("png");
  data.penLayerID = penId; data.penLayerMD5 = `${digest(pen)}.png`;
  zip.file(`${penId}.png`, pen);
}

async function sb2Input(bytes: Buffer, source: "sb" | "sb2"): Promise<{ data: any; zip: JSZip }> {
  if (source === "sb2") {
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const file = zip.file("project.json");
    if (!file) throw new Error("Missing project JSON");
    return { data: JSON.parse(await file.async("string")), zip };
  }
  const root = join(dirname(require.resolve("scratch-sb1-converter")), "..");
  const { SB1File } = require(join(root, "index.js"));
  const old = new SB1File(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const data = old.json;
  const zip = new JSZip();
  let total = 0;
  const files = old.zip.files;
  if (Object.keys(files).length > 200) throw new Error("Too many assets");
  for (const [name, entry] of Object.entries(files) as Array<[string, { bytes: Uint8Array }]>) {
    total += entry.bytes.length;
    if (entry.bytes.length > 10 * 1024 * 1024 || total > MAX_CONTENTS) throw new Error("Oversized asset");
    zip.file(name, entry.bytes);
  }
  await completeSb1Archive(data, zip);
  return { data, zip };
}

// The headless VM keeps costumes without a renderer. Merge old text bitmaps
// first, otherwise serialization would silently drop their separate layer.
async function mergeTextLayers(data: any, zip: JSZip): Promise<void> {
  let nextId = Math.max(0, ...Object.keys(zip.files).map((name) => Number.parseInt(name, 10)).filter(Number.isFinite)) + 1;
  for (const target of [data, ...(data.children ?? [])]) {
    for (const costume of target.costumes ?? []) {
      if (!costume.textLayerMD5) continue;
      const extension = costume.baseLayerMD5.split(".")[1] || "png";
      if (!["png", "jpg", "jpeg"].includes(extension)) throw new Error("Unsupported text-layer base image");
      const base = zip.file(`${costume.baseLayerID}.${extension}`), text = zip.file(`${costume.textLayerID}.png`);
      if (!base || !text) throw new Error("Missing text-layer image");
      const buffers = await Promise.all([base.async("nodebuffer"), text.async("nodebuffer")]);
      for (const buffer of buffers) {
        // PNG width/height are big-endian IHDR fields. Check before decoding.
        const png = buffer.length >= 24 && buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
        const jpeg = buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
        if ((!png && !jpeg) || (png && buffer.readUInt32BE(16) * buffer.readUInt32BE(20) > 16_777_216)) throw new Error("Invalid or oversized text-layer bitmap");
      }
      const [image, overlay] = await Promise.all(buffers.map((buffer) => loadImage(buffer)));
      if ([image!, overlay!].some((item) => item.width * item.height > 16_777_216)) throw new Error("Oversized bitmap");
      const canvas = createCanvas(image!.width, image!.height);
      const context = canvas.getContext("2d");
      context.drawImage(image!, 0, 0); context.drawImage(overlay!, 0, 0);
      const merged = await canvas.encode("png");
      // Other costumes may share the base bitmap without sharing its text.
      costume.baseLayerID = nextId++;
      zip.file(`${costume.baseLayerID}.png`, merged);
      costume.baseLayerMD5 = `${digest(merged)}.png`;
      delete costume.textLayerMD5; delete costume.textLayerID;
    }
  }
}

export async function convertProject(bytes: Buffer, source: "sb" | "sb2" | "sb3", target: "sb" | "sb2" | "sb3"): Promise<Buffer> {
  if (bytes.length < 1 || bytes.length > MAX_ARCHIVE) throw new Error("Invalid project size");
  if (source === target) return bytes;
  if (target === "sb" || source === "sb3") throw new Error("Downgrading projects is not supported");
  const { data, zip } = await sb2Input(bytes, source as "sb" | "sb2");
  if (target === "sb2") {
    zip.file("project.json", JSON.stringify(data));
    const result = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    if (result.length > MAX_ARCHIVE) throw new Error("Converted project too large");
    return result;
  }
  await mergeTextLayers(data, zip);
  zip.file("project.json", JSON.stringify(data));
  // Pin the VM version and use its source entry: the published Node bundle's
  // jsdom stylesheet lookup is broken under Bun. No vendor files are modified.
  const vmRoot = join(dirname(require.resolve("@scratch/scratch-vm")), "../..");
  const VM = require(join(vmRoot, "src/virtual-machine.js"));
  const Storage = require("@scratch/scratch-storage").ScratchStorage;
  const vm = new VM();
  const log = require(join(vmRoot, "src/util/log.js"));
  const originalWarn = log.warn;
  let unsupported = false;
  log.warn = (...args: unknown[]) => {
    if (args.some((value) => typeof value === "string" && /Couldn't find SB2 block|Unknown input operation|Could not find monitor block/.test(value))) unsupported = true;
    originalWarn.apply(log, args);
  };
  const targets = [data, ...(data.children ?? []).filter((item: any) => typeof item.objName === "string")];
  try {
    vm.attachStorage(new Storage()); // No network stores or renderer are attached.
    vm.extensionManager.loadExtensionURL = async (id: string) => {
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(id)) throw new Error("External extensions are not allowed");
      vm.extensionManager.loadExtensionIdSync(id);
      if (!vm.extensionManager.isExtensionLoaded(id)) throw new Error("Unsupported extension");
    };
    await vm.loadProject(await zip.generateAsync({ type: "nodebuffer" }));
    if (unsupported) throw new Error("Unsupported blocks or monitors would be lost");
    const output = JSON.parse(vm.toJSON());
    if (output.targets.length !== targets.length) throw new Error("A target was lost during conversion");
    for (let index = 0; index < targets.length; index++) {
      if (output.targets[index].costumes.length !== (targets[index].costumes ?? []).length
        || output.targets[index].sounds.length !== (targets[index].sounds ?? []).length) throw new Error("Assets were lost during conversion");
    }
    const result = Buffer.from(await (await vm.saveProjectSb3()).arrayBuffer());
    if (result.length > MAX_ARCHIVE) throw new Error("Converted project too large");
    return result;
  } finally { log.warn = originalWarn; vm.quit(); vm.clear(); }
}

if (import.meta.main) {
  // Third-party diagnostics must not corrupt the JSON protocol or reveal content.
  for (const method of ["log", "warn", "error", "info", "debug"] as const) console[method] = () => {};
  globalThis.fetch = (() => { throw new Error("Conversion is offline"); }) as unknown as typeof fetch;
  try {
    const payload = await Bun.stdin.json();
    if (!["sb", "sb2", "sb3"].includes(payload.source) || !["sb", "sb2", "sb3"].includes(payload.target)
      || typeof payload.archive !== "string" || payload.archive.length > Math.ceil(MAX_ARCHIVE / 3) * 4) throw new Error("Invalid conversion input");
    const bytes = await convertProject(Buffer.from(payload.archive, "base64"), payload.source, payload.target);
    process.stdout.write(JSON.stringify({ format: payload.target, archive: bytes.toString("base64") }));
  } catch {
    process.stdout.write(JSON.stringify({ error: "Could not convert the project safely. Downgrades are not supported; use --format original to keep the source data." }));
    process.exitCode = 1;
  }
}
