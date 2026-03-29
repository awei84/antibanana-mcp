#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

import { AntigravityTransport } from "./antigravity-transport.js";
import { AntigravityClient } from "./antigravity-client.js";
import { CredentialManager, loadCredentialSource } from "./credentials.js";
import {
  parseImageFilterMode,
  selectImagesForMcpResponse,
} from "./image-selection.js";
import { ProjectIdResolver } from "./project-id-resolver.js";

const SERVER_NAME = "antibanana-mcp";
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
const aspectRatioSchema = z
  .string()
  .regex(/^\d+:\d+$/, "aspectRatio 必须是类似 1:1、16:9、9:16 的比例字符串");

async function main(): Promise<void> {
  const loadedCredentialSource = await loadCredentialSource({
    credentialPath: process.env.ANTIBANANA_CREDENTIALS_PATH,
    credentialPathSource: "env.ANTIBANANA_CREDENTIALS_PATH",
  });
  const credentialManager = CredentialManager.fromLoadedSource(
    loadedCredentialSource,
  );
  console.error(
    `[${SERVER_NAME}] 使用凭证: ${credentialManager.credentialPath} (${credentialManager.credentialPathSource})`,
  );

  const transport = new AntigravityTransport({
    credentialManager,
    baseUrl: process.env.ANTIBANANA_BASE_URL,
    userAgent: process.env.ANTIBANANA_USER_AGENT,
    timeoutMs: parseTimeout(process.env.ANTIBANANA_TIMEOUT_MS),
    proxyUrl:
      process.env.ANTIBANANA_PROXY_URL ??
      process.env.HTTPS_PROXY ??
      process.env.HTTP_PROXY,
    maxRetries: parseNonNegativeInteger(
      process.env.ANTIBANANA_MAX_RETRIES,
      "ANTIBANANA_MAX_RETRIES",
    ),
  });
  const projectIdResolver = new ProjectIdResolver({
    postJson: transport.postJson.bind(transport),
    initialProjectId:
      process.env.ANTIBANANA_PROJECT_ID ?? loadedCredentialSource.projectId,
    initialProjectIdSource: process.env.ANTIBANANA_PROJECT_ID
      ? "env.ANTIBANANA_PROJECT_ID"
      : loadedCredentialSource.projectIdSource,
  });

  const initialProjectIdSource = projectIdResolver.getProjectIdSource();
  if (initialProjectIdSource) {
    console.error(
      `[${SERVER_NAME}] 使用 project_id: ${await projectIdResolver.getProjectId()} (${initialProjectIdSource})`,
    );
  } else {
    console.error(
      `[${SERVER_NAME}] project_id 将在首次 generate_image 时通过 loadCodeAssist 自动获取`,
    );
  }

  const client = new AntigravityClient({
    transport,
    projectIdResolver,
    modelsCacheTtlMs: parseNonNegativeInteger(
      process.env.ANTIBANANA_MODEL_CACHE_TTL_MS,
      "ANTIBANANA_MODEL_CACHE_TTL_MS",
    ),
  });
  const imageFilterMode = parseImageFilterMode(
    process.env.ANTIBANANA_IMAGE_FILTER,
  );

  const server = new McpServer({
    name: SERVER_NAME,
    version: "0.1.0",
  });

  server.registerTool(
    "list_models",
    {
      description: "列出 Antigravity 当前账号可用的生图模型与配额信息",
      outputSchema: {
        imageModels: z.array(
          z.object({
            id: z.string(),
            displayName: z.string().nullable(),
            remainingFraction: z.number().nullable(),
            resetTime: z.string().nullable(),
            apiProvider: z.string().nullable(),
            modelProvider: z.string().nullable(),
          }),
        ),
      },
    },
    async () => {
      const modelsResponse = await client.fetchAvailableModels();
      const imageModels = modelsResponse.imageGenerationModelIds.map((id) => {
        const model = modelsResponse.models[id];

        return {
          id,
          displayName: model?.displayName ?? null,
          remainingFraction: model?.quotaInfo?.remainingFraction ?? null,
          resetTime: model?.quotaInfo?.resetTime ?? null,
          apiProvider: model?.apiProvider ?? null,
          modelProvider: model?.modelProvider ?? null,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ imageModels }, null, 2),
          },
        ],
        structuredContent: { imageModels },
      };
    },
  );

  server.registerTool(
    "check_quota",
    {
      description: "查询指定生图模型的剩余配额",
      inputSchema: {
        model: z
          .string()
          .optional()
          .describe("模型 ID，默认查询 gemini-3.1-flash-image"),
      },
      outputSchema: {
        model: z.string(),
        displayName: z.string().nullable(),
        remainingFraction: z.number().nullable(),
        resetTime: z.string().nullable(),
      },
    },
    async ({ model }) => {
      const modelId = model ?? DEFAULT_IMAGE_MODEL;
      const modelsResponse = await client.fetchAvailableModels();
      const matchedModel = modelsResponse.models[modelId];

      if (!matchedModel) {
        throw new Error(`未找到模型 ${modelId}，请先调用 list_models 确认可用模型`);
      }

      const quota = {
        model: modelId,
        displayName: matchedModel.displayName ?? null,
        remainingFraction: matchedModel.quotaInfo?.remainingFraction ?? null,
        resetTime: matchedModel.quotaInfo?.resetTime ?? null,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(quota, null, 2),
          },
        ],
        structuredContent: quota,
      };
    },
  );

  server.registerTool(
    "generate_image",
    {
      description: "调用 Antigravity 的图像生成能力生成图片",
      inputSchema: {
        prompt: z.string().min(1).describe("生图提示词"),
        model: z
          .string()
          .optional()
          .describe("模型 ID，默认使用 gemini-3.1-flash-image"),
        aspectRatio: aspectRatioSchema
          .optional()
          .describe("图片宽高比，例如 1:1、16:9、9:16、4:3"),
        imageSize: z
          .enum(["512", "1K", "2K", "4K"])
          .optional()
          .describe("输出分辨率，支持 512、1K、2K、4K，默认 1K（注意 K 须大写）"),
      },
      outputSchema: {
        model: z.string(),
        modelVersion: z.string().nullable(),
        responseId: z.string().nullable(),
        traceId: z.string().nullable(),
        finishReasons: z.array(z.string().nullable()),
        imageCount: z.number(),
        images: z.array(
          z.object({
            candidateIndex: z.number(),
            partIndex: z.number(),
            mimeType: z.string(),
          }),
        ),
        requestedAspectRatio: z.string().nullable(),
      },
    },
    async ({ prompt, model, aspectRatio, imageSize }) => {
      const modelId = model ?? DEFAULT_IMAGE_MODEL;
      const result = await client.generateImage({
        prompt,
        model: modelId,
        aspectRatio,
        imageSize,
      });

      const images: Array<{
        candidateIndex: number;
        partIndex: number;
        mimeType: string;
        data: string;
      }> = [];
      const finishReasons = result.response.candidates.map(
        (candidate) => candidate.finishReason ?? null,
      );

      result.response.candidates.forEach((candidate, candidateIndex) => {
        candidate.content.parts.forEach((part, partIndex) => {
          if (!part.inlineData) {
            return;
          }

          images.push({
            candidateIndex,
            partIndex,
            mimeType: part.inlineData.mimeType,
            data: part.inlineData.data,
          });
        });
      });

      if (images.length === 0) {
        throw new Error("Antigravity 未返回任何图片数据");
      }

      const selectedImages = selectImagesForMcpResponse(images, imageFilterMode);
      const structuredImages = selectedImages.map(
        ({ candidateIndex, partIndex, mimeType }) => ({
          candidateIndex,
          partIndex,
          mimeType,
        }),
      );

      return {
        content: selectedImages.map(({ mimeType, data }) => ({
          type: "image" as const,
          mimeType,
          data,
        })),
        structuredContent: {
          model: modelId,
          modelVersion: result.response.modelVersion ?? null,
          responseId: result.response.responseId ?? null,
          traceId: result.traceId ?? null,
          finishReasons,
          imageCount: selectedImages.length,
          images: structuredImages,
          requestedAspectRatio: aspectRatio ?? null,
        },
      };
    },
  );

  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}

function parseTimeout(rawValue: string | undefined): number | undefined {
  if (!rawValue) {
    return undefined;
  }

  const timeoutMs = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`ANTIBANANA_TIMEOUT_MS 必须是正整数，当前值: ${rawValue}`);
  }

  return timeoutMs;
}

function parseNonNegativeInteger(
  rawValue: string | undefined,
  envName: string,
): number | undefined {
  if (!rawValue) {
    return undefined;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${envName} 必须是非负整数，当前值: ${rawValue}`);
  }

  return value;
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] 启动失败`);
  console.error(error);
  process.exitCode = 1;
});
