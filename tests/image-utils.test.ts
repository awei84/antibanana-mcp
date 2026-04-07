import assert from "node:assert/strict";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readImageFile } from "../src/image-utils.ts";

test("readImageFile 能读取 PNG/JPEG/WebP 并返回正确 mimeType", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "antibanana-image-utils-"));

  try {
    const pngPath = path.join(tempDir, "demo.png");
    const jpegPath = path.join(tempDir, "demo.jpg");
    const webpPath = path.join(tempDir, "demo.webp");

    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const webpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x24, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20,
    ]);

    await writeFile(pngPath, pngBuffer);
    await writeFile(jpegPath, jpegBuffer);
    await writeFile(webpPath, webpBuffer);

    const png = await readImageFile(pngPath);
    const jpeg = await readImageFile(jpegPath);
    const webp = await readImageFile(webpPath);

    assert.equal(png.mimeType, "image/png");
    assert.equal(png.data, pngBuffer.toString("base64"));
    assert.equal(jpeg.mimeType, "image/jpeg");
    assert.equal(jpeg.data, jpegBuffer.toString("base64"));
    assert.equal(webp.mimeType, "image/webp");
    assert.equal(webp.data, webpBuffer.toString("base64"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("readImageFile 对相对路径直接报错", async () => {
  await assert.rejects(
    () => readImageFile("./demo.png"),
    /imagePaths 只接受绝对路径/,
  );
});

test("readImageFile 对不存在的文件返回真实读取错误", async () => {
  const nonExistentPath = path.join(os.tmpdir(), "antibanana-not-found.png");
  await assert.rejects(
    () => readImageFile(nonExistentPath),
    /读取图片文件失败:.+ENOENT/,
  );
});

test("readImageFile 在 WSL 下接受 Windows 绝对路径并规范化后读取", async () => {
  await assert.rejects(
    () =>
      readImageFile("C:\\Users\\Alice\\Pictures\\demo.png", {
        platform: "linux",
        env: {
          WSL_DISTRO_NAME: "Ubuntu",
        } as NodeJS.ProcessEnv,
      }),
    /读取图片文件失败: \/mnt\/c\/Users\/Alice\/Pictures\/demo\.png，ENOENT/,
  );
});

test("readImageFile 会拒绝扩展名伪装的非图片文件", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "antibanana-image-utils-"));

  try {
    const fakeImagePath = path.join(tempDir, "fake.png");
    await writeFile(fakeImagePath, Buffer.from("not-an-image", "utf8"));

    await assert.rejects(
      () => readImageFile(fakeImagePath),
      /不支持的图片格式/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("readImageFile 会拒绝超过 20MB 的图片文件", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "antibanana-image-utils-"));

  try {
    const largeImagePath = path.join(tempDir, "large.png");
    await writeFile(largeImagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await truncate(largeImagePath, 20 * 1024 * 1024 + 1);

    await assert.rejects(
      () => readImageFile(largeImagePath),
      /图片文件过大:.+最大支持 20MB/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
