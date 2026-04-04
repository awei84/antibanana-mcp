import assert from "node:assert/strict";
import test from "node:test";

import { buildGenerateImageToolResponse } from "../src/generate-image-response.ts";

const selectedImages = [
  {
    candidateIndex: 0,
    partIndex: 1,
    mimeType: "image/png",
    data: "base64-image-1",
  },
  {
    candidateIndex: 1,
    partIndex: 0,
    mimeType: "image/jpeg",
    data: "base64-image-2",
  },
];

test("未指定 outputPath 时仍返回 inline image content", () => {
  const response = buildGenerateImageToolResponse({
    selectedImages,
    savedPaths: [],
    modelId: "gemini-3.1-flash-image",
    modelVersion: "gemini-3.1-flash-image",
    responseId: "resp-1",
    traceId: "trace-1",
    finishReasons: ["STOP", "STOP"],
    requestedAspectRatio: "16:9",
  });

  assert.deepEqual(response.content, [
    {
      type: "image",
      mimeType: "image/png",
      data: "base64-image-1",
    },
    {
      type: "image",
      mimeType: "image/jpeg",
      data: "base64-image-2",
    },
  ]);
  assert.equal(response.structuredContent.imageCount, 2);
  assert.deepEqual(response.structuredContent.images, [
    {
      candidateIndex: 0,
      partIndex: 1,
      mimeType: "image/png",
    },
    {
      candidateIndex: 1,
      partIndex: 0,
      mimeType: "image/jpeg",
    },
  ]);
  assert.equal("savedPaths" in response.structuredContent, false);
});

test("指定 outputPath 时只返回文本确认和 savedPaths，不回传 base64", () => {
  const response = buildGenerateImageToolResponse({
    selectedImages,
    savedPaths: ["/tmp/cat_1.png", "/tmp/cat_2.png"],
    modelId: "gemini-3.1-flash-image",
    modelVersion: "gemini-3.1-flash-image",
    responseId: "resp-1",
    traceId: "trace-1",
    finishReasons: ["STOP", "STOP"],
    requestedAspectRatio: null,
  });

  assert.deepEqual(response.content, [
    {
      type: "text",
      text: "图片已保存到: /tmp/cat_1.png, /tmp/cat_2.png",
    },
  ]);
  assert.equal(response.structuredContent.imageCount, 2);
  assert.deepEqual(response.structuredContent.savedPaths, [
    "/tmp/cat_1.png",
    "/tmp/cat_2.png",
  ]);
  assert.deepEqual(response.structuredContent.images, [
    {
      candidateIndex: 0,
      partIndex: 1,
      mimeType: "image/png",
    },
    {
      candidateIndex: 1,
      partIndex: 0,
      mimeType: "image/jpeg",
    },
  ]);
});
