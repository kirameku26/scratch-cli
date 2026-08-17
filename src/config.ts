import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import { homedir } from "node:os";
import { join } from "node:path";

const configDir = join(
  homedir(),
  ".config",
  "scc",
);

const configPath = join(
  configDir,
  "config.json",
);

export interface Config {
  scratchcsrftoken?: string;
  scratchsessionsid?: string;
  "x-token"?: string;
}

export async function loadConfig(): Promise<Config> {
  try {
    const data = await readFile(
      configPath,
      "utf8",
    );

    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function saveConfig(
  config: Config,
): Promise<void> {
  await mkdir(configDir, {
    recursive: true,
    mode: 0o700,
  });

  await writeFile(
    configPath,
    JSON.stringify(config, null, 2),
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
}