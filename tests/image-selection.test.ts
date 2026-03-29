import assert from "node:assert/strict";
import test from "node:test";

import {
  parseImageFilterMode,
  selectImagesForMcpResponse,
} from "../src/image-selection.ts";

test("未设置 ANTIBANANA_IMAGE_FILTER 时默认使用 largest", () => {
  assert.equal(parseImageFilterMode(undefined), "largest");
});

test("ANTIBANANA_IMAGE_FILTER 只接受 largest 或 all", () => {
  assert.equal(parseImageFilterMode("largest"), "largest");
  assert.equal(parseImageFilterMode("all"), "all");
  assert.throws(
    () => parseImageFilterMode("thumbnail"),
    /ANTIBANANA_IMAGE_FILTER 只支持 largest 或 all/,
  );
});

test("largest 模式会按 candidate 保留 base64 最大的一张图", () => {
  const selected = selectImagesForMcpResponse(
    [
      {
        candidateIndex: 1,
        partIndex: 0,
        mimeType: "image/png",
        data: "1234",
      },
      {
        candidateIndex: 0,
        partIndex: 0,
        mimeType: "image/png",
        data: "12",
      },
      {
        candidateIndex: 0,
        partIndex: 2,
        mimeType: "image/png",
        data: "123456",
      },
      {
        candidateIndex: 1,
        partIndex: 1,
        mimeType: "image/png",
        data: "12345678",
      },
    ],
    "largest",
  );

  assert.deepEqual(selected, [
    {
      candidateIndex: 0,
      partIndex: 2,
      mimeType: "image/png",
      data: "123456",
    },
    {
      candidateIndex: 1,
      partIndex: 1,
      mimeType: "image/png",
      data: "12345678",
    },
  ]);
});

test("all 模式会保留后端返回的所有图片及顺序", () => {
  const images = [
    {
      candidateIndex: 0,
      partIndex: 0,
      mimeType: "image/png",
      data: "12",
    },
    {
      candidateIndex: 0,
      partIndex: 1,
      mimeType: "image/png",
      data: "123",
    },
  ];

  assert.equal(selectImagesForMcpResponse(images, "all"), images);
});
