export type SelectedImage = {
  candidateIndex: number;
  partIndex: number;
  mimeType: string;
  data: string;
};

type GenerateImageToolResponseParams = {
  selectedImages: SelectedImage[];
  savedPaths: string[];
  modelId: string;
  modelVersion: string | null;
  responseId: string | null;
  traceId: string | null;
  finishReasons: Array<string | null>;
  requestedAspectRatio: string | null;
};

export function buildGenerateImageToolResponse({
  selectedImages,
  savedPaths,
  modelId,
  modelVersion,
  responseId,
  traceId,
  finishReasons,
  requestedAspectRatio,
}: GenerateImageToolResponseParams) {
  const structuredImages = selectedImages.map(
    ({ candidateIndex, partIndex, mimeType }) => ({
      candidateIndex,
      partIndex,
      mimeType,
    }),
  );

  const content = savedPaths.length > 0
    ? [
        {
          type: "text" as const,
          text: `图片已保存到: ${savedPaths.join(", ")}`,
        },
      ]
    : selectedImages.map(({ mimeType, data }) => ({
        type: "image" as const,
        mimeType,
        data,
      }));

  return {
    content,
    structuredContent: {
      model: modelId,
      modelVersion,
      responseId,
      traceId,
      finishReasons,
      imageCount: selectedImages.length,
      images: structuredImages,
      requestedAspectRatio,
      ...(savedPaths.length > 0 ? { savedPaths } : {}),
    },
  };
}
