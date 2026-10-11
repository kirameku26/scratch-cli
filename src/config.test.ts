import {
  afterEach,
  describe,
  expect,
  test,
} from "bun:test";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  loadConfig,
  saveConfig,
} from "./config.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("config", () => {
  test("saves and loads authentication data with private permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "scc-config-test-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "nested", "config.json");
    const config = {
      scratchsessionsid: "session-value",
      scratchcsrftoken: "csrf-value",
      "x-token": "token-value",
    };

    await saveConfig(config, path);

    expect(await loadConfig(path)).toEqual(config);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(config);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(directory, "nested"))).mode & 0o777).toBe(0o700);
  });

  test("returns an empty config when the file does not exist", async () => {
    const directory = await mkdtemp(join(tmpdir(), "scc-config-test-"));
    temporaryDirectories.push(directory);

    expect(await loadConfig(join(directory, "missing.json"))).toEqual({});
  });

  test("repairs permissions on an existing config file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "scc-config-test-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "config.json");
    await writeFile(path, "{}", { mode: 0o644 });

    await saveConfig({}, path);

    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});
