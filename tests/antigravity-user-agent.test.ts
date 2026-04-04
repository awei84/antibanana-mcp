import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUserAgent,
  resetAntigravityUserAgentCacheForTest,
  resolveDefaultAntigravityUserAgent,
} from "../src/antigravity-user-agent.ts";

test("buildUserAgent 会拼接指定版本与运行时平台信息", () => {
  assert.equal(
    buildUserAgent("1.21.9", {
      platform: "darwin",
      arch: "arm64",
    }),
    "antigravity/1.21.9 darwin/arm64",
  );
});

test("resolveDefaultAntigravityUserAgent 会从 releases 接口读取版本并命中缓存", async () => {
  resetAntigravityUserAgentCacheForTest();

  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount += 1;
    return {
      ok: true,
      json: async () => [
        {
          version: "9.9.9",
          execution_id: "exec-1",
        },
      ],
    } as Response;
  }) as typeof fetch;

  try {
    const first = await resolveDefaultAntigravityUserAgent();
    const second = await resolveDefaultAntigravityUserAgent();

    assert.match(first, /^antigravity\/9\.9\.9 /);
    assert.equal(second, first);
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetAntigravityUserAgentCacheForTest();
  }
});

test("releases 接口失败时会回退到内置版本", async () => {
  resetAntigravityUserAgentCacheForTest();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 503,
      json: async () => [],
    }) as Response) as typeof fetch;

  try {
    const userAgent = await resolveDefaultAntigravityUserAgent();
    assert.match(userAgent, /^antigravity\/1\.21\.9 /);
  } finally {
    globalThis.fetch = originalFetch;
    resetAntigravityUserAgentCacheForTest();
  }
});
