#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
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
const { version: SERVER_VERSION } = createRequire(import.meta.url)(
  "../package.json",
) as { version: string };
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
  console.error(`[${SERVER_NAME}] v${SERVER_VERSION}`);
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
    version: SERVER_VERSION,
  });

  server.registerTool(
    "list_models",
    {
      description:
        "List all available image generation models and their quota information for the current Antigravity account. " +
        "Call this tool when you need to discover which models are available, check their display names, or verify remaining quota before generating images. " +
        "This is useful when the user asks about available models or when you need to select a specific model for image generation.",
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
      description:
        "Check the remaining image generation quota for a specific model. " +
        "Call this tool before generating images to ensure sufficient quota remains, or when the user asks about their usage limits. " +
        "The quota resets periodically (typically every few hours). Returns the remaining fraction (0.0 to 1.0) and the next reset time.",
      inputSchema: {
        model: z
          .string()
          .optional()
          .describe("Model ID to check quota for. Defaults to gemini-3.1-flash-image if not specified."),
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
      description:
        "Generate an image or edit existing images based on a text prompt. The resulting image will be returned as base64-encoded data. " +
        "You can use this tool to generate user interfaces and iterate on a design with the user for an application or website that you are building. " +
        "When creating UI designs, generate only the interface itself without surrounding device frames (laptops, phones, tablets, etc.) unless the user explicitly requests them. " +
        "You can also use this tool to generate assets, illustrations, icons, diagrams, or any visual content described by the user. " +
        "IMPORTANT: Always write the prompt in English for best results, even if the user's request is in another language. " +
        "IMPORTANT: If the user asks to save the image locally or mentions a file path or desktop, you MUST set the outputPath parameter (e.g. ~/Desktop/image.jpg). The MCP server will write the file to disk directly — do NOT write it yourself.",
      inputSchema: {
        prompt: z.string().min(1).describe("Text description of the image to generate. Must be written in English. Be specific and detailed for best results."),
        model: z
          .string()
          .optional()
          .describe("Model ID for image generation. Defaults to gemini-3.1-flash-image."),
        aspectRatio: aspectRatioSchema
          .optional()
          .describe("Aspect ratio of the output image, e.g. 1:1, 16:9, 9:16, 4:3."),
        imageSize: z
          .enum(["512", "1K", "2K", "4K"])
          .optional()
          .describe(
            "Output resolution: 512, 1K, 2K, or 4K. Defaults to 1K if not specified. The K must be uppercase. " +
            "IMPORTANT: This parameter is NOT part of the standard Antigravity IDE interface. " +
            "Using non-default values (2K/4K) consumes more quota and may carry a risk of account flagging. " +
            "Do NOT set this unless the user explicitly requests a specific resolution. " +
            "When a user requests high resolution, inform them of the quota cost and potential risk before proceeding.",
          ),
        outputPath: z
          .string()
          .optional()
          .describe(
            "Optional local file path to save the generated image (e.g. ~/Desktop/puppy.jpg). " +
            "Supports ~ for home directory. If provided, the image is saved to disk and the saved path is returned. " +
            "Use this when the user asks to save the image to a specific location.",
          ),
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
        savedPaths: z.array(z.string()).optional(),
      },
    },
    async ({ prompt, model, aspectRatio, imageSize, outputPath }) => {
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

      // 如果指定了 outputPath，将图片保存到本地磁盘
      const savedPaths: string[] = [];
      if (outputPath) {
        const expandedBase = outputPath.startsWith("~/")
          ? resolve(homedir(), outputPath.slice(2))
          : resolve(outputPath);

        for (let i = 0; i < selectedImages.length; i++) {
          const img = selectedImages[i];
          // 多张图时自动加序号后缀，单张保持原文件名
          const filePath = selectedImages.length > 1
            ? expandedBase.replace(/(\.\w+)$/, `_${i + 1}$1`)
            : expandedBase;
          await mkdir(dirname(filePath), { recursive: true });
          await writeFile(filePath, Buffer.from(img.data, "base64"));
          savedPaths.push(filePath);
        }
      }

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
          ...(savedPaths.length > 0 ? { savedPaths } : {}),
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
