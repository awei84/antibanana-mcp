import https from "node:https";
import type { Agent as HttpAgent } from "node:http";

import { HttpsProxyAgent } from "https-proxy-agent";

import type { CredentialManager } from "./credentials.js";
import { resolveDefaultAntigravityUserAgent } from "./antigravity-user-agent.js";

const DEFAULT_BASE_URL = "https://cloudcode-pa.googleapis.com";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_AUTH_RETRY_LIMIT = 1;

export class AntigravityApiError extends Error {
  readonly statusCode: number;
  readonly responseBody: string;
  readonly retryAfterMs?: number;

  constructor(params: {
    statusCode: number;
    statusMessage?: string;
    responseBody: string;
    retryAfterMs?: number;
  }) {
    super(
      `Antigravity API 请求失败: ${params.statusCode} ${params.statusMessage ?? ""}\n${params.responseBody}`,
    );
    this.name = "AntigravityApiError";
    this.statusCode = params.statusCode;
    this.responseBody = params.responseBody;
    this.retryAfterMs = params.retryAfterMs;
  }
}

export class AntigravityTransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AntigravityTransportError";
  }
}

export class AntigravityTransport {
  private readonly baseUrl: URL;
  private readonly credentialManager: CredentialManager;
  private readonly userAgentOverride?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly authRetryLimit: number;
  private readonly agent: HttpAgent;

  constructor(options: {
    credentialManager: CredentialManager;
    baseUrl?: string;
    userAgent?: string;
    timeoutMs?: number;
    maxRetries?: number;
    authRetryLimit?: number;
    proxyUrl?: string;
  }) {
    this.credentialManager = options.credentialManager;
    this.baseUrl = new URL(options.baseUrl ?? DEFAULT_BASE_URL);
    this.userAgentOverride = options.userAgent;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.authRetryLimit = options.authRetryLimit ?? DEFAULT_AUTH_RETRY_LIMIT;
    this.agent = buildRequestAgent(options.proxyUrl);
  }

  async postJson(pathname: string, body: unknown): Promise<unknown> {
    let lastError: unknown;
    let authRetryCount = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.postJsonOnce(pathname, body);
      } catch (error) {
        lastError = error;

        if (
          error instanceof AntigravityApiError &&
          (error.statusCode === 401 || error.statusCode === 403) &&
          authRetryCount < this.authRetryLimit
        ) {
          authRetryCount += 1;
          await this.credentialManager.forceRefreshAccessToken();
          attempt -= 1;
          continue;
        }

        if (!shouldRetry(error) || attempt === this.maxRetries) {
          throw error;
        }

        await sleep(getRetryDelayMs(error, attempt));
      }
    }

    throw lastError;
  }

  private async postJsonOnce(pathname: string, body: unknown): Promise<unknown> {
    const accessToken = await this.credentialManager.getAccessToken();
    const payload = JSON.stringify(body);
    const requestUrl = new URL(pathname, this.baseUrl);
    const userAgent =
      this.userAgentOverride ?? await resolveDefaultAntigravityUserAgent();

    return await new Promise<unknown>((resolve, reject) => {
      const request = https.request(
        {
          protocol: requestUrl.protocol,
          hostname: requestUrl.hostname,
          port: requestUrl.port || 443,
          path: `${requestUrl.pathname}${requestUrl.search}`,
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": userAgent,
            "Content-Type": "application/json",
            Connection: "close",
            "Content-Length": Buffer.byteLength(payload),
          },
          agent: this.agent,
        },
        (response) => {
          const chunks: Buffer[] = [];

          response.on("error", (error) => {
            reject(
              new AntigravityTransportError("Antigravity API 响应流读取失败", {
                cause: error,
              }),
            );
          });

          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

          response.on("end", () => {
            const responseBody = Buffer.concat(chunks).toString("utf8");
            const statusCode = response.statusCode ?? 0;

            if (statusCode < 200 || statusCode >= 300) {
              reject(
                new AntigravityApiError({
                  statusCode,
                  statusMessage: response.statusMessage,
                  responseBody,
                  retryAfterMs: parseRetryAfterMs(response.headers["retry-after"]),
                }),
              );
              return;
            }

            try {
              resolve(JSON.parse(responseBody));
            } catch (error) {
              reject(
                new Error(
                  `Antigravity API 响应不是合法 JSON: ${(error as Error).message}\n${responseBody}`,
                ),
              );
            }
          });
        },
      );

      request.setTimeout(this.timeoutMs, () => {
        request.destroy(
          new AntigravityTransportError(
            `Antigravity API 请求超时，${this.timeoutMs}ms 内未返回`,
          ),
        );
      });

      request.on("error", (error) => {
        reject(
          new AntigravityTransportError("Antigravity API 网络请求失败", {
            cause: error,
          }),
        );
      });
      request.write(payload);
      request.end();
    });
  }
}

function parseRetryAfterMs(
  retryAfterHeader: string | string[] | undefined,
): number | undefined {
  const value = Array.isArray(retryAfterHeader)
    ? retryAfterHeader[0]
    : retryAfterHeader;

  if (!value) {
    return undefined;
  }

  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }

  return Math.max(0, timestamp - Date.now());
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof AntigravityApiError) {
    return error.statusCode === 429 || error.statusCode >= 500;
  }

  return error instanceof AntigravityTransportError;
}

function getRetryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof AntigravityApiError && error.retryAfterMs !== undefined) {
    return error.retryAfterMs;
  }

  return DEFAULT_RETRY_BASE_DELAY_MS * 2 ** attempt;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRequestAgent(proxyUrl: string | undefined): HttpAgent {
  if (proxyUrl) {
    return new HttpsProxyAgent(proxyUrl);
  }

  return new https.Agent({ keepAlive: false });
}
