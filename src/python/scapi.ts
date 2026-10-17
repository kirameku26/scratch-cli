import { venvDir } from "./index.ts";
import { confirmAction } from "../confirmation.ts";

const pythonPath = `${venvDir}/bin/python`;

export async function getScapiVersion(): Promise<string | null> {
  const result = Bun.spawnSync([
    pythonPath,
    "-c",
    "import scapi; print(getattr(scapi, '__version__', 'unknown'))",
  ], { timeout: 15_000 });

  if (result.exitCode !== 0) {
    return null;
  }

  return new TextDecoder()
    .decode(result.stdout)
    .trim();
}

export async function isScapiInstalled(): Promise<boolean> {
  return (await getScapiVersion()) !== null;
}

async function getLatestScapiVersion(): Promise<string | null> {
  const result = Bun.spawnSync([
    pythonPath,
    "-m",
    "pip",
    "index",
    "versions",
    "scapi",
  ], { timeout: 30_000 });

  if (result.exitCode !== 0) {
    return null;
  }

  const output = new TextDecoder()
    .decode(result.stdout);

  const match = output.match(
    /LATEST:\s*([^\s]+)/,
  );

  return match?.[1] ?? null;
}

export async function installScapi(): Promise<boolean> {
  if (!await confirmAction(`Python environment: ${venvDir}\nAction: install Scapi and its dependencies in this environment`)) return false;
  console.log("Installing Scapi...");

  const result = Bun.spawnSync([
    pythonPath,
    "-m",
    "pip",
    "install",
    "scapi",
  ], {
    timeout: 120_000,
    stdout: "inherit",
    stderr: "inherit",
  });

  return result.exitCode === 0;
}

export async function updateScapi(): Promise<boolean> {
  if (!await confirmAction(`Python environment: ${venvDir}\nAction: upgrade Scapi and its dependencies in this environment`)) return false;
  console.log("Updating Scapi...");

  const result = Bun.spawnSync([
    pythonPath,
    "-m",
    "pip",
    "install",
    "--upgrade",
    "scapi",
  ], {
    timeout: 120_000,
    stdout: "inherit",
    stderr: "inherit",
  });

  return result.exitCode === 0;
}

export async function ensureScapi(): Promise<boolean> {
  const currentVersion =
    await getScapiVersion();

  if (!currentVersion) {
    return await installScapi();
  }

  console.log(
    `Scapi ${currentVersion} is installed.`,
  );

  const latestVersion =
    await getLatestScapiVersion();

  if (!latestVersion) {
    console.log(
      "Could not check for Scapi updates.",
    );

    return true;
  }

  if (currentVersion === latestVersion) {
    console.log(
      "Scapi is up to date.",
    );

    return true;
  }

  console.log(
    `Scapi update available: ${currentVersion} -> ${latestVersion}`,
  );

  const updated =
    await updateScapi();

  if (!updated) {
    return false;
  }

  console.log(
    "Scapi updated successfully.",
  );

  return true;
}
