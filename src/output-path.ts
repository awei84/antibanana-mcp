import os from "node:os";
import path from "node:path";

import { normalizeUserProvidedPath } from "./local-antigravity-db.js";

type OutputPathRuntime = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  homeDir?: string;
};

export function resolveOutputPath(
  inputPath: string,
  runtime: OutputPathRuntime = {},
): string {
  const platform = runtime.platform ?? process.platform;
  const homeDir = runtime.homeDir ?? os.homedir();
  const expandedPath = expandHomeShortcut(inputPath, { platform, homeDir });

  return normalizeUserProvidedPath(expandedPath, {
    platform,
    env: runtime.env,
    cwd: runtime.cwd,
    homeDir,
  });
}

function expandHomeShortcut(
  inputPath: string,
  runtime: Pick<OutputPathRuntime, "platform" | "homeDir">,
): string {
  if (!inputPath.startsWith("~/") && !inputPath.startsWith("~\\")) {
    return inputPath;
  }

  const homeDir = runtime.homeDir ?? os.homedir();
  const relativePath = inputPath.slice(2);

  return runtime.platform === "win32"
    ? path.win32.resolve(homeDir, relativePath)
    : path.resolve(homeDir, relativePath);
}
