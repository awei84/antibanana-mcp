#!/usr/bin/env tsx
/**
 * 临时测试脚本：生成图片并打印每张图的 base64 大小，推断分辨率
 * 用法: npx tsx scripts/test-image-size.ts
 */

import { AntigravityTransport } from "../src/antigravity-transport.js";
import { AntigravityClient } from "../src/antigravity-client.js";
import { CredentialManager, loadCredentialSource } from "../src/credentials.js";
import { ProjectIdResolver } from "../src/project-id-resolver.js";

async function main() {
  const loadedCredentialSource = await loadCredentialSource({
    credentialPath: process.env.ANTIBANANA_CREDENTIALS_PATH,
    credentialPathSource: "env.ANTIBANANA_CREDENTIALS_PATH",
  });
  const credentialManager = CredentialManager.fromLoadedSource(loadedCredentialSource);

  const transport = new AntigravityTransport({
    credentialManager,
    proxyUrl: process.env.ANTIBANANA_PROXY_URL ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY,
  });

  const projectIdResolver = new ProjectIdResolver({
    postJson: transport.postJson.bind(transport),
    initialProjectId: process.env.ANTIBANANA_PROJECT_ID ?? loadedCredentialSource.projectId,
    initialProjectIdSource: process.env.ANTIBANANA_PROJECT_ID
      ? "env.ANTIBANANA_PROJECT_ID"
      : loadedCredentialSource.projectIdSource,
  });

  const client = new AntigravityClient({ transport, projectIdResolver });

  const cases = [
    { prompt: "a red apple on white background", aspectRatio: "1:1", imageSize: undefined },
    { prompt: "a red apple on white background", aspectRatio: "1:1", imageSize: "2K" },
    { prompt: "a red apple on white background", aspectRatio: "1:1", imageSize: "4K" },
  ];

  for (const c of cases) {
    console.log(`\n=== aspectRatio: ${c.aspectRatio} imageSize: ${c.imageSize ?? "默认(1K)"} ===`);
    const result = await client.generateImage({ prompt: c.prompt, model: "gemini-3.1-flash-image", aspectRatio: c.aspectRatio, imageSize: c.imageSize });

    result.response.candidates.forEach((candidate, ci) => {
      candidate.content.parts.forEach((part, pi) => {
        if (!part.inlineData) return;
        const { mimeType, data } = part.inlineData;
        const base64Len = data.length;
        const estimatedKB = Math.round((base64Len * 3) / 4 / 1024);
        console.log(`  candidate[${ci}] part[${pi}] mimeType=${mimeType} base64长度=${base64Len} 估算大小≈${estimatedKB}KB`);
      });
    });

    console.log(`  candidates 数量: ${result.response.candidates.length}`);
    console.log(`  modelVersion: ${result.response.modelVersion}`);
  }
}

main().catch(console.error);
