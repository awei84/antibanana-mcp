type DecodeVarintResult = {
  value: number;
  nextOffset: number;
};

export function decodeVarint(
  buffer: Uint8Array,
  offset: number,
): DecodeVarintResult {
  let value = 0;
  let shift = 0;
  let cursor = offset;

  while (cursor < buffer.length) {
    const byte = buffer[cursor];
    cursor += 1;
    value |= (byte & 0x7f) << shift;
    shift += 7;

    if ((byte & 0x80) === 0) {
      return { value, nextOffset: cursor };
    }
  }

  throw new Error("protobuf varint 解码失败：数据意外结束");
}

export function extractLengthDelimitedField(
  buffer: Uint8Array,
  fieldNumber: number,
): Uint8Array | undefined {
  let offset = 0;

  while (offset < buffer.length) {
    const tag = decodeVarint(buffer, offset);
    offset = tag.nextOffset;
    const wireType = tag.value & 0x7;
    const field = tag.value >> 3;

    if (wireType === 2) {
      const length = decodeVarint(buffer, offset);
      offset = length.nextOffset;
      const endOffset = offset + length.value;
      if (endOffset > buffer.length) {
        throw new Error("protobuf length-delimited 字段越界");
      }

      const value = buffer.slice(offset, endOffset);
      if (field === fieldNumber) {
        return value;
      }
      offset = endOffset;
      continue;
    }

    if (wireType === 0) {
      offset = decodeVarint(buffer, offset).nextOffset;
      continue;
    }

    if (wireType === 1) {
      offset += 8;
      continue;
    }

    if (wireType === 5) {
      offset += 4;
      continue;
    }

    throw new Error(`不支持的 protobuf wire type: ${wireType}`);
  }

  return undefined;
}

export function decodeAntigravityOauthToken(rawBase64: string): {
  accessToken?: string;
  refreshToken: string;
} {
  const outer = new Uint8Array(Buffer.from(rawBase64, "base64"));
  const field1 = extractLengthDelimitedField(outer, 1);
  if (!field1) {
    throw new Error("未找到 antigravityUnifiedStateSync.oauthToken 外层 field 1");
  }

  const inner = extractLengthDelimitedField(field1, 2);
  if (!inner) {
    throw new Error("未找到 antigravityUnifiedStateSync.oauthToken 内层 field 2");
  }

  const oauthInfoBase64Bytes = extractLengthDelimitedField(inner, 1);
  if (!oauthInfoBase64Bytes) {
    throw new Error("未找到 antigravityUnifiedStateSync.oauthToken oauthInfo");
  }

  const oauthInfoBase64 = Buffer.from(oauthInfoBase64Bytes).toString("utf8");
  const oauthInfo = new Uint8Array(Buffer.from(oauthInfoBase64, "base64"));

  const accessTokenBytes = extractLengthDelimitedField(oauthInfo, 1);
  const refreshTokenBytes = extractLengthDelimitedField(oauthInfo, 3);

  if (!refreshTokenBytes) {
    throw new Error("未能从 antigravityUnifiedStateSync.oauthToken 中提取 refresh_token");
  }

  return {
    accessToken: accessTokenBytes
      ? Buffer.from(accessTokenBytes).toString("utf8")
      : undefined,
    refreshToken: Buffer.from(refreshTokenBytes).toString("utf8"),
  };
}
