import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { completeSb1Archive } from "./project-conversion.ts";

const worker = new URL("./project-conversion.ts", import.meta.url).pathname;
const hash = (bytes: Uint8Array) => createHash("md5").update(bytes).digest("hex");

test("Scratch 1 conversion replaces placeholder pen IDs without overwriting costumes", async () => {
  const canvas = createCanvas(2, 2);
  canvas.getContext("2d").fillStyle = "red"; canvas.getContext("2d").fillRect(0, 0, 2, 2);
  const png = await canvas.encode("png"), zip = new JSZip();
  zip.file("0.png", png);
  const data = { objName: "Stage", children: [], penLayerID: 0, penLayerMD5: `${"0".repeat(32)}.png`,
    costumes: [{ baseLayerID: 0, baseLayerMD5: `${"1".repeat(32)}.png` }], sounds: [] };
  await completeSb1Archive(data, zip);
  expect(data.penLayerID).not.toBe(0);
  expect(data.costumes[0]!.baseLayerMD5).toBe(`${hash(png)}.png`);
  expect(await zip.file("0.png")!.async("nodebuffer")).toEqual(png);
  expect(hash(await zip.file(`${data.penLayerID}.png`)!.async("nodebuffer"))).toBe(data.penLayerMD5.split(".")[0]!);
});

function run(archive: Buffer, source = "sb2", target = "sb3") {
  const result = Bun.spawnSync([process.execPath, worker], {
    stdin: new Blob([JSON.stringify({ archive: archive.toString("base64"), source, target })]),
    stdout: "pipe", stderr: "pipe", timeout: 30_000,
  });
  return { code: result.exitCode, response: JSON.parse(new TextDecoder().decode(result.stdout)) };
}

test("headless conversion preserves blocks, sounds, costumes, and separate text-layer appearances", async () => {
  const base = createCanvas(2, 2), overlay = createCanvas(2, 2);
  base.getContext("2d").fillStyle = "red"; base.getContext("2d").fillRect(0, 0, 2, 2);
  overlay.getContext("2d").fillStyle = "blue"; overlay.getContext("2d").fillRect(0, 0, 1, 1);
  const png = await base.encode("png"), text = await overlay.encode("png");
  const wav = Buffer.alloc(46);
  wav.write("RIFF", 0); wav.writeUInt32LE(38, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(2, 40);
  const costume = { costumeName: "Costume", baseLayerID: 1, baseLayerMD5: `${hash(png)}.png`, bitmapResolution: 1, rotationCenterX: 1, rotationCenterY: 1 };
  const sprite = { objName: "Sprite", costumes: [costume], sounds: [], scripts: [], variables: [], lists: [], currentCostumeIndex: 0,
    scratchX: 0, scratchY: 0, scale: 1, direction: 90, rotationStyle: "normal", isDraggable: false, visible: true, spriteInfo: {} };
  const data = { objName: "Stage", children: [sprite], costumes: [{ ...costume, textLayerID: 2, textLayerMD5: `${hash(text)}.png` }],
    sounds: [{ soundName: "Tone", soundID: 0, md5: `${hash(wav)}.wav`, sampleCount: 1, rate: 22050, format: "" }],
    scripts: [[0, 0, [["whenGreenFlag"], ["say:", "Hello"]]]], variables: [], lists: [], currentCostumeIndex: 0,
    tempoBPM: 60, videoAlpha: 0.5, penLayerMD5: "", penLayerID: -1 };
  const zip = new JSZip();
  zip.file("project.json", JSON.stringify(data)); zip.file("1.png", png); zip.file("2.png", text); zip.file("0.wav", wav);
  const result = run(await zip.generateAsync({ type: "nodebuffer" }));
  expect(result.code).toBe(0);
  expect(result.response.format).toBe("sb3");
  const output = await JSZip.loadAsync(Buffer.from(result.response.archive, "base64"));
  const project = JSON.parse(await output.file("project.json")!.async("string"));
  expect(project.targets).toHaveLength(2);
  expect(Object.values(project.targets[0].blocks).map((block: any) => block.opcode)).toContain("event_whenflagclicked");
  expect(Object.values(project.targets[0].blocks).map((block: any) => block.opcode)).toContain("looks_say");
  expect(project.targets[0].sounds[0].assetId).toBe(hash(wav));
  expect(await output.file(`${hash(wav)}.wav`)!.async("nodebuffer")).toEqual(wav);
  const stageCostume = project.targets[0].costumes[0], spriteCostume = project.targets[1].costumes[0];
  expect(stageCostume.assetId).not.toBe(spriteCostume.assetId);
  expect(spriteCostume.assetId).toBe(hash(png));
  const merged = await output.file(`${stageCostume.assetId}.png`)!.async("nodebuffer");
  expect(hash(merged)).toBe(stageCostume.assetId);
  const view = createCanvas(2, 2), context = view.getContext("2d");
  context.drawImage(await loadImage(merged), 0, 0);
  expect([...context.getImageData(0, 0, 1, 1).data]).toEqual([0, 0, 255, 255]);
  expect([...context.getImageData(1, 1, 1, 1).data]).toEqual([255, 0, 0, 255]);
}, 30_000);

test("unsupported downgrades and corrupt input fail without exposing project contents", () => {
  for (const [source, target] of [["sb3", "sb2"], ["sb2", "sb"], ["sb", "sb3"]]) {
    const result = run(Buffer.from("private project contents"), source!, target!);
    expect(result.code).toBe(1);
    expect(JSON.stringify(result.response)).not.toContain("private project contents");
    expect(result.response.error).toContain("--format original");
  }
}, 30_000);

test("unknown old blocks cannot be silently dropped during conversion", async () => {
  const zip = new JSZip();
  zip.file("project.json", JSON.stringify({ objName: "Stage", children: [], costumes: [], sounds: [], variables: [], lists: [],
    scripts: [[0, 0, [["whenGreenFlag"], ["privateUnknownOpcode"]]]], currentCostumeIndex: 0, tempoBPM: 60,
    videoAlpha: 0.5, penLayerMD5: "", penLayerID: -1 }));
  const result = run(await zip.generateAsync({ type: "nodebuffer" }));
  expect(result.code).toBe(1);
  expect(result.response.error).toContain("--format original");
  expect(JSON.stringify(result.response)).not.toContain("privateUnknownOpcode");
}, 30_000);
