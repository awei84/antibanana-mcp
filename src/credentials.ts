import { OAuth2Client } from "google-auth-library";
import { readFile } from "node:fs/promises";

import {
  normalizeUserProvidedPath,
  readLocalAntigravityCredentials,
} from "./local-antigravity-db.js";
import { credentialFileSchema, type CredentialFile } from "./types.js";

export const ANTIGRAVITY_OAUTH_CLIENT_ID =
  "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
export const ANTIGRAVITY_OAUTH_CLIENT_SECRET =
  "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";
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

export type CredentialPathSource =
  | "显式传入的凭证路径"
  | "env.ANTIBANANA_CREDENTIALS_PATH"
  | "本地 Antigravity state.vscdb";

export type CredentialProjectIdSource =
  | "credential.project_id"
  | "credential.project";

type CredentialManagerOptions = {
  credentialPath?: string;
  credentialPathSource?: Exclude<CredentialPathSource, "本地 Antigravity state.vscdb">;
  localStateDbPath?: string;
};

export type LoadedCredentialSource = {
  credentialPath: string;
  credentialPathSource: CredentialPathSource;
  accessToken?: string;
  refreshToken: string;
  expiryDate?: number;
  projectId?: string;
  projectIdSource?: CredentialProjectIdSource;
};

export class CredentialManager {
  readonly credentialPath: string;
  readonly credentialPathSource: CredentialPathSource;
  readonly authClient: OAuth2Client;

  private constructor(
    loadedSource: LoadedCredentialSource,
    authClient: OAuth2Client,
  ) {
    this.credentialPath = loadedSource.credentialPath;
    this.credentialPathSource = loadedSource.credentialPathSource;
    this.authClient = authClient;
  }

  static async fromFile(rawPath: string): Promise<CredentialManager> {
    const loadedSource = await loadCredentialSource({
      credentialPath: rawPath,
      credentialPathSource: "显式传入的凭证路径",
    });
    return CredentialManager.fromLoadedSource(loadedSource);
  }

  static async fromSources(
    options: CredentialManagerOptions = {},
  ): Promise<CredentialManager> {
    const loadedSource = await loadCredentialSource(options);
    return CredentialManager.fromLoadedSource(loadedSource);
  }

  static fromLoadedSource(loadedSource: LoadedCredentialSource): CredentialManager {
    const authClient = new OAuth2Client({
      clientId: ANTIGRAVITY_OAUTH_CLIENT_ID,
      clientSecret: ANTIGRAVITY_OAUTH_CLIENT_SECRET,
      eagerRefreshThresholdMillis: TOKEN_REFRESH_SKEW_MS,
      forceRefreshOnFailure: true,
    });

    authClient.setCredentials({
      access_token: loadedSource.accessToken,
      refresh_token: loadedSource.refreshToken,
      expiry_date: loadedSource.expiryDate,
    });

    return new CredentialManager(loadedSource, authClient);
  }

  async getAccessToken(): Promise<string> {
    const token = await this.authClient.getAccessToken();
    return extractAccessToken(token.token, this.credentialPath);
  }

  async forceRefreshAccessToken(): Promise<string> {
    const refreshed = await this.authClient.refreshAccessToken();
    return extractAccessToken(
      refreshed.credentials.access_token,
      this.credentialPath,
    );
  }
}

export async function loadCredentialSource(
  options: CredentialManagerOptions = {},
): Promise<LoadedCredentialSource> {
  if (options.credentialPath) {
    const credentialPath = normalizeUserProvidedPath(options.credentialPath);
    const parsed = await readCredentialFile(credentialPath);
    return {
      credentialPath,
      credentialPathSource:
        options.credentialPathSource ?? "显式传入的凭证路径",
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token,
      expiryDate: parseExpiryDate(parsed),
      ...resolveCredentialProjectId(parsed),
    };
  }

  const localCredentials = await readLocalAntigravityCredentials(
    options.localStateDbPath,
  );
  return {
    credentialPath: localCredentials.credentialPath,
    credentialPathSource: "本地 Antigravity state.vscdb",
    accessToken: undefined,
    refreshToken: localCredentials.refreshToken,
  };
}

async function readCredentialFile(credentialPath: string): Promise<CredentialFile> {
  let raw: string;

  try {
    raw = await readFile(credentialPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`未找到凭证文件: ${credentialPath}`);
    }

    throw error;
  }

  const parsed = JSON.parse(raw);
  // 支持数组格式（多账号文件），取第一个元素
  const data = Array.isArray(parsed) ? parsed[0] : parsed;
  return credentialFileSchema.parse(data);
}

function extractAccessToken(
  accessToken: string | null | undefined,
  credentialPath: string,
): string {
  if (!accessToken) {
    throw new Error(
      `未能从 Google OAuth 客户端获取 access_token，凭证来源: ${credentialPath}`,
    );
  }

  return accessToken;
}

function resolveCredentialProjectId(
  parsed: CredentialFile,
): { projectId?: string; projectIdSource?: CredentialProjectIdSource } {
  if (parsed.project && parsed.project_id && parsed.project !== parsed.project_id) {
    throw new Error(
      `凭证文件中的 project 与 project_id 不一致: ${parsed.project} !== ${parsed.project_id}`,
    );
  }

  const projectId = parsed.project_id ?? parsed.project;
  if (!projectId) {
    return {};
  }

  return {
    projectId,
    projectIdSource: parsed.project_id
      ? "credential.project_id"
      : "credential.project",
  };
}

function parseExpiryDate(parsed: CredentialFile): number | undefined {
  if (parsed.expired) {
    const expiryDate = Date.parse(parsed.expired);
    if (Number.isNaN(expiryDate)) {
      throw new Error(`凭证文件中的 expired 字段不是合法时间: ${parsed.expired}`);
    }

    return expiryDate;
  }

  if (parsed.expiry_date !== undefined) {
    return parsed.expiry_date;
  }

  if (parsed.expires_in !== undefined) {
    return Date.now() + parsed.expires_in * 1000;
  }

  return undefined;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
