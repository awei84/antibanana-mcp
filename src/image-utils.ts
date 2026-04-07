import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { normalizeUserProvidedPath } from "./local-antigravity-db.js";

export type InputImage = {
  mimeType: string;
  data: string;
};

const MAX_INPUT_IMAGE_BYTES = 20 * 1024 * 1024;
const WINDOWS_ABSOLUTE_PATH_RE = /^[A-Za-z]:[\\/]/;

type ImagePathRuntime = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
};

export async function readImageFile(
  filePath: string,
  runtime: ImagePathRuntime = {},
): Promise<InputImage> {
  if (!isAbsoluteImagePath(filePath)) {
    throw new Error(`imagePaths 只接受绝对路径，当前传入: ${filePath}`);
  }

  const normalizedPath = normalizeUserProvidedPath(filePath, runtime);

  let fileStat;
  try {
    fileStat = await stat(normalizedPath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`读取图片文件失败: ${normalizedPath}，${reason}`);
  }

  if (fileStat.size > MAX_INPUT_IMAGE_BYTES) {
    throw new Error(
      `图片文件过大: ${normalizedPath}，最大支持 ${Math.floor(MAX_INPUT_IMAGE_BYTES / 1024 / 1024)}MB`,
    );
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(normalizedPath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`读取图片文件失败: ${normalizedPath}，${reason}`);
  }

  const mimeType = detectSupportedImageMimeType(fileBuffer);
  if (!mimeType) {
    throw new Error(
      `不支持的图片格式: ${normalizedPath}，仅支持 PNG、JPEG、WebP，且会校验文件头`,
    );
  }

  return {
    mimeType,
    data: fileBuffer.toString("base64"),
  };
}

function isAbsoluteImagePath(filePath: string): boolean {
  return path.isAbsolute(filePath) || WINDOWS_ABSOLUTE_PATH_RE.test(filePath);
}

function detectSupportedImageMimeType(buffer: Buffer): string | null {
  if (isPng(buffer)) {
    return "image/png";
  }

  if (isJpeg(buffer)) {
    return "image/jpeg";
  }

  if (isWebp(buffer)) {
    return "image/webp";
  }

  return null;
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

function isJpeg(buffer: Buffer): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}
