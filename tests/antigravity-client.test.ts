import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { HttpsProxyAgent } from "https-proxy-agent";
import initSqlJs from "sql.js";

import { AntigravityClient } from "../src/antigravity-client.ts";
import {
  AntigravityApiError,
  AntigravityTransport,
  AntigravityTransportError,
} from "../src/antigravity-transport.ts";
import {
  CredentialManager,
  loadCredentialSource,
} from "../src/credentials.ts";
import {
  getDefaultAntigravityStateDbCandidates,
  normalizeUserProvidedPath,
} from "../src/local-antigravity-db.ts";
import { decodeAntigravityOauthToken } from "../src/protobuf.ts";
import { ProjectIdResolver } from "../src/project-id-resolver.ts";

const modelsResponse = {
  models: {
    "gemini-3.1-flash-image": {
      displayName: "Gemini 3.1 Flash Image",
      quotaInfo: {
        remainingFraction: 1,
        resetTime: "2026-03-28T17:00:17Z",
      },
      apiProvider: "API_PROVIDER_GOOGLE_GEMINI",
      modelProvider: "MODEL_PROVIDER_GOOGLE",
    },
  },
  imageGenerationModelIds: ["gemini-3.1-flash-image"],
  defaultAgentModelId: "gemini-3.1-pro-high",
};

const generateResponse = {
  response: {
    candidates: [
      {
        content: {
          role: "model",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: "ZmFrZS1pbWFnZQ==",
              },
            },
          ],
        },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    },
    modelVersion: "gemini-3.1-flash-image",
    responseId: "resp-1",
  },
  traceId: "trace-1",
};

test("CredentialManager 在缺少 expired 时会用 expires_in 推导 expiry_date", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "antibanana-test-"));

  try {
    const credentialPath = path.join(tempDir, "credential.json");
    const start = Date.now();

    await writeFile(
      credentialPath,
      JSON.stringify({
        access_token: "old-token",
        refresh_token: "refresh-token",
        expires_in: 120,
        project: "demo-project",
      }),
      "utf8",
    );

    const loaded = await loadCredentialSource({
      credentialPath,
      credentialPathSource: "显式传入的凭证路径",
    });
    const manager = CredentialManager.fromLoadedSource(loaded);
    const expiryDate = manager.authClient.credentials.expiry_date;

    assert.ok(typeof expiryDate === "number");
    assert.ok(expiryDate >= start + 110_000);
    assert.ok(expiryDate <= Date.now() + 121_000);
    assert.equal(loaded.projectId, "demo-project");
    assert.equal(loaded.projectIdSource, "credential.project");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("显式 JSON 凭证支持直接读取 expiry_date 毫秒时间戳", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "antibanana-test-"));

  try {
    const credentialPath = path.join(tempDir, "credential.json");
    await writeFile(
      credentialPath,
      JSON.stringify({
        access_token: "old-token",
        refresh_token: "refresh-token",
        expiry_date: 1_769_149_695_621,
        project_id: "demo-project-id",
      }),
      "utf8",
    );

    const loaded = await loadCredentialSource({
      credentialPath,
      credentialPathSource: "显式传入的凭证路径",
    });
    const manager = CredentialManager.fromLoadedSource(loaded);
    assert.equal(manager.authClient.credentials.expiry_date, 1_769_149_695_621);
    assert.equal(loaded.projectId, "demo-project-id");
    assert.equal(loaded.projectIdSource, "credential.project_id");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("CredentialManager.forceRefreshAccessToken 会返回刷新后的 token", async () => {
  const manager = CredentialManager.fromLoadedSource({
    credentialPath: "/tmp/mock.json",
    credentialPathSource: "显式传入的凭证路径",
    refreshToken: "refresh-token",
  });
  manager.authClient.refreshAccessToken = async () =>
    ({
      credentials: {
        access_token: "fresh-token",
      },
    }) as never;

  const token = await manager.forceRefreshAccessToken();
  assert.equal(token, "fresh-token");
});

test("protobuf 解码可以从 unifiedStateSync.oauthToken 提取 access_token 和 refresh_token", () => {
  const raw = buildUnifiedStateSyncValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
  });

  const decoded = decodeAntigravityOauthToken(raw);
  assert.equal(decoded.accessToken, "access-token");
  assert.equal(decoded.refreshToken, "refresh-token");
});

test("未显式提供 JSON 时会从本地 state.vscdb 读取 refresh_token", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "antibanana-test-"));

  try {
    const dbPath = path.join(tempDir, "state.vscdb");
    await createStateDb(dbPath, {
      oauthToken: buildUnifiedStateSyncValue({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      }),
    });

    const loaded = await loadCredentialSource({
      localStateDbPath: dbPath,
    });

    assert.equal(loaded.credentialPath, dbPath);
    assert.equal(loaded.credentialPathSource, "本地 Antigravity state.vscdb");
    assert.equal(loaded.refreshToken, "refresh-token");
    assert.equal(loaded.projectId, undefined);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("WSL 下会优先尝试 Windows 侧的默认 state.vscdb 路径", () => {
  const candidates = getDefaultAntigravityStateDbCandidates({
    platform: "linux",
    env: {
      WSL_DISTRO_NAME: "Ubuntu",
      USERPROFILE: "C:\\Users\\Alice",
    },
    homeDir: "/home/alice",
    username: "alice",
  });

  assert.equal(
    candidates[0],
    "/mnt/c/Users/Alice/AppData/Roaming/Antigravity/User/globalStorage/state.vscdb",
  );
  assert.ok(
    candidates.includes(
      "/home/alice/.config/Antigravity/User/globalStorage/state.vscdb",
    ),
  );
});

test("WSL 下手动指定的 Windows 路径会自动转换成 /mnt 路径", () => {
  const normalized = normalizeUserProvidedPath(
    "C:\\Users\\Alice\\AppData\\Roaming\\Antigravity\\User\\globalStorage\\state.vscdb",
    {
      platform: "linux",
      env: {
        WSL_DISTRO_NAME: "Ubuntu",
      },
    },
  );

  assert.equal(
    normalized,
    "/mnt/c/Users/Alice/AppData/Roaming/Antigravity/User/globalStorage/state.vscdb",
  );
});

test("非 Windows 非 WSL 环境下拒绝直接使用 Windows 路径", () => {
  assert.throws(
    () =>
      normalizeUserProvidedPath("C:\\Users\\Alice\\credential.json", {
        platform: "darwin",
        env: {},
      }),
    /当前运行平台不是 Windows 或 WSL，无法直接访问 Windows 路径/,
  );
});

test("fetchAvailableModels 会命中短 TTL 缓存", async () => {
  const client = new AntigravityClient({
    transport: {
      postJson: async () => modelsResponse,
    } as never,
    projectIdResolver: {
      getProjectId: async () => "demo-project",
    } as never,
    modelsCacheTtlMs: 30_000,
  });

  let callCount = 0;
  (client as never as {
    transport: { postJson: (pathname: string, body: unknown) => Promise<unknown> };
  }).transport.postJson = async () => {
    callCount += 1;
    return modelsResponse;
  };

  const first = await client.fetchAvailableModels();
  const second = await client.fetchAvailableModels();

  assert.equal(callCount, 1);
  assert.equal(first, second);
});

test("401 会触发一次强制刷新后再重试请求", async () => {
  let refreshCount = 0;
  let callCount = 0;

  const transport = new AntigravityTransport({
    credentialManager: {
      getAccessToken: async () => "token",
      forceRefreshAccessToken: async () => {
        refreshCount += 1;
        return "fresh-token";
      },
    } as never,
    maxRetries: 0,
  });

  (transport as never as {
    postJsonOnce: (pathname: string, body: unknown) => Promise<unknown>;
  }).postJsonOnce = async () => {
    callCount += 1;
    if (callCount === 1) {
      throw new AntigravityApiError({
        statusCode: 401,
        statusMessage: "Unauthorized",
        responseBody: '{"error":"expired"}',
      });
    }

    return modelsResponse;
  };

  const result = await transport.postJson("/v1internal:fetchAvailableModels", {});

  assert.equal(refreshCount, 1);
  assert.equal(callCount, 2);
  assert.deepEqual(result, modelsResponse);
});

test("网络级错误会按重试策略重试，但 JSON 非法不会重试", async () => {
  const retryTransport = new AntigravityTransport({
    credentialManager: {
      getAccessToken: async () => "token",
      forceRefreshAccessToken: async () => "token",
    } as never,
    maxRetries: 1,
  });

  let retryCallCount = 0;
  (retryTransport as never as {
    postJsonOnce: (pathname: string, body: unknown) => Promise<unknown>;
  }).postJsonOnce = async () => {
    retryCallCount += 1;
    if (retryCallCount === 1) {
      throw new AntigravityTransportError("network failed");
    }

    return modelsResponse;
  };

  await retryTransport.postJson("/v1internal:fetchAvailableModels", {});
  assert.equal(retryCallCount, 2);

  const jsonTransport = new AntigravityTransport({
    credentialManager: {
      getAccessToken: async () => "token",
      forceRefreshAccessToken: async () => "token",
    } as never,
    maxRetries: 2,
  });

  let jsonCallCount = 0;
  (jsonTransport as never as {
    postJsonOnce: (pathname: string, body: unknown) => Promise<unknown>;
  }).postJsonOnce = async () => {
    jsonCallCount += 1;
    throw new Error("Antigravity API 响应不是合法 JSON: bad");
  };

  await assert.rejects(() =>
    jsonTransport.postJson("/v1internal:fetchAvailableModels", {}),
  );
  assert.equal(jsonCallCount, 1);
});

test("ProjectIdResolver 会懒调用 loadCodeAssist，并在进程内缓存", async () => {
  let callCount = 0;
  const resolver = new ProjectIdResolver({
    postJson: async (_pathname, body) => {
      callCount += 1;
      assert.deepEqual(body, {
        metadata: {
          ideType: "ANTIGRAVITY",
        },
      });
      return {
        cloudaicompanionProject: "lazy-project-id",
      };
    },
  });

  const first = await resolver.getProjectId();
  const second = await resolver.getProjectId();

  assert.equal(first, "lazy-project-id");
  assert.equal(second, "lazy-project-id");
  assert.equal(callCount, 1);
  assert.equal(
    resolver.getProjectIdSource(),
    "loadCodeAssist.cloudaicompanionProject",
  );
});

test("generateImage 会通过 resolver 注入 project_id，并透传 aspectRatio", async () => {
  const client = new AntigravityClient({
    transport: {
      postJson: async (_pathname, body) => {
        capturedBody = body;
        return generateResponse;
      },
    } as never,
    projectIdResolver: {
      getProjectId: async () => "demo-project",
    } as never,
  });

  let capturedBody: unknown;
  await client.generateImage({
    prompt: "draw a cat",
    model: "gemini-3.1-flash-image",
    aspectRatio: "16:9",
  });

  assert.deepEqual(capturedBody, {
    model: "gemini-3.1-flash-image",
    project: "demo-project",
    request: {
      contents: [
        {
          role: "user",
          parts: [{ text: "draw a cat" }],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        imageConfig: {
          personGeneration: "ALLOW_ADULT",
          aspectRatio: "16:9",
        },
      },
    },
  });
});

test("配置 proxyUrl 时会使用代理 agent", () => {
  const transport = new AntigravityTransport({
    credentialManager: {
      getAccessToken: async () => "token",
      forceRefreshAccessToken: async () => "token",
    } as never,
    proxyUrl: "http://127.0.0.1:7890",
  });

  assert.ok(
    (transport as never as { agent: unknown }).agent instanceof HttpsProxyAgent,
  );
});

function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 0x7f) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  bytes.push(remaining & 0x7f);
  return Buffer.from(bytes);
}

function encodeStringField(field: number, value: string): Buffer {
  return encodeBytesField(field, Buffer.from(value, "utf8"));
}

function encodeBytesField(field: number, value: Buffer): Buffer {
  const tag = encodeVarint((field << 3) | 2);
  const length = encodeVarint(value.length);
  return Buffer.concat([tag, length, value]);
}

function buildUnifiedStateSyncValue(params: {
  accessToken: string;
  refreshToken: string;
}): string {
  const oauthInfo = Buffer.concat([
    encodeStringField(1, params.accessToken),
    encodeStringField(2, "Bearer"),
    encodeStringField(3, params.refreshToken),
  ]);
  const oauthInfoBase64 = Buffer.from(oauthInfo).toString("base64");

  const inner2 = encodeStringField(1, oauthInfoBase64);
  const inner1 = Buffer.concat([
    encodeStringField(1, "oauthTokenInfoSentinelKey"),
    encodeBytesField(2, inner2),
  ]);
  const outer = encodeBytesField(1, inner1);
  return Buffer.from(outer).toString("base64");
}

async function createStateDb(
  dbPath: string,
  params: { oauthToken: string },
): Promise<void> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  try {
    db.run("CREATE TABLE ItemTable (key TEXT, value TEXT)");
    db.run(
      "INSERT INTO ItemTable (key, value) VALUES (?, ?)",
      ["antigravityUnifiedStateSync.oauthToken", params.oauthToken],
    );

    const data = Buffer.from(db.export());
    await writeFile(dbPath, data);
  } finally {
    db.close();
  }
}
