import {
  fetchAvailableModelsResponseSchema,
  generateContentResponseSchema,
  type FetchAvailableModelsResponse,
  type GenerateContentResponse,
} from "./types.js";
import {
  AntigravityApiError,
  AntigravityTransportError,
  type AntigravityTransport,
} from "./antigravity-transport.js";
import type { ProjectIdResolver } from "./project-id-resolver.js";

const DEFAULT_MODEL_CACHE_TTL_MS = 30_000;

export { AntigravityApiError, AntigravityTransportError };

export class AntigravityClient {
  private readonly transport: Pick<AntigravityTransport, "postJson">;
  private readonly projectIdResolver: Pick<ProjectIdResolver, "getProjectId">;
  private readonly modelsCacheTtlMs: number;

  private modelsCache?: {
    expiresAt: number;
    value: FetchAvailableModelsResponse;
  };
  private modelsRequestInFlight?: Promise<FetchAvailableModelsResponse>;

  constructor(options: {
    transport: Pick<AntigravityTransport, "postJson">;
    projectIdResolver: Pick<ProjectIdResolver, "getProjectId">;
    modelsCacheTtlMs?: number;
  }) {
    this.transport = options.transport;
    this.projectIdResolver = options.projectIdResolver;
    this.modelsCacheTtlMs = options.modelsCacheTtlMs ?? DEFAULT_MODEL_CACHE_TTL_MS;
  }

  async fetchAvailableModels(): Promise<FetchAvailableModelsResponse> {
    if (
      this.modelsCacheTtlMs > 0 &&
      this.modelsCache &&
      this.modelsCache.expiresAt > Date.now()
    ) {
      return this.modelsCache.value;
    }

    if (this.modelsRequestInFlight) {
      return this.modelsRequestInFlight;
    }

    const request = (async () => {
      const response = await this.transport.postJson(
        "/v1internal:fetchAvailableModels",
        {},
      );
      const parsed = fetchAvailableModelsResponseSchema.parse(response);
      if (this.modelsCacheTtlMs > 0) {
        this.modelsCache = {
          expiresAt: Date.now() + this.modelsCacheTtlMs,
          value: parsed,
        };
      }
      return parsed;
    })();

    this.modelsRequestInFlight = request;

    try {
      return await request;
    } finally {
      this.modelsRequestInFlight = undefined;
    }
  }

  async generateImage(params: {
    prompt: string;
    model: string;
    aspectRatio?: string;
    imageSize?: string;
  }): Promise<GenerateContentResponse> {
    const projectId = await this.projectIdResolver.getProjectId();
    const response = await this.transport.postJson("/v1internal:generateContent", {
      model: params.model,
      project: projectId,
      request: {
        contents: [
          {
            role: "user",
            parts: [{ text: params.prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {
            personGeneration: "ALLOW_ADULT",
            ...(params.aspectRatio ? { aspectRatio: params.aspectRatio } : {}),
            ...(params.imageSize ? { imageSize: params.imageSize } : {}),
          },
        },
      },
    });

    return generateContentResponseSchema.parse(response);
  }
}
