import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import initSqlJs from "sql.js";

import { decodeAntigravityOauthToken } from "./protobuf.js";

type SqlJsStatement = {
  bind: (params: Record<string, string>) => void;
  step: () => boolean;
  getAsObject: () => Record<string, unknown>;
  free: () => void;
};

type SqlJsDatabase = {
  prepare: (sql: string) => SqlJsStatement;
  close: () => void;
};

type LocalCredentialRecord = {
  accessToken?: string;
  refreshToken: string;
  credentialPath: string;
};

type PathRuntime = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  homeDir?: string;
  username?: string;
};

let sqlJsPromise: Promise<Awaited<ReturnType<typeof initSqlJs>>> | undefined;

export async function readLocalAntigravityCredentials(
  overridePath?: string,
): Promise<LocalCredentialRecord> {
  const dbPath = await resolveAntigravityStateDbPath(overridePath);
  const dbBuffer = await readFile(dbPath);
  const SQL = await getSqlJs();
  const db = new SQL.Database(new Uint8Array(dbBuffer)) as unknown as SqlJsDatabase;

  try {
    const oauthTokenRaw = readItemValue(
      db,
      "antigravityUnifiedStateSync.oauthToken",
    );
    if (!oauthTokenRaw) {
      throw new Error(
        "本地 Antigravity 数据库中缺少 antigravityUnifiedStateSync.oauthToken",
      );
    }

    const decodedOauth = decodeAntigravityOauthToken(oauthTokenRaw);
    return {
      accessToken: decodedOauth.accessToken,
      refreshToken: decodedOauth.refreshToken,
      credentialPath: dbPath,
    };
  } finally {
    db.close();
  }
}

export function getDefaultAntigravityStateDbCandidates(
  runtime: PathRuntime = {},
): string[] {
  return getDefaultAntigravityStateDbCandidatesForRuntime(runtime);
}

export function normalizeUserProvidedPath(
  inputPath: string,
  runtime: PathRuntime = {},
): string {
  const platform = runtime.platform ?? process.platform;
  const env = runtime.env ?? process.env;
  const cwd = runtime.cwd ?? process.cwd();
  const windowsPath = parseWindowsAbsolutePath(inputPath);

  if (windowsPath) {
    if (platform === "win32") {
      return path.win32.normalize(inputPath);
    }

    if (!isWslRuntime({ platform, env })) {
      throw new Error(
        `当前运行平台不是 Windows 或 WSL，无法直接访问 Windows 路径: ${inputPath}`,
      );
    }

    return windowsPathToWslPath(windowsPath[1], windowsPath[2]);
  }

  return platform === "win32"
    ? path.win32.resolve(cwd, inputPath)
    : path.resolve(cwd, inputPath);
}

function getDefaultAntigravityStateDbCandidatesForRuntime(
  runtime: PathRuntime = {},
): string[] {
  const platform = runtime.platform ?? process.platform;
  const env = runtime.env ?? process.env;
  const home = runtime.homeDir ?? os.homedir();
  const username = runtime.username ?? os.userInfo().username;

  if (platform === "darwin") {
    return [
      path.join(
        home,
        "Library",
        "Application Support",
        "Antigravity",
        "User",
        "globalStorage",
        "state.vscdb",
      ),
      path.join(
        home,
        "Library",
        "Application Support",
        "Antigravity",
        "state.vscdb",
      ),
    ];
  }

  if (platform === "win32") {
    const appData = env.APPDATA ?? path.win32.join(home, "AppData", "Roaming");

    return [
      path.win32.join(
        appData,
        "Antigravity",
        "User",
        "globalStorage",
        "state.vscdb",
      ),
      path.win32.join(appData, "Antigravity", "state.vscdb"),
    ];
  }

  const candidates = new Set<string>();
  if (isWslRuntime({ platform, env })) {
    for (const candidate of getWslStateDbCandidates({ env, username })) {
      candidates.add(candidate);
    }
  }

  const configHome = env.XDG_CONFIG_HOME ?? path.join(home, ".config");
  candidates.add(
    path.join(configHome, "Antigravity", "User", "globalStorage", "state.vscdb"),
  );
  candidates.add(path.join(configHome, "Antigravity", "state.vscdb"));

  return [...candidates];
}

async function resolveAntigravityStateDbPath(
  overridePath: string | undefined,
): Promise<string> {
  if (overridePath) {
    const resolved = normalizeUserProvidedPath(overridePath);
    if (!existsSync(resolved)) {
      throw new Error(`未找到本地 Antigravity 凭证数据库: ${resolved}`);
    }
    return resolved;
  }

  const candidates = getDefaultAntigravityStateDbCandidates();
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `未设置 ANTIBANANA_CREDENTIALS_PATH，且本地 Antigravity 凭证数据库不存在: ${candidates[0]}`,
  );
}

function readItemValue(db: SqlJsDatabase, key: string): string | undefined {
  const statement = db.prepare(
    "SELECT value FROM ItemTable WHERE key = $key LIMIT 1",
  );

  try {
    statement.bind({ $key: key });
    if (!statement.step()) {
      return undefined;
    }

    const row = statement.getAsObject();
    return typeof row.value === "string" ? row.value : undefined;
  } finally {
    statement.free();
  }
}

function getSqlJs(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs();
  }
  return sqlJsPromise;
}

function isWslRuntime(runtime: Pick<PathRuntime, "platform" | "env">): boolean {
  const platform = runtime.platform ?? process.platform;
  const env = runtime.env ?? process.env;
  return (
    platform === "linux" &&
    Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP)
  );
}

function parseWindowsAbsolutePath(inputPath: string): RegExpMatchArray | null {
  return inputPath.match(/^([A-Za-z]):[\\/](.*)$/);
}

function windowsPathToWslPath(driveLetter: string, remainder: string): string {
  const segments = remainder.split(/[\\/]+/).filter(Boolean);
  return path.posix.join("/mnt", driveLetter.toLowerCase(), ...segments);
}

function getWslStateDbCandidates(
  runtime: Pick<PathRuntime, "env" | "username">,
): string[] {
  const env = runtime.env ?? process.env;
  const username = runtime.username ?? os.userInfo().username;
  const candidates = new Set<string>();
  const appData = env.APPDATA;

  if (appData) {
    candidates.add(
      path.posix.join(
        normalizeUserProvidedPath(appData, {
          platform: "linux",
          env,
        }),
        "Antigravity",
        "User",
        "globalStorage",
        "state.vscdb",
      ),
    );
    candidates.add(
      path.posix.join(
        normalizeUserProvidedPath(appData, {
          platform: "linux",
          env,
        }),
        "Antigravity",
        "state.vscdb",
      ),
    );
  }

  const windowsHome = env.USERPROFILE
    ? normalizeUserProvidedPath(env.USERPROFILE, {
        platform: "linux",
        env,
      })
    : path.posix.join("/mnt/c/Users", username);

  candidates.add(
    path.posix.join(
      windowsHome,
      "AppData",
      "Roaming",
      "Antigravity",
      "User",
      "globalStorage",
      "state.vscdb",
    ),
  );
  candidates.add(
    path.posix.join(windowsHome, "AppData", "Roaming", "Antigravity", "state.vscdb"),
  );

  return [...candidates];
}
