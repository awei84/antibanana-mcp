export type McpImage = {
  candidateIndex: number;
  partIndex: number;
  mimeType: string;
  data: string;
};

export type ImageFilterMode = "largest" | "all";

const DEFAULT_IMAGE_FILTER_MODE: ImageFilterMode = "largest";

export function parseImageFilterMode(
  rawValue: string | undefined,
): ImageFilterMode {
  if (!rawValue) {
    return DEFAULT_IMAGE_FILTER_MODE;
  }

  if (rawValue === "largest" || rawValue === "all") {
    return rawValue;
  }

  throw new Error(
    `ANTIBANANA_IMAGE_FILTER 只支持 largest 或 all，当前值: ${rawValue}`,
  );
}

export function selectImagesForMcpResponse(
  images: McpImage[],
  mode: ImageFilterMode,
): McpImage[] {
  if (mode === "all" || images.length <= 1) {
    return images;
  }

  const selectedByCandidate = new Map<number, McpImage>();

  for (const image of images) {
    const current = selectedByCandidate.get(image.candidateIndex);
    if (!current || image.data.length > current.data.length) {
      selectedByCandidate.set(image.candidateIndex, image);
    }
  }

  return Array.from(selectedByCandidate.entries())
    .sort(([leftCandidateIndex], [rightCandidateIndex]) => {
      return leftCandidateIndex - rightCandidateIndex;
    })
    .map(([, image]) => image);
}
