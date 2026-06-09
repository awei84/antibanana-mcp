import os from "node:os";

const ANTIGRAVITY_RELEASES_URL =
  "https://antigravity-auto-updater-974169037036.us-central1.run.app/releases";
const ANTIGRAVITY_FALLBACK_VERSION = "1.21.9";
const ANTIGRAVITY_VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ANTIGRAVITY_VERSION_FETCH_TIMEOUT_MS = 10_000;

// 控制面调用（loadCodeAssist）在 UA 后追加该后缀，对齐真实 AG IDE 的 Node API 客户端指纹
const ANTIGRAVITY_NODE_API_CLIENT_UA = "google-api-nodejs-client/10.3.0";

type AntigravityRelease = {
  version?: string;
  execution_id?: string;
};

let cachedVersion: string | undefined;
let cacheExpiresAt = 0;
let inflightVersionPromise: Promise<string> | undefined;

export async function resolveDefaultAntigravityUserAgent(): Promise<string> {
  return buildUserAgent(await resolveAntigravityVersion());
}

// 控制面调用（loadCodeAssist）专用 UA：业务面 UA + Node API 客户端后缀
export async function resolveLoadCodeAssistUserAgent(): Promise<string> {
  const baseUa = buildUserAgent(await resolveAntigravityVersion());
  return `${baseUa} ${ANTIGRAVITY_NODE_API_CLIENT_UA}`;
}

export function buildUserAgent(
  version: string,
  runtime: { platform?: string; arch?: string } = {},
): string {
  return `antigravity/${version} ${runtime.platform ?? os.platform()}/${runtime.arch ?? os.arch()}`;
}

async function resolveAntigravityVersion(): Promise<string> {
  if (cachedVersion && Date.now() < cacheExpiresAt) {
    return cachedVersion;
  }

  if (!inflightVersionPromise) {
    inflightVersionPromise = fetchLatestAntigravityVersion()
      .then((version) => {
        cachedVersion = version;
        cacheExpiresAt = Date.now() + ANTIGRAVITY_VERSION_CACHE_TTL_MS;
        return version;
      })
      .finally(() => {
        inflightVersionPromise = undefined;
      });
  }

  return await inflightVersionPromise;
}

async function fetchLatestAntigravityVersion(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    ANTIGRAVITY_VERSION_FETCH_TIMEOUT_MS,
  );

  try {
    const response = await fetch(ANTIGRAVITY_RELEASES_URL, {
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(
        `[antibanana-mcp] 获取 Antigravity releases 失败: HTTP ${response.status}，改用内置 UA 版本 ${ANTIGRAVITY_FALLBACK_VERSION}`,
      );
      return ANTIGRAVITY_FALLBACK_VERSION;
    }

    const releases = (await response.json()) as AntigravityRelease[];
    const version = releases[0]?.version;

    if (!version) {
      console.error(
        `[antibanana-mcp] Antigravity releases 返回空版本，改用内置 UA 版本 ${ANTIGRAVITY_FALLBACK_VERSION}`,
      );
      return ANTIGRAVITY_FALLBACK_VERSION;
    }

    return version;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[antibanana-mcp] 获取 Antigravity releases 异常: ${message}，改用内置 UA 版本 ${ANTIGRAVITY_FALLBACK_VERSION}`,
    );
    return ANTIGRAVITY_FALLBACK_VERSION;
  } finally {
    clearTimeout(timeout);
  }
}

export function resetAntigravityUserAgentCacheForTest(): void {
  cachedVersion = undefined;
  cacheExpiresAt = 0;
  inflightVersionPromise = undefined;
}
