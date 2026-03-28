import { z } from "zod/v4";

export const credentialFileSchema = z.object({
  access_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1),
  expired: z.string().min(1).optional(),
  expiry_date: z.number().int().positive().optional(),
  expires_in: z.number().int().positive().optional(),
  project: z.string().min(1).optional(),
  project_id: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
});

export type CredentialFile = z.infer<typeof credentialFileSchema>;

export const fetchAvailableModelsResponseSchema = z.object({
  models: z.record(
    z.string(),
    z.object({
      displayName: z.string().optional(),
      tokenizerType: z.string().optional(),
      quotaInfo: z
        .object({
          remainingFraction: z.number().optional(),
          resetTime: z.string().optional(),
        })
        .optional(),
      model: z.string().optional(),
      apiProvider: z.string().optional(),
      modelProvider: z.string().optional(),
    }),
  ),
  imageGenerationModelIds: z.array(z.string()),
  defaultAgentModelId: z.string().optional(),
});

export type FetchAvailableModelsResponse = z.infer<
  typeof fetchAvailableModelsResponseSchema
>;

export const generateContentResponseSchema = z.object({
  response: z.object({
    candidates: z.array(
      z.object({
        content: z.object({
          role: z.string().optional(),
          parts: z.array(
            z.object({
              text: z.string().optional(),
              inlineData: z
                .object({
                  mimeType: z.string(),
                  data: z.string(),
                })
                .optional(),
            }),
          ),
        }),
        finishReason: z.string().optional(),
      }),
    ),
    usageMetadata: z
      .object({
        promptTokenCount: z.number().optional(),
        candidatesTokenCount: z.number().optional(),
        totalTokenCount: z.number().optional(),
      })
      .optional(),
    modelVersion: z.string().optional(),
    responseId: z.string().optional(),
  }),
  traceId: z.string().optional(),
});

export type GenerateContentResponse = z.infer<
  typeof generateContentResponseSchema
>;

export const loadCodeAssistResponseSchema = z.object({
  cloudaicompanionProject: z.string().min(1),
});

export type LoadCodeAssistResponse = z.infer<typeof loadCodeAssistResponseSchema>;
